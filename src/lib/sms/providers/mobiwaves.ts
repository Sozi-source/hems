import { SmsAdapter, SmsSendResult } from './types';

export class MobiwavesAdapter implements SmsAdapter {
  readonly name = 'mobiwaves';

  isConfigured(): boolean {
    return Boolean(process.env.MOBIWAVES_API_KEY && process.env.MOBIWAVES_SENDER_ID);
  }

  async send(toPhone: string, body: string): Promise<SmsSendResult> {
    const endpoint = process.env.MOBIWAVES_API_URL || 'https://sms.mobiwave.co.ke/api/v3/sms/send';
    const apiKey = process.env.MOBIWAVES_API_KEY;
    const senderId = process.env.MOBIWAVES_SENDER_ID;

    if (!apiKey || !senderId) {
      return {
        success: false,
        provider: this.name,
        error: 'Mobiwaves credentials not configured.',
      };
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
          recipient: toPhone.replace(/\D/g, ''),
          sender_id: senderId,
          type: 'plain',
          message: body,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const result = await response.json().catch(() => ({}));
      const accepted = response.ok && result?.status === 'success';

      if (!accepted) {
        return {
          success: false,
          provider: this.name,
          error: String(result?.message || result?.error || `HTTP ${response.status}`).slice(0, 300),
        };
      }

      const messageId =
        result?.data?.queue_uid ||
        result?.data?.uid ||
        result?.data?.id ||
        result?.data?.[0]?.id ||
        null;

      return { success: true, provider: this.name, messageId };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || 'Mobiwaves request failed',
      };
    }
  }
}
