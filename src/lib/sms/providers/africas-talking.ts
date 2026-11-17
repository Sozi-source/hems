import { SmsAdapter, SmsSendResult } from './types';

export class AfricasTalkingAdapter implements SmsAdapter {
  readonly name = 'africas_talking';

  isConfigured(): boolean {
    return Boolean(process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME);
  }

  async send(toPhone: string, body: string): Promise<SmsSendResult> {
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const username = process.env.AFRICASTALKING_USERNAME;
    const senderId = process.env.AFRICASTALKING_SENDER_ID;
    const isSandbox = process.env.AFRICASTALKING_ENV === 'sandbox';

    if (!apiKey || !username) {
      return {
        success: false,
        provider: this.name,
        error: "Africa's Talking credentials not configured.",
      };
    }

    const endpoint = isSandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';

    const cleanDigits = toPhone.replace(/\D/g, '');
    const formattedPhone = cleanDigits.startsWith('+') ? cleanDigits : `+${cleanDigits}`;

    const form = new URLSearchParams({
      username,
      to: formattedPhone,
      message: body,
    });
    if (senderId) form.set('from', senderId);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(15000),
      });

      const result = await response.json().catch(() => ({}));
      const recipient = result?.SMSMessageData?.Recipients?.[0];
      const ok = response.ok && (recipient?.statusCode === 101 || recipient?.status === 'Success');

      if (!ok) {
        return {
          success: false,
          provider: this.name,
          error: recipient?.status || result?.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: recipient?.messageId || null,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.name,
        error: err?.message || "Africa's Talking request failed",
      };
    }
  }
}
