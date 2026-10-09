import { DarajaConfig } from './types';
import { createHash } from 'node:crypto';

// In-memory token cache
let cachedToken: {
  accessToken: string;
  expiresAt: number;
  credentialFingerprint: string;
} | null = null;

export function getDarajaConfig(businessCode?: string): DarajaConfig {
  const suffix = businessCode && /^[A-Z0-9_]+$/.test(businessCode) ? `_${businessCode}` : '';
  const setting = (name: string) => process.env[`DARAJA_${name}${suffix}`]?.trim() || process.env[`DARAJA_${name}`]?.trim() || '';
  const environment = setting('ENVIRONMENT');
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('DARAJA_ENVIRONMENT must be sandbox or production');
  }

  const shortcode = setting('SHORTCODE');
  const passkey = setting('PASSKEY');
  if (!/^\d{5,6}$/.test(shortcode) || !passkey) {
    throw new Error('Set the Daraja shortcode and passkey for the selected environment');
  }

  return {
    environment,
    consumerKey: setting('CONSUMER_KEY'),
    consumerSecret: setting('CONSUMER_SECRET'),
    passkey,
    shortcode,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
  };
}

export function getBaseUrl(env: 'sandbox' | 'production'): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export async function getDarajaOAuthToken(customConfig?: Partial<DarajaConfig>, businessCode?: string): Promise<string> {
  const config = { ...getDarajaConfig(businessCode), ...customConfig };

  const now = Date.now();
  const credentialFingerprint = createHash('sha256')
    .update(`${config.environment}:${config.consumerKey}:${config.consumerSecret}`)
    .digest('hex');
  if (cachedToken && cachedToken.credentialFingerprint === credentialFingerprint && cachedToken.expiresAt > now + 300000) {
    return cachedToken.accessToken;
  }

  if (!config.consumerKey || !config.consumerSecret) {
    throw new Error('Missing Daraja API credentials (DARAJA_CONSUMER_KEY or DARAJA_CONSUMER_SECRET)');
  }

  const authHeader = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const baseUrl = getBaseUrl(config.environment);

  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Daraja OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const expiresInMs = (parseInt(data.expires_in, 10) || 3599) * 1000;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + expiresInMs,
    credentialFingerprint,
  };

  return data.access_token;
}

export function generateStkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export function getTimestamp(): string {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && (digits.length === 10)) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith('254') && (digits.length === 12)) {
    return digits;
  }
  if (digits.length === 9) {
    return `254${digits}`;
  }
  return digits;
}

export async function sendStkPush(params: {
  phone: string;
  amount: number; // in whole KSh
  accountReference: string;
  transactionDesc?: string;
  config?: Partial<DarajaConfig>;
  callbackUrl?: string;
  businessCode?: string;
}) {
  const config = { ...getDarajaConfig(params.businessCode), ...params.config };
  const token = await getDarajaOAuthToken(config, params.businessCode);
  const baseUrl = getBaseUrl(config.environment);

  const timestamp = getTimestamp();
  const password = generateStkPassword(config.shortcode, config.passkey, timestamp);
  const formattedPhone = normalizePhone(params.phone);
  if (!/^254[17][0-9]{8}$/.test(formattedPhone)) throw new Error('Enter a valid Kenyan mobile number');
  if (!Number.isSafeInteger(params.amount) || params.amount <= 0) throw new Error('STK amount must be a positive whole number of shillings');

  const callback = (
    params.callbackUrl ||
    config.callbackUrl ||
    `${(process.env.NEXT_PUBLIC_APP_URL || 'https://hems.co.ke').replace(/\/$/, '')}/api/daraja/stk/callback`
  ).trim();

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(callback);
  } catch {
    throw new Error('Daraja callback URL is invalid. Set DARAJA_CALLBACK_URL to the full callback endpoint.');
  }

  if (
    callbackUrl.protocol !== 'https:' ||
    callbackUrl.hostname === 'localhost' ||
    callbackUrl.hostname === '127.0.0.1' ||
    callbackUrl.hostname === '[::1]'
  ) {
    throw new Error(
      'Daraja requires a public HTTPS callback URL. Set DARAJA_CALLBACK_URL to your deployed callback or HTTPS tunnel endpoint.'
    );
  }

  if (
    config.environment === 'production' &&
    /(^|\.)(ngrok-free\.dev|ngrok\.io|ngrok\.app)$/.test(callbackUrl.hostname)
  ) {
    throw new Error('Use your own deployed HTTPS domain for production Daraja callbacks; public tunnels are for development only.');
  }

  const webhookToken = process.env.DARAJA_WEBHOOK_TOKEN;
  if (!webhookToken || webhookToken.length < 32) {
    throw new Error('Set DARAJA_WEBHOOK_TOKEN to a random secret of at least 32 characters before enabling STK Push.');
  }
  callbackUrl.searchParams.set('token', webhookToken);

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.max(1, Math.round(params.amount)),
    PartyA: formattedPhone,
    PartyB: config.shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl.toString(),
    AccountReference: params.accountReference.slice(0, 12),
    TransactionDesc: (params.transactionDesc || 'Debt Payment').slice(0, 13),
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json();

  if (!response.ok || responseData.ResponseCode !== '0') {
    throw new Error(
      responseData.errorMessage || responseData.ResponseDescription || 'Failed to initiate STK Push'
    );
  }

  return {
    merchantRequestId: responseData.MerchantRequestID,
    checkoutRequestId: responseData.CheckoutRequestID,
    responseCode: responseData.ResponseCode,
    responseDescription: responseData.ResponseDescription,
    customerMessage: responseData.CustomerMessage,
  };
}
