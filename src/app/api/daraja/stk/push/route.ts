import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendStkPush, normalizePhone } from '@/lib/daraja/client';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      businessId,
      customerId,
      phone,
      amountMinor,
      accountReference,
      description,
    } = body;

    if (!businessId || !phone || !amountMinor || Number(amountMinor) <= 0) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. Resolve payment channel for the business
    let channelId: string | null = null;
    const { data: channel } = await adminSupabase
      .from('payment_channels')
      .select('id, shortcode')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (channel) {
      channelId = channel.id;
    } else {
      const defaultShortcode = process.env.DARAJA_SHORTCODE || '174379';
      const { data: existingWithShortcode } = await adminSupabase
        .from('payment_channels')
        .select('id, business_id')
        .eq('provider', 'mpesa_paybill')
        .eq('shortcode', defaultShortcode)
        .maybeSingle();

      if (existingWithShortcode && existingWithShortcode.business_id === businessId) {
        channelId = existingWithShortcode.id;
      } else if (!existingWithShortcode) {
        const { data: newChan } = await adminSupabase
          .from('payment_channels')
          .insert({
            business_id: businessId,
            provider: 'mpesa_paybill',
            shortcode: defaultShortcode,
            label: 'M-Pesa Paybill',
          })
          .select('id')
          .single();
        channelId = newChan?.id || null;
      } else {
        const fallbackCode = `${defaultShortcode}-${businessId.slice(0, 4)}`;
        const { data: newChan } = await adminSupabase
          .from('payment_channels')
          .insert({
            business_id: businessId,
            provider: 'mpesa_paybill',
            shortcode: fallbackCode,
            label: 'M-Pesa Paybill',
          })
          .select('id')
          .single();
        channelId = newChan?.id || null;
      }
    }

    // 2. Format phone number & whole KSh amount
    const formattedPhone = normalizePhone(phone);
    const amountKes = Math.ceil(Number(amountMinor) / 100);

    // 3. Send STK Push request to Safaricom Daraja
    const stkResponse = await sendStkPush({
      phone: formattedPhone,
      amount: amountKes,
      accountReference: (accountReference || 'HEMS').slice(0, 12),
      transactionDesc: (description || 'Debt Payment').slice(0, 13),
    });

    // 4. Record STK request in public.stk_requests
    if (channelId && customerId) {
      await adminSupabase.from('stk_requests').insert({
        business_id: businessId,
        customer_id: customerId,
        channel_id: channelId,
        purpose: 'debt_payment',
        msisdn: formattedPhone,
        amount_minor: Number(amountMinor),
        account_reference: accountReference || null,
        merchant_request_id: stkResponse.merchantRequestId,
        checkout_request_id: stkResponse.checkoutRequestId,
        status: 'sent',
        requested_by: user.id,
      });
    }

    return NextResponse.json({
      success: true,
      checkoutRequestId: stkResponse.checkoutRequestId,
      customerMessage: stkResponse.customerMessage,
    });
  } catch (error: any) {
    console.error('STK Push API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to initiate STK Push prompt' },
      { status: 500 }
    );
  }
}
