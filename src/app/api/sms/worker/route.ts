import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchesConfiguredSecret } from '@/lib/security/secret-match';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Provider statuses that will never succeed for this recipient. Do not retry.
const PERMANENT_BLOCK_STATUSES = ['blacklisted', 'optedout', 'invalid_number'];

class SmsSendError extends Error {
  constructor(message: string, readonly permanentBlock = false, readonly authFailure = false) {
    super(message);
  }
}

type QueuedSms = {
  id: string;
  to_phone: string;
  body: string;
};

function authorized(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  return [process.env.SMS_WORKER_SECRET, process.env.CRON_SECRET]
    .some((secret) => matchesConfiguredSecret(secret, supplied));
}

async function runWorker(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = process.env.MOBIWAVES_API_URL;
  const apiKey = process.env.MOBIWAVES_API_KEY;
  const senderId = process.env.MOBIWAVES_SENDER_ID;
  if (!endpoint || !apiKey || !senderId) {
    return NextResponse.json({ error: 'Mobiwave API URL, API key, and approved sender ID must be configured.' }, { status: 503 });
  }

  try {
    const admin = createAdminClient();
    const { data: claimed, error: claimError } = await admin.rpc('claim_sms_outbox', { p_limit: 20 });
    if (claimError) throw claimError;

    const messages = (claimed || []) as QueuedSms[];
    let sent = 0;
    let failed = 0;
    let blocked = 0;
    let authFailed = false;

    for (const sms of messages) {
      if (authFailed) {
        // Credentials are wrong: put the message back instead of burning it as failed.
        await admin.from('sms_outbox').update({ status: 'queued', error: 'Provider authentication failed; will retry' })
          .eq('id', sms.id).eq('status', 'sending');
        continue;
      }
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: sms.to_phone.replace(/\D/g, ''),
            sender_id: senderId,
            type: 'plain',
            message: sms.body,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json().catch(() => ({}));
        const accepted = response.ok && result?.status === 'success';
        if (response.status === 401 || response.status === 403) {
          throw new SmsSendError('Mobiwaves rejected the configured credentials.', false, true);
        }
        if (!accepted) {
          const details = String(result?.message || result?.error || (result?.status ? `Mobiwaves status: ${result.status}` : `HTTP ${response.status}`)).slice(0, 500);
          throw new SmsSendError(details, PERMANENT_BLOCK_STATUSES.includes(details.toLowerCase()));
        }

        const { error: updateError } = await admin.from('sms_outbox').update({
          status: 'sent',
          provider: 'mobiwaves',
          provider_message_id: result?.data?.uid || result?.data?.id || result?.data?.message_id ||
            result?.data?.messageId || result?.data?.[0]?.uid || result?.data?.[0]?.id ||
            result?.data?.[0]?.message_id || result?.data?.[0]?.messageId || null,
          sent_at: new Date().toISOString(),
          error: null,
        }).eq('id', sms.id).eq('status', 'sending');
        if (updateError) throw updateError;
        sent++;
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'SMS send failed';
        if (error instanceof SmsSendError && error.authFailure) {
          authFailed = true;
          console.error('Mobiwaves rejected credentials. Pausing this batch.');
          await admin.from('sms_outbox').update({ status: 'queued', error: detail.slice(0, 1000) })
            .eq('id', sms.id).eq('status', 'sending');
          continue;
        }
        if (error instanceof SmsSendError && error.permanentBlock) {
          const { error: blockError } = await admin.rpc('mark_sms_recipient_blocked', {
            p_sms_id: sms.id,
            p_reason: detail,
          });
          if (blockError) console.error('Failed to flag blocked recipient:', blockError.message);
          blocked++;
        }
        const { error: updateError } = await admin.from('sms_outbox').update({
          status: 'failed',
          error: detail.slice(0, 1000),
        }).eq('id', sms.id).eq('status', 'sending');
        if (updateError) console.error('Failed to record SMS send result:', updateError.message);
        failed++;
      }
    }

    return NextResponse.json({ claimed: messages.length, sent, failed, blocked, authFailed });
  } catch (error) {
    console.error('SMS worker error:', error);
    return NextResponse.json({ error: 'SMS worker could not process the queue.' }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled routes with GET and an Authorization bearer token.
export async function GET(request: Request) {
  return runWorker(request);
}

// Keep POST available for manual or external scheduler invocations.
export async function POST(request: Request) {
  return runWorker(request);
}

