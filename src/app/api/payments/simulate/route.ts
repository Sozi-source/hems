import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/daraja/client';
import { matchPayment } from '@/lib/daraja/matcher';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Payment simulation is disabled in production' }, { status: 404 });
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin could not be verified' }, { status: 403 });
  }

  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const transactionRef = typeof body.transactionRef === 'string' ? body.transactionRef.trim().toUpperCase() : '';
    const amountText = String(body.amountMinor ?? '');
    const payerName = typeof body.payerName === 'string' ? body.payerName.trim().slice(0, 120) : '';
    const payerPhone = normalizePhone(typeof body.payerPhone === 'string' ? body.payerPhone : '');
    const accountReference = typeof body.accountReference === 'string' ? body.accountReference.trim().slice(0, 64) : '';

    if (!businessId || !customerId || !/^RK[A-Z0-9]{8}$/.test(transactionRef) || !/^[0-9]{1,16}$/.test(amountText)) {
      return NextResponse.json({ error: 'Invalid simulation details' }, { status: 400 });
    }
    const amountMinor = BigInt(amountText);
    if (amountMinor <= 0n || amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      return NextResponse.json({ error: 'Amount is outside the supported range' }, { status: 400 });
    }
    if (payerName.length < 2 || !/^254[17][0-9]{8}$/.test(payerPhone)) {
      return NextResponse.json({ error: 'Enter a valid payer name and Kenyan phone number' }, { status: 400 });
    }

    const admin = createAdminClient();
    const [{ data: member }, { data: customer }] = await Promise.all([
      admin.from('business_members').select('role').eq('business_id', businessId).eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      admin.from('customers').select('id').eq('id', customerId).eq('business_id', businessId).maybeSingle(),
    ]);
    if (!member || !['owner', 'admin', 'accountant'].includes(member.role)) {
      return NextResponse.json({ error: 'Only an owner, admin, or accountant can simulate payments' }, { status: 403 });
    }
    if (!customer) return NextResponse.json({ error: 'Customer does not belong to the selected business' }, { status: 400 });

    const { data, error } = await admin.rpc('ingest_payment', {
      p: {
        provider: 'simulation',
        transaction_ref: transactionRef,
        source: 'manual',
        direction: 'in',
        amount_minor: Number(amountMinor),
        business_id: businessId,
        payer_name: payerName,
        payer_msisdn: payerPhone,
        account_reference: accountReference || null,
        occurred_at: new Date().toISOString(),
        raw: { simulation: true, customer_id: customerId },
      },
    });
    if (error || !data?.payment_id) {
      return NextResponse.json({ error: error?.message || 'Could not record simulated payment' }, { status: 500 });
    }

    try {
      await matchPayment(data.payment_id);
    } catch (error) {
      console.error('Simulated payment matching failed:', error instanceof Error ? error.message : 'unknown error');
    }

    return NextResponse.json({ success: true, paymentId: data.payment_id });
  } catch (error) {
    console.error('Payment simulation failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Could not record simulated payment' }, { status: 500 });
  }
}
