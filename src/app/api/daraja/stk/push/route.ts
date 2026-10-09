import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDarajaConfig, normalizePhone, sendStkPush } from '@/lib/daraja/client';

const ALLOWED_ROLES = ['owner', 'admin', 'accountant', 'cashier'];

export async function POST(request: Request) {
  let stkRequestId: string | null = null;
  let adminSupabase: ReturnType<typeof createAdminClient> | null = null;

  try {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Request origin could not be verified' }, { status: 403 });
    }
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return NextResponse.json({ error: 'Expected an application/json request' }, { status: 415 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';
    const customerId = typeof body.customerId === 'string' ? body.customerId : '';
    const amountText = String(body.amountMinor ?? '');
    if (!/^[0-9]+$/.test(amountText) || !businessId || !customerId) {
      return NextResponse.json({ error: 'Business, customer, and a valid whole-KSh amount are required' }, { status: 400 });
    }

    const amountBigInt = BigInt(amountText);
    if (amountBigInt < 100n || amountBigInt % 100n !== 0n || amountBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      return NextResponse.json({ error: 'STK amount must be at least KSh 1, in whole shillings, and within the supported range' }, { status: 400 });
    }

    adminSupabase = createAdminClient();

    const [{ data: member }, { data: business }, { data: customer }, { data: channels, error: channelsError }] = await Promise.all([
      adminSupabase.from('business_members').select('role').eq('business_id', businessId).eq('user_id', user.id).eq('is_active', true).maybeSingle(),
      adminSupabase.from('businesses').select('id, code').eq('id', businessId).eq('is_active', true).maybeSingle(),
      adminSupabase.from('customers').select('id, business_id, phone, customer_no').eq('id', customerId).eq('business_id', businessId).maybeSingle(),
      adminSupabase.from('payment_channels').select('id, shortcode, provider, business_shortcode').eq('business_id', businessId).in('provider', ['mpesa_paybill', 'mpesa_till']).eq('is_active', true),
    ]);

    if (!member || !ALLOWED_ROLES.includes(member.role)) {
      return NextResponse.json({ error: 'You are not allowed to send payment prompts for this business' }, { status: 403 });
    }
    if (!business || !customer || channelsError) {
      console.error('Could not verify business, customer, or M-Pesa channel:', channelsError?.message);
      return NextResponse.json({ error: 'This business, customer, or M-Pesa payment channel could not be verified' }, { status: channelsError ? 503 : 400 });
    }
    if (!channels?.length) return NextResponse.json({ error: 'Add an active M-Pesa Paybill or Till channel for this business before prompting a customer.' }, { status: 400 });
    if (channels.length !== 1) return NextResponse.json({ error: 'Keep exactly one active M-Pesa collection channel per business for STK prompts.' }, { status: 409 });
    const channel = channels[0];

    const config = getDarajaConfig(business.code);
    const isTill = channel.provider === 'mpesa_till';
    if (isTill && channel.business_shortcode !== config.shortcode) {
      return NextResponse.json({ error: 'The Till channel Store / Business Short Code must match the Daraja shortcode configured for this business.' }, { status: 409 });
    }
    if (!isTill && channel.shortcode !== config.shortcode) {
      return NextResponse.json({ error: 'The active Paybill channel does not match the configured Daraja shortcode. Correct the channel credentials before prompting a customer.' }, { status: 409 });
    }

    const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
    const registeredPhone = normalizePhone(customer.phone || '');
    if (!/^254[17][0-9]{8}$/.test(phone) || !registeredPhone || phone !== registeredPhone) {
      return NextResponse.json({ error: 'Use the selected customer’s registered Kenyan mobile number. Update the customer record first if it is incorrect.' }, { status: 400 });
    }

    // Store the expected request before contacting Daraja so a fast callback can be correlated.
    const { data: stkRequest, error: insertError } = await adminSupabase
      .from('stk_requests')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        channel_id: channel.id,
        purpose: 'debt_payment',
        msisdn: phone,
        amount_minor: Number(amountBigInt),
        account_reference: customer.customer_no,
        status: 'initiated',
        requested_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !stkRequest) {
      if (insertError?.code === 'P0001' && insertError.message.includes('rate limit')) {
        return NextResponse.json({ error: insertError.message }, { status: 429 });
      }
      console.error('Could not persist STK request before provider call:', insertError?.message);
      return NextResponse.json({ error: 'Could not safely record this payment prompt. No prompt was sent.' }, { status: 500 });
    }
    stkRequestId = stkRequest.id;

    const stkResponse = await sendStkPush({
      phone,
      amount: Number(amountBigInt / 100n),
      accountReference: customer.customer_no,
      transactionDesc: 'Debt Payment',
      transactionType: isTill ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      partyB: isTill ? channel.shortcode : config.shortcode,
      businessCode: business.code,
      config,
    });

    const { error: updateError } = await adminSupabase
      .from('stk_requests')
      .update({
        merchant_request_id: stkResponse.merchantRequestId,
        checkout_request_id: stkResponse.checkoutRequestId,
        status: 'sent',
      })
      .eq('id', stkRequest.id);

    if (updateError) {
      console.error('Provider accepted STK request but request correlation update failed:', updateError.message);
      return NextResponse.json({ error: 'The provider accepted the prompt, but the system could not save its tracking reference. Check the payment inbox before retrying.' }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      checkoutRequestId: stkResponse.checkoutRequestId,
      customerMessage: stkResponse.customerMessage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initiate STK Push prompt';
    if (stkRequestId && adminSupabase) {
      const { error: updateError } = await adminSupabase
        .from('stk_requests')
        .update({ status: 'failed', result_desc: message.slice(0, 500), completed_at: new Date().toISOString() })
        .eq('id', stkRequestId);
      if (updateError) console.error('Could not mark failed STK request:', updateError.message);
    }
    console.error('STK Push API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
