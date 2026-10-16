import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { userId: targetUserId } = await context.params;

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required.' }, { status: 400 });
    }

    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: please sign in.' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify requesting user is an owner or admin
    const { data: adminMemberships } = await admin
      .from('business_members')
      .select('business_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAuthorized = adminMemberships?.some((m) => ['owner', 'admin'].includes(m.role));
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: only owners and platform admins have access to user transactions.' },
        { status: 403 }
      );
    }

    // Businesses accessible to this admin
    const allowedBusinessIds = (adminMemberships || [])
      .filter((m) => ['owner', 'admin'].includes(m.role))
      .map((m) => m.business_id);

    // Fetch business names
    const { data: businesses } = await admin
      .from('businesses')
      .select('id, code, name')
      .in('id', allowedBusinessIds);

    const businessMap = new Map<string, string>();
    (businesses || []).forEach((b) => businessMap.set(b.id, b.name));

    // Fetch target user profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', targetUserId)
      .maybeSingle();

    // Fetch target user email from auth if accessible
    let targetEmail: string | null = null;
    try {
      const { data: authUserData } = await admin.auth.admin.getUserById(targetUserId);
      if (authUserData?.user?.email) {
        targetEmail = authUserData.user.email;
      }
    } catch {
      // Ignore if restricted
    }

    // 1. Fetch real payment transactions where this user made the decision (approved/rejected)
    let paymentQuery = admin
      .from('payment_transactions')
      .select(
        'id, business_id, provider, transaction_ref, amount_minor, payer_name, payer_msisdn, account_reference, status, decided_at, decision_note, occurred_at'
      )
      .eq('decided_by', targetUserId)
      .order('decided_at', { ascending: false })
      .limit(200);

    if (allowedBusinessIds.length > 0) {
      paymentQuery = paymentQuery.in('business_id', allowedBusinessIds);
    }

    const { data: decidedPayments, error: decError } = await paymentQuery;
    if (decError) {
      console.warn('Error fetching decided payments:', decError.message);
    }

    // 2. Fetch STK requests initiated by this user
    let stkQuery = admin
      .from('stk_requests')
      .select(
        'id, business_id, msisdn, amount_minor, account_reference, status, mpesa_receipt, result_desc, created_at, completed_at'
      )
      .eq('requested_by', targetUserId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (allowedBusinessIds.length > 0) {
      stkQuery = stkQuery.in('business_id', allowedBusinessIds);
    }

    const { data: userStkRequests } = await stkQuery;

    // 3. Fetch audit log entries where this user interacted with payment transactions
    let auditQuery = admin
      .from('audit_log')
      .select('id, business_id, action, table_name, record_id, new_data, occurred_at')
      .eq('actor_id', targetUserId)
      .eq('table_name', 'payment_transactions')
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (allowedBusinessIds.length > 0) {
      auditQuery = auditQuery.in('business_id', allowedBusinessIds);
    }

    const { data: userAuditLogs } = await auditQuery;

    // Build unified list of real transactions
    interface RealTransactionItem {
      id: string;
      transactionRef: string;
      provider: string;
      providerLabel: string;
      amountMinor: number;
      payerName: string;
      payerMsisdn: string;
      accountReference: string;
      status: string;
      action: string;
      decisionNote?: string | null;
      businessName: string;
      timestamp: string;
    }

    const transactionMap = new Map<string, RealTransactionItem>();

    function getProviderLabel(provider: string, ref?: string): string {
      const p = (provider || '').toLowerCase();
      if (p.includes('equity')) return 'Equity Bank';
      if (p.includes('ncba')) return 'NCBA Bank';
      if (p.includes('absa')) return 'Absa Bank';
      if (p.includes('paybill')) return 'M-Pesa Paybill';
      if (p.includes('till')) return 'M-Pesa Till';
      if (p.includes('mpesa')) return 'Safaricom M-Pesa';
      if (p.includes('cash')) return 'Cash Desk';
      return provider || 'M-Pesa';
    }

    // Process decided payments
    (decidedPayments || []).forEach((p) => {
      const ref = p.transaction_ref || p.id;
      const bName = businessMap.get(p.business_id) || 'General Business';
      const actionLabel =
        p.status === 'approved'
          ? 'Approved & Reconciled'
          : p.status === 'rejected'
          ? 'Rejected / Flagged'
          : 'Processed Decision';

      transactionMap.set(ref, {
        id: p.id,
        transactionRef: p.transaction_ref,
        provider: p.provider,
        providerLabel: getProviderLabel(p.provider, p.transaction_ref),
        amountMinor: Number(p.amount_minor || 0),
        payerName: p.payer_name || 'Customer',
        payerMsisdn: p.payer_msisdn || '—',
        accountReference: p.account_reference || '—',
        status: p.status,
        action: actionLabel,
        decisionNote: p.decision_note,
        businessName: bName,
        timestamp: p.decided_at || p.occurred_at || new Date().toISOString(),
      });
    });

    // Process STK pushes
    (userStkRequests || []).forEach((stk) => {
      const ref = stk.mpesa_receipt || `STK-${stk.id.slice(0, 8).toUpperCase()}`;
      if (!transactionMap.has(ref)) {
        const bName = businessMap.get(stk.business_id) || 'General Business';
        transactionMap.set(ref, {
          id: stk.id,
          transactionRef: ref,
          provider: 'mpesa_stk',
          providerLabel: 'M-Pesa STK Push',
          amountMinor: Number(stk.amount_minor || 0),
          payerName: 'STK Customer',
          payerMsisdn: stk.msisdn || '—',
          accountReference: stk.account_reference || '—',
          status: stk.status,
          action: 'STK Push Prompt Triggered',
          decisionNote: stk.result_desc || null,
          businessName: bName,
          timestamp: stk.created_at,
        });
      }
    });

    // Process audit logs for SMS pastes or direct ingestions
    (userAuditLogs || []).forEach((log) => {
      const newData = log.new_data;
      if (newData && newData.transaction_ref) {
        const ref = newData.transaction_ref;
        if (!transactionMap.has(ref)) {
          const bName = businessMap.get(log.business_id) || 'General Business';
          transactionMap.set(ref, {
            id: log.record_id || log.id.toString(),
            transactionRef: ref,
            provider: newData.provider || 'mpesa',
            providerLabel: getProviderLabel(newData.provider),
            amountMinor: Number(newData.amount_minor || 0),
            payerName: newData.payer_name || 'Customer',
            payerMsisdn: newData.payer_msisdn || '—',
            accountReference: newData.account_reference || '—',
            status: newData.status || 'pending',
            action:
              log.action === 'INSERT'
                ? 'Ingested / Pasted SMS Alert'
                : `Updated Transaction (${log.action})`,
            decisionNote: newData.decision_note || null,
            businessName: bName,
            timestamp: log.occurred_at,
          });
        }
      }
    });

    const transactions = Array.from(transactionMap.values());
    transactions.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({
      success: true,
      user: {
        userId: targetUserId,
        fullName: profile?.full_name || targetEmail?.split('@')[0] || `User ${targetUserId.slice(0, 8)}`,
        email: targetEmail,
        phone: profile?.phone,
      },
      transactions,
    });
  } catch (err: any) {
    console.error('Admin user transactions inspection API error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
