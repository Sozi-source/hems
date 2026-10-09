import { NextResponse } from 'next/server';
import { DarajaStkCallbackPayload } from '@/lib/daraja/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { normalizePhone } from '@/lib/daraja/client';
import { validateDarajaWebhook } from '@/lib/daraja/webhook-auth';

function authFailure(result: 'missing_configuration' | 'invalid_token') {
  return NextResponse.json(
    { error: result === 'missing_configuration' ? 'Daraja callback authentication is not configured' : 'Unauthorized callback' },
    { status: result === 'missing_configuration' ? 503 : 401 }
  );
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

export async function POST(request: Request) {
  const auth = validateDarajaWebhook(request);
  if (auth !== 'ok') return authFailure(auth);

  try {
    const payload: DarajaStkCallbackPayload = await request.json();
    const callback = payload?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== 'number') {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: stkReq, error: requestError } = await supabase
      .from('stk_requests')
      .select('id, business_id, customer_id, channel_id, amount_minor, account_reference, msisdn, status')
      .eq('checkout_request_id', callback.CheckoutRequestID)
      .maybeSingle();

    if (requestError) throw new Error(`Could not look up STK request: ${requestError.message}`);
    if (!stkReq) {
      // Do not turn an unknown provider callback into a payment record.
      console.error('STK callback did not match an initiated request');
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged for reconciliation' });
    }

    if (stkReq.status === 'success') {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' });
    }

    if (callback.ResultCode !== 0) {
      const { error } = await supabase.from('stk_requests').update({
        status: callback.ResultCode === 1032 ? 'cancelled' : 'failed',
        result_code: callback.ResultCode,
        result_desc: (callback.ResultDesc || 'Provider reported failure').slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq('id', stkReq.id);
      if (error) throw new Error(`Could not save STK failure: ${error.message}`);
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    const items = callback.CallbackMetadata?.Item || [];
    const item = (name: string) => items.find((candidate) => candidate.Name === name)?.Value;
    const receiptValue = item('MpesaReceiptNumber');
    const receiptNumber = typeof receiptValue === 'string' ? receiptValue.trim() : '';
    const amountKes = item('Amount');
    const phoneValue = item('PhoneNumber');
    const transactionDate = item('TransactionDate');
    const callbackPhone = typeof phoneValue === 'string' || typeof phoneValue === 'number' ? normalizePhone(String(phoneValue)) : '';
    const callbackAmountMinor = typeof amountKes === 'number' && Number.isSafeInteger(amountKes) && amountKes <= Number.MAX_SAFE_INTEGER / 100
      ? amountKes * 100
      : 0;
    const occurredAt = typeof transactionDate === 'number' || typeof transactionDate === 'string'
      ? parseMpesaDate(String(transactionDate))
      : null;

    if (
      !receiptNumber || !occurredAt || !/^254[17][0-9]{8}$/.test(callbackPhone) ||
      callbackPhone !== normalizePhone(stkReq.msisdn) || callbackAmountMinor !== stkReq.amount_minor
    ) {
      const reason = 'Provider callback details did not match the requested amount, phone, receipt, or timestamp. Reconcile against the M-Pesa statement before recording.';
      const { error } = await supabase.from('stk_requests').update({
        status: 'failed', result_code: callback.ResultCode, result_desc: reason, completed_at: new Date().toISOString(),
      }).eq('id', stkReq.id);
      if (error) throw new Error(`Callback mismatch and status update failed: ${error.message}`);
      console.error(`STK callback mismatch for request ${stkReq.id}; payment was not ingested`);
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged for reconciliation' });
    }

    const { data: ingestResult, error: ingestError } = await supabase.rpc('ingest_payment', {
      p: {
        provider: 'mpesa',
        transaction_ref: receiptNumber,
        source: 'daraja_stk',
        direction: 'in',
        amount_minor: callbackAmountMinor,
        business_id: stkReq.business_id,
        payer_msisdn: callbackPhone,
        account_reference: stkReq.account_reference,
        occurred_at: occurredAt,
        raw: payload,
      },
    });
    if (ingestError || !ingestResult?.payment_id) {
      console.error('Daraja STK ingest failed; callback acknowledged for reconciliation:', ingestError?.message || 'no payment id');
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged for reconciliation' });
    }

    const { error: channelLinkError } = await supabase
      .from('payment_transactions')
      .update({ channel_id: stkReq.channel_id })
      .eq('id', ingestResult.payment_id)
      .eq('business_id', stkReq.business_id)
      .eq('status', 'pending')
      .is('channel_id', null);
    if (channelLinkError) {
      console.error('Could not attach STK channel to payment:', channelLinkError.message);
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged for reconciliation' });
    }

    const { error: updateError } = await supabase.from('stk_requests').update({
      status: 'success', result_code: callback.ResultCode,
      result_desc: (callback.ResultDesc || 'Success').slice(0, 500),
      mpesa_receipt: receiptNumber, payment_id: ingestResult.payment_id, completed_at: new Date().toISOString(),
    }).eq('id', stkReq.id);
    if (updateError) throw new Error(`Payment ingested but STK status update failed: ${updateError.message}`);

    try {
      await matchPayment(ingestResult.payment_id);
    } catch (error) {
      console.error('STK payment match generation failed:', error instanceof Error ? error.message : 'unknown error');
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Daraja STK callback processing failed:', error instanceof Error ? error.message : 'unknown error');
    // Daraja callbacks are asynchronous; retain the receipt at the provider and reconcile instead of trusting retries.
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged for reconciliation' });
  }
}
