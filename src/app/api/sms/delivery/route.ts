import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchesConfiguredSecret } from '@/lib/security/secret-match';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expected = process.env.SMS_DELIVERY_TOKEN;
  const supplied = new URL(request.url).searchParams.get('token');
  if (!matchesConfiguredSecret(expected, supplied)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, unknown>;
    if (contentType.includes('application/json')) {
      data = await request.json();
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form.entries());
    }

    const providerMessageId = String(data.id || data.messageId || '').trim();
    const providerStatus = String(data.status || '').trim().toLowerCase();
    if (!providerMessageId || !providerStatus) {
      return NextResponse.json({ error: 'Message id and status are required.' }, { status: 400 });
    }

    const delivered = ['success', 'delivered', 'successful'].includes(providerStatus);
    const status = delivered ? 'delivered' : 'undelivered';
    const admin = createAdminClient();
    const { data: message, error } = await admin.from('sms_outbox').update({
      status,
      delivered_at: delivered ? new Date().toISOString() : null,
      error: delivered ? null : String(data.failureReason || data.failure_reason || providerStatus).slice(0, 1000),
    })
      .eq('provider', 'africas_talking')
      .eq('provider_message_id', providerMessageId)
      .in('status', ['sent', 'sending'])
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ acknowledged: true, matched: Boolean(message) });
  } catch (error) {
    console.error('SMS delivery callback error:', error);
    return NextResponse.json({ error: 'Could not process delivery callback.' }, { status: 500 });
  }
}
