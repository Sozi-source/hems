import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { parsePaymentAlert } from '@/lib/reconciliation/sms-parser';

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
    const rawText = typeof body.rawText === 'string' ? body.rawText.trim() : '';
    const overrides = body.overrides || {};

    if (!businessId || !rawText) {
      return NextResponse.json({ error: 'businessId and alert text are required' }, { status: 400 });
    }

    // Role check: cashier, accountant, admin, owner can paste payment alerts
    const admin = createAdminClient();
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

    // Parse the raw SMS / alert text
    const parsed = parsePaymentAlert(rawText);
    const transactionRef = (overrides.transactionRef || parsed?.transactionRef || '').trim().toUpperCase();
    const amountMinor = overrides.amountMinor ? Number(overrides.amountMinor) : (parsed?.amountMinor || 0);
    const provider = overrides.provider || parsed?.provider || 'mpesa';
    const payerName = (overrides.payerName || parsed?.payerName || '').trim() || null;
    const payerPhone = (overrides.payerPhone || parsed?.payerPhone || '').trim() || null;
    const accountReference = (overrides.accountReference || parsed?.accountReference || '').trim() || null;

    if (!transactionRef || amountMinor <= 0) {
      return NextResponse.json({
        error: 'Could not extract a valid transaction reference and amount. Please verify the alert text or enter the details manually.',
        parsed,
      }, { status: 400 });
    }

    // Call ingest_payment
    const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_payment', {
      p: {
        provider,
        transaction_ref: transactionRef,
        source: 'sms_paste',
        direction: 'in',
        amount_minor: amountMinor,
        business_id: businessId,
        payer_name: payerName,
        payer_msisdn: payerPhone,
        account_reference: accountReference,
        occurred_at: parsed?.occurredAt || new Date().toISOString(),
        raw_text: rawText,
        description: `Pasted Alert (${parsed?.detectedFormat || 'custom'}): ${rawText.slice(0, 100)}`,
      },
    });

    if (ingestError) {
      return NextResponse.json({ error: ingestError.message }, { status: 400 });
    }

    let matchResult = null;
    if (ingestResult?.payment_id) {
      matchResult = await matchPayment(ingestResult.payment_id);
    }

    return NextResponse.json({
      success: true,
      outcome: ingestResult?.outcome,
      paymentId: ingestResult?.payment_id,
      match: matchResult,
      parsed: {
        transactionRef,
        amountMinor,
        provider,
        payerName,
        payerPhone,
        accountReference,
      },
    });
  } catch (err: any) {
    console.error('SMS paste ingest error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
