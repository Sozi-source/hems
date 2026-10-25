import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processSmsQueue } from '@/lib/sms/processor';

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
    const amountMinor = typeof body.amountMinor === 'number'
      ? body.amountMinor
      : parseInt(body.amountMinor || '0', 10);
    const obligationId = typeof body.obligationId === 'string' && body.obligationId.trim()
      ? body.obligationId.trim()
      : null;
    const receiptRef = typeof body.receiptRef === 'string' && body.receiptRef.trim()
      ? body.receiptRef.trim()
      : null;
    const paidAt = typeof body.paidAt === 'string' && body.paidAt.trim()
      ? body.paidAt.trim()
      : new Date().toISOString();
    const note = typeof body.note === 'string' && body.note.trim()
      ? body.note.trim()
      : 'Paper cash payment received at counter';

    if (!businessId || !customerId) {
      return NextResponse.json(
        { error: 'businessId and customerId are required' },
        { status: 400 }
      );
    }

    if (isNaN(amountMinor) || amountMinor <= 0) {
      return NextResponse.json(
        { error: 'A positive cash payment amount is required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Role verification: cashier, accountant, admin, owner can record cash payments
    const { data: member } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!member || !['owner', 'admin', 'accountant', 'cashier'].includes(member.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // 2. Validate customer & business
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .select('id, full_name, phone, customer_no')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .single();

    if (custErr || !customer) {
      return NextResponse.json(
        { error: 'Customer not found in this business' },
        { status: 404 }
      );
    }

    const { data: business } = await admin
      .from('businesses')
      .select('id, code, name')
      .eq('id', businessId)
      .single();

    let paymentId: string | null = null;
    let transactionRef: string = receiptRef || '';
    let allocatedMinor = 0;
    let unallocatedMinor = amountMinor;
    let newBalanceMinor = 0;

    // 3. Try record_cash_payment database function first
    const { data: rpcData, error: rpcError } = await admin.rpc('record_cash_payment', {
      p_business: businessId,
      p_customer: customerId,
      p_amount_minor: amountMinor,
      p_obligation_id: obligationId,
      p_receipt_ref: receiptRef,
      p_paid_at: paidAt,
      p_note: note,
    });

    if (!rpcError && rpcData) {
      paymentId = rpcData.payment_id;
      transactionRef = rpcData.transaction_ref;
      allocatedMinor = Number(rpcData.allocated_minor || 0);
      unallocatedMinor = Number(rpcData.unallocated_minor || 0);
      newBalanceMinor = Number(rpcData.new_balance_minor || 0);
    } else {
      // Fallback: Atomic ingest + approve pipeline using standard DB functions
      const bizCode = business?.code || 'BIZ';

      if (!transactionRef) {
        const { data: numData } = await admin.rpc('next_number', {
          p_business: businessId,
          p_name: 'cash_payment',
          p_prefix: `CSH-${bizCode}-`,
          p_pad: 4,
        });
        transactionRef = numData || `CSH-${bizCode}-${Date.now().toString().slice(-4)}`;
      }

      // Check open debts for customer
      const { data: openDebts } = await admin
        .from('v_obligation_overview')
        .select('id, balance_minor, issue_date, created_at')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .eq('kind', 'customer_debt')
        .in('status', ['open', 'partially_paid'])
        .gt('balance_minor', 0)
        .order('issue_date', { ascending: true });

      const debtsList = openDebts || [];
      const allocations: Array<{ obligation_id: string; amount_minor: string }> = [];
      let remMinor = amountMinor;

      // Prioritize selected obligation if supplied
      if (obligationId) {
        const target = debtsList.find((d) => d.id === obligationId);
        if (target && target.balance_minor > 0) {
          const alloc = Math.min(remMinor, Number(target.balance_minor));
          allocations.push({
            obligation_id: target.id,
            amount_minor: alloc.toString(),
          });
          remMinor -= alloc;
          allocatedMinor += alloc;
        }
      }

      // Allocate remainder across older debts (FIFO)
      if (remMinor > 0) {
        for (const d of debtsList) {
          if (obligationId && d.id === obligationId) continue;
          if (remMinor <= 0) break;
          const bal = Number(d.balance_minor || 0);
          if (bal > 0) {
            const alloc = Math.min(remMinor, bal);
            allocations.push({
              obligation_id: d.id,
              amount_minor: alloc.toString(),
            });
            remMinor -= alloc;
            allocatedMinor += alloc;
          }
        }
      }

      unallocatedMinor = remMinor;

      // Ingest cash payment transaction
      const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_payment', {
        p: {
          provider: 'cash',
          transaction_ref: transactionRef,
          source: 'manual',
          direction: 'in',
          amount_minor: amountMinor,
          business_id: businessId,
          shortcode: `CASH-${bizCode}`,
          payer_name: customer.full_name,
          payer_msisdn: customer.phone,
          account_reference: customer.customer_no,
          occurred_at: paidAt,
          raw_text: `Cash payment of KES ${(amountMinor / 100).toLocaleString()} received for ${customer.full_name}`,
          description: `Cash payment (${transactionRef}) from ${customer.full_name}`,
        },
      });

      if (ingestError || !ingestResult?.payment_id) {
        return NextResponse.json(
          { error: ingestError?.message || 'Failed to ingest cash payment transaction' },
          { status: 500 }
        );
      }

      paymentId = ingestResult.payment_id;

      // Approve and post allocations
      const { error: approveError } = await admin.rpc('approve_payment', {
        p_payment_id: paymentId,
        p_allocations: allocations,
        p_business: businessId,
        p_note: note,
      });

      if (approveError) {
        return NextResponse.json(
          { error: approveError.message || 'Failed to approve cash payment' },
          { status: 500 }
        );
      }

      // Compute remaining customer balance
      const { data: remainingBalData } = await admin
        .from('v_obligation_overview')
        .select('balance_minor')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .eq('kind', 'customer_debt')
        .in('status', ['open', 'partially_paid']);

      newBalanceMinor = (remainingBalData || []).reduce(
        (sum, o) => sum + Number(o.balance_minor || 0),
        0
      );
    }

    // 4. Trigger sub-second instant SMS delivery for confirmation SMS in background
    try {
      processSmsQueue().catch(() => {});
    } catch {
      // SMS worker handles queue asynchronously if immediate dispatch fails
    }

    return NextResponse.json({
      success: true,
      paymentId,
      transactionRef,
      amountMinor,
      allocatedMinor,
      unallocatedMinor,
      newBalanceMinor,
      message: `Cash payment of KES ${(amountMinor / 100).toLocaleString()} successfully recorded and applied to debt.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error while processing cash payment' },
      { status: 500 }
    );
  }
}
