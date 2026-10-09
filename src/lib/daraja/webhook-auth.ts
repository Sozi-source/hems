import { matchesConfiguredSecret } from '@/lib/security/secret-match';

export type DarajaWebhookAuthResult = 'ok' | 'missing_configuration' | 'invalid_token';

/** Daraja callbacks have no configurable auth header, so use a high-entropy shared URL token. */
export function validateDarajaWebhook(request: Request): DarajaWebhookAuthResult {
  const expected = process.env.DARAJA_WEBHOOK_TOKEN;
  if (!expected || expected.length < 32) return 'missing_configuration';

  const provided = new URL(request.url).searchParams.get('token') || '';
  return matchesConfiguredSecret(expected, provided) ? 'ok' : 'invalid_token';
}
