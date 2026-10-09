import { NextResponse } from 'next/server';
import { DarajaC2BPayload } from '@/lib/daraja/types';
import { validateDarajaWebhook } from '@/lib/daraja/webhook-auth';
import { createAdminClient } from '@/lib/supabase/admin';

function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export async function POST(request: Request) {
  const auth = validateDarajaWebhook(request);
  if (auth !== 'ok') {
    return NextResponse.json(
      { error: auth === 'missing_configuration' ? 'Daraja callback authentication is not configured' : 'Unauthorized callback' },
      { status: auth === 'missing_configuration' ? 503 : 401 }
    );
  }

  try {
    const payload: DarajaC2BPayload = await request.json();
    const amount = textValue(payload.TransAmount);
    if (!textValue(payload.TransID) || !/^\d{1,12}(?:\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ ResultCode: 'C2B00013', ResultDesc: 'Invalid transaction details' });
    }

    const shortcode = textValue(payload.BusinessShortCode);
    const accountReference = textValue(payload.BillRefNumber);
    if (!/^\d{5,6}$/.test(shortcode)) {
      return NextResponse.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account number' });
    }

    const supabase = createAdminClient();
    const { data: channel, error: channelError } = await supabase
      .from('payment_channels')
      .select('business_id, provider')
      .eq('shortcode', shortcode)
      .eq('is_active', true)
      .in('provider', ['mpesa_paybill', 'mpesa_till'])
      .maybeSingle();
    if (channelError) {
      console.error('Daraja validation channel lookup failed:', channelError.message);
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Temporarily unavailable' }, { status: 503 });
    }
    if (!channel) return NextResponse.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account number' });

    if (channel.provider === 'mpesa_paybill') {
      if (!accountReference) return NextResponse.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account number' });
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('business_id', channel.business_id)
        .eq('customer_no', accountReference)
        .maybeSingle();
      if (customerError) {
        console.error('Daraja validation customer lookup failed:', customerError.message);
        return NextResponse.json({ ResultCode: 1, ResultDesc: 'Temporarily unavailable' }, { status: 503 });
      }
      if (!customer) return NextResponse.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account number' });
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch {
    return NextResponse.json({ ResultCode: 'C2B00013', ResultDesc: 'Invalid transaction details' });
  }
}
