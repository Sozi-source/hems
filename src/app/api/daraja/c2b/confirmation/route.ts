import { NextResponse } from 'next/server';
import { DarajaC2BPayload } from '@/lib/daraja/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';

export async function POST(request: Request) {
  try {
    const payload: DarajaC2BPayload = await request.json();

    if (!payload.TransID || !payload.TransAmount) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing required parameters' });
    }

    const supabase = createAdminClient();

    // 1. Convert amount to minor units (cents)
    const amountMinor = Math.round(parseFloat(payload.TransAmount) * 100);

    // 2. Format Nairobi time (YYYYMMDDHHmmss -> ISO)
    const tt = payload.TransTime || '';
    let occurredAt = new Date().toISOString();
    if (tt && tt.length === 14) {
      const y = tt.slice(0, 4);
      const m = tt.slice(4, 6);
      const d = tt.slice(6, 8);
      const h = tt.slice(8, 10);
      const min = tt.slice(10, 12);
      const s = tt.slice(12, 14);
      occurredAt = `${y}-${m}-${d}T${h}:${min}:${s}+03:00`;
    }

    // 3. Assemble payer full name
    const payerName = [payload.FirstName, payload.MiddleName, payload.LastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    // 4. Resolve shortcode and business attribution
    let shortcode = payload.BusinessShortCode ? payload.BusinessShortCode.trim() : null;
    const directBusinessId = (payload as any).business_id || null;

    if (shortcode) {
      const { data: chan } = await supabase
        .from('payment_channels')
        .select('id, business_id')
        .eq('shortcode', shortcode)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      // If shortcode is not in payment_channels but business_id was provided (e.g. sandbox/simulator),
      // omit shortcode so ingest_payment attributes directly to the known business_id.
      if (!chan && directBusinessId) {
        shortcode = null;
      }
    }

    // 5. Ingest payment via database procedure
    const { data: ingestResult, error: ingestError } = await supabase.rpc('ingest_payment', {
      p: {
        provider: 'mpesa',
        transaction_ref: payload.TransID.trim(),
        source: 'daraja_c2b',
        direction: 'in',
        amount_minor: amountMinor,
        shortcode: shortcode,
        business_id: directBusinessId,
        payer_msisdn: payload.MSISDN ? payload.MSISDN.trim() : null,
        payer_name: payerName || null,
        account_reference: payload.BillRefNumber ? payload.BillRefNumber.trim() : null,
        occurred_at: occurredAt,
        raw: payload,
      },
    });

    if (ingestError) {
      console.error('Daraja C2B ingest error:', ingestError);
    } else if (ingestResult?.payment_id) {
      // 5. Trigger automated matching
      try {
        await matchPayment(ingestResult.payment_id);
      } catch (matchErr) {
        console.error('Match candidate generation failed:', matchErr);
      }
    }

    // Safaricom expects confirmation response
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  } catch (error: any) {
    console.error('Daraja C2B confirmation handler error:', error);
    return NextResponse.json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  }
}
