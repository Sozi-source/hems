import { NextResponse } from 'next/server';
import { DarajaC2BPayload } from '@/lib/daraja/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { validateDarajaWebhook } from '@/lib/daraja/webhook-auth';

function parseKesMinor(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (fraction && !/^0+$/.test(fraction)) return null;
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

function parseMpesaDate(value: string): string | null {
  if (!/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59
  ) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+03:00`;
}

function unavailable() {
  return NextResponse.json({ ResultCode: 1, ResultDesc: 'Temporarily unavailable; transaction requires reconciliation' }, { status: 503 });
}

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
    const transactionRef = textValue(payload.TransID);
    const amountMinor = parseKesMinor(textValue(payload.TransAmount));
    const occurredAt = parseMpesaDate(textValue(payload.TransTime));
    const shortcode = textValue(payload.BusinessShortCode);
    if (!/^[a-z0-9]{1,32}$/i.test(transactionRef) || !amountMinor || !occurredAt || !/^\d{5,6}$/.test(shortcode)) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid transaction details' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: channel, error: channelError } = await supabase
      .from('payment_channels')
      .select('id, business_id')
      .eq('shortcode', shortcode)
      .eq('is_active', true)
      .in('provider', ['mpesa_paybill', 'mpesa_till'])
      .maybeSingle();
    if (channelError) {
      console.error('Daraja C2B shortcode lookup failed:', channelError.message);
      return unavailable();
    }
    const msisdnValue = textValue(payload.MSISDN);
    const payerMsisdnHash = /^[a-f0-9]{64}$/i.test(msisdnValue) ? msisdnValue.toLowerCase() : null;

    const { data: ingestResult, error: ingestError } = await supabase.rpc('ingest_payment', {
      p: {
        provider: 'mpesa',
        transaction_ref: transactionRef,
        source: 'daraja_c2b',
        direction: 'in',
        amount_minor: amountMinor,
        // Resolve only from our active M-Pesa channel table. Never accept business_id from callback JSON.
        business_id: channel?.business_id || null,
        shortcode: channel ? null : `unmapped-${shortcode}`,
        payer_msisdn: payerMsisdnHash ? null : msisdnValue || null,
        payer_msisdn_sha256: payerMsisdnHash,
        payer_name: [payload.FirstName, payload.MiddleName, payload.LastName].filter(Boolean).join(' ').trim() || null,
        account_reference: textValue(payload.BillRefNumber) || null,
        occurred_at: occurredAt,
        raw: payload,
      },
    });

    if (ingestError || !ingestResult?.payment_id) {
      console.error('Daraja C2B ingest failed:', ingestError?.message || 'no payment id returned');
      return unavailable();
    }

    if (channel) {
      const { error: channelLinkError } = await supabase
        .from('payment_transactions')
        .update({ channel_id: channel.id })
        .eq('id', ingestResult.payment_id)
        .eq('business_id', channel.business_id)
        .eq('status', 'pending')
        .is('channel_id', null);
      if (channelLinkError) console.error('Could not attach M-Pesa channel to payment:', channelLinkError.message);
    }

    try {
      await matchPayment(ingestResult.payment_id);
    } catch (error) {
      console.error('Daraja C2B matching failed:', error instanceof Error ? error.message : 'unknown error');
      // The payment is durably ingested as pending; matching can be retried safely.
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Daraja C2B confirmation processing failed:', error instanceof Error ? error.message : 'unknown error');
    return unavailable();
  }
}
