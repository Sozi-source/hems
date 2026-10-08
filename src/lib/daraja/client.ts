import { DarajaConfig, StkInitiateParams } from './types';

// In-memory token cache
let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

export function getDarajaConfig(): DarajaConfig {
  const env = (process.env.DARAJA_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
  return {
    environment: env,
    consumerKey: process.env.DARAJA_CONSUMER_KEY || '',
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || '',
    passkey: process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919', // Safaricom standard sandbox passkey
    shortcode: process.env.DARAJA_SHORTCODE || '174379', // Safaricom standard sandbox shortcode
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
  };
}

export function getBaseUrl(env: 'sandbox' | 'production'): string {
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export async function getDarajaOAuthToken(customConfig?: Partial<DarajaConfig>): Promise<string> {
  const config = { ...getDarajaConfig(), ...customConfig };

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 300000) {
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
  };

  return data.access_token;
}

export function generateStkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
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
}) {
  const config = { ...getDarajaConfig(), ...params.config };
  const token = await getDarajaOAuthToken(config);
  const baseUrl = getBaseUrl(config.environment);

  const timestamp = getTimestamp();
  const password = generateStkPassword(config.shortcode, config.passkey, timestamp);
  const formattedPhone = normalizePhone(params.phone);

  const callback =
    params.callbackUrl ||
    config.callbackUrl ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://hems.co.ke'}/api/daraja/stk/callback`;

  const payload = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.max(1, Math.round(params.amount)),
    PartyA: formattedPhone,
    PartyB: config.shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: callback,
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
