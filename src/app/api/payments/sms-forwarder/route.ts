import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { parsePaymentAlert } from '@/lib/reconciliation/sms-parser';

/**
 * Records ignored, non-conforming, or unparsed SMS into payment_ingest_log
 * so developers and business owners have complete visibility into what came from the device.
 */
async function recordIngestFailure(
  admin: ReturnType<typeof createAdminClient>,
  rawText: string,
  sender: string | undefined,
  reason: string
) {
  try {
    const rawWithSender = sender ? `[Sender: ${sender}] ${rawText}` : rawText;
    const contentSha256 = crypto
      .createHash('sha256')
      .update(`failed|${rawWithSender}`)
      .digest('hex');

    await admin.from('payment_ingest_log').upsert(
      {
        source: 'sms_forwarder',
        content_sha256: contentSha256,
        raw: rawWithSender,
        outcome: 'parse_failed',
        error: reason,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'content_sha256' }
    );
  } catch (err) {
    console.error('Error recording SMS ingest failure:', err);
  }
}

/**
 * Android SMS Message Reader / Forwarder Webhook
 *
 * Receives automatic HTTP POST requests from Android SMS reader apps
 * (e.g., SMS Forwarder, MacroDroid, Automate) when incoming SMS alerts arrive
 * from Equity Bank, ABSA Bank, or Safaricom M-Pesa.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const querySecret = url.searchParams.get('secret') || url.searchParams.get('key');
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    let payload: Record<string, any> = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }
    } else {
      const text = await request.text();
      try {
        payload = JSON.parse(text);
      } catch {
        try {
          const params = Object.fromEntries(new URLSearchParams(text));
          if (Object.keys(params).length > 0) {
            payload = params;
          } else {
            payload = { text };
          }
        } catch {
          payload = { text };
        }
      }
    }

    // Extract message body from various SMS forwarder schema conventions (SMS2Webhook uses `body`)
    const rawText = String(
      payload.text ||
      payload.content ||
      payload.body ||
      payload.message ||
      payload.msg ||
      ''
    ).trim();

    // Verify secret token if configured (supports Authorization: Bearer, query ?secret/?key, or JSON apiKey)
    const configuredSecret = process.env.SMS_FORWARDER_SECRET?.trim();
    if (configuredSecret) {
      const payloadSecret = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
      const providedSecret = bearerToken || querySecret || payloadSecret;
      if (providedSecret !== configuredSecret) {
        return NextResponse.json({ error: 'Unauthorized SMS forwarder device' }, { status: 401 });
      }
    }

    // SMS2Webhook sends sender in `address`; MacroDroid/others use `from`, `sender`, `originatingAddress`
    const sender = String(
      payload.address ||
      payload.from ||
      payload.sender ||
      payload.originatingAddress ||
      ''
    ).trim();
    const explicitBusinessId = payload.businessId || payload.business_id || url.searchParams.get('businessId') || null;

    // Parse optional epoch ms timestamp sent by SMS2Webhook (`payload.date` arrives as string or number)
    let deviceOccurredAt: string | undefined;
    const rawDate = payload.date || payload.timestamp || payload.date_sent;
    if (rawDate !== undefined && rawDate !== null && rawDate !== '' && rawDate !== '[timestamp]') {
      const epochMs = Number(rawDate);
      if (!Number.isNaN(epochMs) && epochMs > 1000000000000) {
        deviceOccurredAt = new Date(epochMs).toISOString();
      } else {
        const parsedDate = new Date(String(rawDate));
        if (!Number.isNaN(parsedDate.getTime())) {
          deviceOccurredAt = parsedDate.toISOString();
        }
      }
    }

    // Handle manual "Test Connection" / "Test Action" clicks from SMS2Webhook or MacroDroid
    if (
      !rawText ||
      rawText.length < 15 ||
      rawText.includes('{sms_message}') ||
      rawText === '[body]' ||
      /test message|test connection/i.test(rawText)
    ) {
      return NextResponse.json({
        status: 'ok',
        testReceived: true,
        message: 'SMS forwarder test connection successful! Ready for live incoming SMS.',
      }, { status: 200 });
    }

    const admin = createAdminClient();

    // Filter 1: Sender allowlist & anti-spoofing check
    // SMS2Webhook forwards all device SMS with `address` set to the sender ID or phone number.
    // Ignore messages from regular personal phone numbers (+254..., 07...) or non-financial sender IDs.
    const hasRealSender =
      sender.length > 0 &&
      sender !== '[from]' &&
      !sender.includes('{');

    if (hasRealSender) {
      const compactSender = sender.replace(/[\s-]/g, '');
      const isPersonalPhoneNumber = /^\+?\d{7,15}$/.test(compactSender);
      const isShortcode = /^\d{4,6}$/.test(compactSender);
      const isAllowedFinancialSender =
        /mpesa|m-pesa|equity|ncba|absa|kcb|coop|co-op|stanbic|family|dtb|i&m|im[\s-]?bank|standardchartered|stanchart|postbank|creditbank/i.test(
          sender
        ) || isShortcode;

      if (isPersonalPhoneNumber || !isAllowedFinancialSender) {
        await recordIngestFailure(
          admin,
          rawText,
          sender,
          isPersonalPhoneNumber
            ? `ignored_personal_phone_sender: ${sender}`
            : `ignored_unrecognized_sender: ${sender}`
        );
        return NextResponse.json({
          status: 'ignored_unrecognized_sender',
          sender,
          note: 'Sender is not an allowed financial institution (MPESA, EQUITY, NCBA, ABSA, KCB, COOP, etc.)',
        }, { status: 200 });
      }
    }

    // Filter 2: Parse SMS alert using our multi-bank incoming credit engine
    const parsed = parsePaymentAlert(rawText, sender);
    if (
      !parsed ||
      !parsed.transactionRef ||
      parsed.amountMinor <= 0 ||
      parsed.detectedFormat === 'generic'
    ) {
      await recordIngestFailure(
        admin,
        rawText,
        sender,
        !parsed
          ? 'ignored_unrecognized_pattern: format_unrecognized'
          : parsed.detectedFormat === 'generic'
          ? 'ignored_generic_format'
          : !parsed.transactionRef
          ? 'ignored_missing_transaction_ref'
          : 'ignored_invalid_amount'
      );
      return NextResponse.json({
        status: 'ignored_unrecognized_pattern',
        note: 'Message did not match an incoming Equity, NCBA, ABSA, or M-Pesa credit format',
        receivedTextPreview: rawText.slice(0, 100),
      }, { status: 200 });
    }

    // Resolve tenant business attribution
    let targetBusinessId: string | null = explicitBusinessId;

    // Fetch production businesses vs developer sandbox businesses for strict tenant isolation
    const { data: allBusinesses } = await admin
      .from('businesses')
      .select('id, code, name, legal_name, created_at')
      .order('created_at', { ascending: true });

    const prodBusinesses = (allBusinesses || []).filter((b) => !b.code.startsWith('DEV_'));
    const devBusinesses = (allBusinesses || []).filter((b) => b.code.startsWith('DEV_'));
    const prodBusinessIds = prodBusinesses.map((b) => b.id);

    // If no explicit businessId is provided, check if the SMS is from the developer's own test number/identity
    if (
      !targetBusinessId &&
      devBusinesses.length > 0 &&
      (/WILFRED\s+OSOZI/i.test(rawText) || /711390861/.test(rawText))
    ) {
      targetBusinessId = devBusinesses[0].id;
    }

    if (!targetBusinessId && parsed.accountReference && prodBusinessIds.length > 0) {
      // 1. Try matching payment channel by shortcode or till number (production businesses only)
      const { data: channel } = await admin
        .from('payment_channels')
        .select('business_id')
        .in('business_id', prodBusinessIds)
        .or(`shortcode.eq.${parsed.accountReference},business_shortcode.eq.${parsed.accountReference}`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (channel?.business_id) {
        targetBusinessId = channel.business_id;
      } else {
        // 2. Try matching customer_no in production businesses
        const { data: customer } = await admin
          .from('customers')
          .select('business_id')
          .in('business_id', prodBusinessIds)
          .eq('customer_no', parsed.accountReference)
          .limit(1)
          .maybeSingle();

        if (customer?.business_id) {
          targetBusinessId = customer.business_id;
        } else {
          // 3. Try matching open obligation reference (e.g. CD0001) in production businesses
          const { data: obligation } = await admin
            .from('obligations')
            .select('business_id')
            .in('business_id', prodBusinessIds)
            .eq('reference_no', parsed.accountReference)
            .limit(1)
            .maybeSingle();

          if (obligation?.business_id) {
            targetBusinessId = obligation.business_id;
          }
        }
      }
    }

    // Check if rawText mentions any active production business channel's shortcode/till
    if (!targetBusinessId && prodBusinessIds.length > 0) {
      const { data: channels } = await admin
        .from('payment_channels')
        .select('business_id, shortcode, business_shortcode')
        .in('business_id', prodBusinessIds)
        .eq('is_active', true);

      if (channels) {
        for (const ch of channels) {
          if (rawText.includes(ch.shortcode) || (ch.business_shortcode && rawText.includes(ch.business_shortcode))) {
            targetBusinessId = ch.business_id;
            break;
          }
        }
      }
    }

    // Check if rawText mentions Haron Enterprise / Mulot or common client ledger accounts
    if (!targetBusinessId && /HARON|MULOT|650166|XX6709/i.test(rawText)) {
      const haronProd = prodBusinesses.find(
        (b) => /haron/i.test(b.name) || /haron/i.test(b.legal_name || '')
      );
      if (haronProd?.id) {
        targetBusinessId = haronProd.id;
      }
    }

    // Fallback to phone match in production businesses if available
    if (!targetBusinessId && parsed.payerPhone && !parsed.payerPhone.includes('*') && prodBusinessIds.length > 0) {
      const { data: customerByPhone } = await admin
        .from('customers')
        .select('business_id')
        .in('business_id', prodBusinessIds)
        .eq('phone', parsed.payerPhone)
        .limit(1)
        .maybeSingle();

      if (customerByPhone?.business_id) {
        targetBusinessId = customerByPhone.business_id;
      }
    }

    // 4. Default to first active production business (never a DEV_ sandbox business)
    if (!targetBusinessId) {
      targetBusinessId = prodBusinesses[0]?.id || allBusinesses?.[0]?.id || null;
    }

    // Ingest into payment_transactions with source: 'sms_forwarder'
    const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_payment', {
      p: {
        provider: parsed.provider,
        transaction_ref: parsed.transactionRef,
        source: 'sms_forwarder',
        direction: 'in',
        amount_minor: parsed.amountMinor,
        business_id: targetBusinessId,
        payer_name: parsed.payerName || null,
        payer_msisdn: parsed.payerPhone || null,
        account_reference: parsed.accountReference || null,
        occurred_at: parsed.occurredAt || deviceOccurredAt || new Date().toISOString(),
        raw_text: rawText,
        description: `SMS Reader (${sender || parsed.detectedFormat}): ${rawText.slice(0, 120)}`,
      },
    });

    if (ingestError) {
      console.error('SMS forwarder ingest error:', ingestError.message);
      // Return 503 (rather than 400) so SMS2Webhook holds and retries the message
      // instead of treating it as a permanent rejection.
      return NextResponse.json({ error: ingestError.message }, { status: 503 });
    }

    // Run matching engine if newly created or pending
    let matchResult = null;
    if (ingestResult?.payment_id) {
      matchResult = await matchPayment(ingestResult.payment_id);
    }

    const isDuplicate = ingestResult?.outcome === 'duplicate_ref';
    const responseHeaders: Record<string, string> = {};
    if (isDuplicate) {
      responseHeaders['X-Already-Existed'] = 'true';
    }

    return NextResponse.json(
      {
        status: 'ok',
        outcome: ingestResult?.outcome,
        paymentId: ingestResult?.payment_id,
        match: matchResult,
        parsed: {
          provider: parsed.provider,
          transactionRef: parsed.transactionRef,
          amountMinor: parsed.amountMinor,
          payerName: parsed.payerName,
          accountReference: parsed.accountReference,
        },
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (err: any) {
    console.error('SMS forwarder route exception:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * Health check / Ping endpoint for Android test connection
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.SMS_FORWARDER_SECRET?.trim();
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('key');

  if (secret && querySecret !== secret) {
    return NextResponse.json({ status: 'unauthorized', message: 'Provide valid ?secret= token' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: recentLogs } = await admin
    .from('payment_ingest_log')
    .select('id, content_sha256, raw, outcome, error, seen_count, first_seen_at, last_seen_at, payment_id')
    .eq('source', 'sms_forwarder')
    .order('last_seen_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    status: 'online',
    message: 'HEMS SMS Message Reader endpoint is active and accepting POST requests',
    timestamp: new Date().toISOString(),
    recentActivity: recentLogs || [],
  });
}
