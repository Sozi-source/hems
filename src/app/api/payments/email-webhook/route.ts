import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { parsePaymentAlert } from '@/lib/reconciliation/sms-parser';

export async function POST(request: Request) {
  try {
    // Optional webhook secret check
    const secret = process.env.BANK_EMAIL_WEBHOOK_SECRET;
    if (secret) {
      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const queryKey = new URL(request.url).searchParams.get('key');
      if (token !== secret && queryKey !== secret) {
        return NextResponse.json({ error: 'Unauthorized webhook' }, { status: 401 });
      }
    }

    let rawText = '';
    let targetBusinessId: string | null = null;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await request.json();
      // Handle standard inbound formats (Sendgrid, Postmark, Mailgun, Cloudflare Email Worker)
      rawText = json.text || json.html || json.body || json.content || json.raw || '';
      targetBusinessId = json.businessId || json.business_id || null;
    } else {
      rawText = await request.text();
    }

    if (!rawText || rawText.trim().length < 15) {
      return NextResponse.json({ error: 'Email content is empty or too short' }, { status: 400 });
    }

    // Parse the email body
    const parsed = parsePaymentAlert(rawText);
    if (!parsed || !parsed.transactionRef || parsed.amountMinor <= 0) {
      return NextResponse.json({
        received: true,
        status: 'ignored_unrecognized_pattern',
        note: 'Email did not contain an M-Pesa or bank credit pattern',
      }, { status: 200 });
    }

    const admin = createAdminClient();

    // If businessId not specified in webhook, find default active business or resolve via accountReference
    if (!targetBusinessId) {
      if (parsed.accountReference) {
        const { data: customer } = await admin
          .from('customers')
          .select('business_id')
          .eq('customer_no', parsed.accountReference)
          .limit(1)
          .maybeSingle();

        if (customer?.business_id) {
          targetBusinessId = customer.business_id;
        }
      }

      if (!targetBusinessId) {
        // Fall back to first active business
        const { data: firstBiz } = await admin
          .from('businesses')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        targetBusinessId = firstBiz?.id || null;
      }
    }

    const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_payment', {
      p: {
        provider: parsed.provider,
        transaction_ref: parsed.transactionRef,
        source: 'bank_email',
        direction: 'in',
        amount_minor: parsed.amountMinor,
        business_id: targetBusinessId,
        payer_name: parsed.payerName || null,
        payer_msisdn: parsed.payerPhone || null,
        account_reference: parsed.accountReference || null,
        occurred_at: parsed.occurredAt || new Date().toISOString(),
        raw_text: rawText.slice(0, 1000),
        description: `Bank Email Credit Alert (${parsed.detectedFormat})`,
      },
    });

    if (ingestError) {
      console.error('Email webhook ingest error:', ingestError);
      return NextResponse.json({ error: ingestError.message }, { status: 500 });
    }

    if (ingestResult?.payment_id) {
      await matchPayment(ingestResult.payment_id);
    }

    return NextResponse.json({
      received: true,
      outcome: ingestResult?.outcome,
      paymentId: ingestResult?.payment_id,
      parsedRef: parsed.transactionRef,
      amountMinor: parsed.amountMinor,
    });
  } catch (err: any) {
    console.error('Email webhook processing failed:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
