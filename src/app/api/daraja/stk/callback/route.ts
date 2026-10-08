import { NextResponse } from 'next/server';
import { DarajaStkCallbackPayload } from '@/lib/daraja/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';

export async function POST(request: Request) {
  try {
    const payload: DarajaStkCallbackPayload = await request.json();
    const callback = payload?.Body?.stkCallback;

    if (!callback) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid payload structure' });
    }

    const {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    const supabase = createAdminClient();

    // 1. Fetch original STK request record
    const { data: stkReq } = await supabase
      .from('stk_requests')
      .select('id, business_id, customer_id, channel_id, amount_minor, account_reference')
      .eq('checkout_request_id', CheckoutRequestID)
      .single();

    // 2. Handle failure or cancellation
    if (ResultCode !== 0) {
      if (stkReq) {
        await supabase
          .from('stk_requests')
          .update({
            status: ResultCode === 1032 ? 'cancelled' : 'failed',
            result_code: ResultCode,
            result_desc: ResultDesc,
            completed_at: new Date().toISOString(),
          })
          .eq('id', stkReq.id);
      }

      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }

    // 3. Handle success: parse metadata items
    const items = CallbackMetadata?.Item || [];
    let receiptNumber = '';
    let amountKes = 0;
    let phoneNumber = '';
    let txDate = '';

    for (const item of items) {
      if (item.Name === 'MpesaReceiptNumber' && item.Value) {
        receiptNumber = String(item.Value);
      } else if (item.Name === 'Amount' && item.Value) {
        amountKes = Number(item.Value);
      } else if (item.Name === 'PhoneNumber' && item.Value) {
        phoneNumber = String(item.Value);
      } else if (item.Name === 'TransactionDate' && item.Value) {
        txDate = String(item.Value);
      }
    }

    if (!receiptNumber) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Missing receipt' });
    }

    const amountMinor = amountKes > 0 ? Math.round(amountKes * 100) : (stkReq?.amount_minor || 0);

    // 4. Ingest payment into ledger as pending
    const { data: ingestResult, error: ingestError } = await supabase.rpc('ingest_payment', {
      p: {
        provider: 'mpesa',
        transaction_ref: receiptNumber.trim(),
        source: 'daraja_stk',
        direction: 'in',
        amount_minor: amountMinor,
        business_id: stkReq?.business_id || null,
        payer_msisdn: phoneNumber || null,
        account_reference: stkReq?.account_reference || null,
        occurred_at: new Date().toISOString(),
        raw: payload,
      },
    });

    // 5. Update STK request with payment reference
    if (stkReq) {
      await supabase
        .from('stk_requests')
        .update({
          status: 'success',
          result_code: ResultCode,
          result_desc: ResultDesc,
          mpesa_receipt: receiptNumber,
          payment_id: ingestResult?.payment_id || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', stkReq.id);
    }

    // 6. Run automated matching
    if (ingestResult?.payment_id) {
      try {
        await matchPayment(ingestResult.payment_id);
      } catch (e) {
        console.error('STK payment match error:', e);
      }
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error: any) {
    console.error('Daraja STK callback error:', error);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
}
