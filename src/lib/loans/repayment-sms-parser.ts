import { parse_kes } from '../format.ts';

export interface ParsedLoanRepaymentSms {
  transactionRef: string;
  amountMinor: number;
  method: 'mpesa' | 'bank_transfer';
  payeeOrLender?: string;
  accountReference?: string;
  paybillOrTill?: string;
  paymentDate: string; // YYYY-MM-DD (Africa/Nairobi)
  rawText: string;
}

/**
 * Parses outgoing M-Pesa or Bank loan repayment / Paybill / debit SMS alerts
 * forwarded by the Android SMS Forwarder app.
 * Returns null if the message is not a recognized outgoing repayment/debit.
 */
export function parseLoanRepaymentSms(
  rawText: string,
  sender?: string,
  occurredAtIso?: string
): ParsedLoanRepaymentSms | null {
  const text = rawText.trim();
  if (!text || text.length < 15) return null;

  // Reject OTPs / promos / balance inquiries
  if (/\b(otp|one[\s-]time\s+pin|verification\s+code|security\s+code)\b/i.test(text)) {
    return null;
  }

  // Must look like an outgoing payment, Paybill/Till transfer, or loan repayment debit
  const isOutgoingMpesa =
    /\b(paid\s+to|sent\s+to|transferred\s+to)\b/i.test(text) &&
    !/\b(you\s+have\s+received|received\s+from)\b/i.test(text);

  const isBankDebitOrLoanRepay =
    /\b(loan\s+repayment|loan\s+account|debited|install?ment\s+paid|repaid)\b/i.test(text) &&
    !/\b(credited\s+to\s+your\s+account|received\s+from)\b/i.test(text);

  if (!isOutgoingMpesa && !isBankDebitOrLoanRepay) {
    return null;
  }

  // Transaction reference: M-Pesa 10-char code at start or Ref/Code/Txn
  const startRef = text.match(/^([A-Z0-9]{8,14})\s+Confirmed\b/i)?.[1];
  const explicitRef = text.match(/(?:Ref(?:\.|erence)?(?:\s*No\.?)?|Txn(?:\s*ID)?|M-?PESA\s*Ref)[:\s#-]*([A-Z0-9]{8,14})/i)?.[1];
  const transactionRef = (startRef || explicitRef || '').toUpperCase();
  if (!transactionRef || !/[A-Z]/.test(transactionRef) || !/\d/.test(transactionRef)) {
    return null;
  }

  // Amount in KES / Ksh
  const amountMatch = text.match(/(?:Ksh|KES)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (!amountMatch) return null;
  const amountMinor = Number(parse_kes(amountMatch[1]));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return null;

  // Payee / Lender name
  const payeeMatch =
    text.match(/(?:paid\s+to|sent\s+to|transferred\s+to)\s+([A-Za-z0-9 &.,'-]{2,60}?)(?:\s+for\s+account|\s+on\s+\d|\.\s|\s+A\/C|$)/i)?.[1] ||
    sender;
  const payeeOrLender = payeeMatch ? payeeMatch.replace(/\s+/g, ' ').trim() : undefined;

  // Account / Loan reference (iterate matches so "from your account for ..." is skipped)
  let accountReference: string | undefined;
  const accMatches = text.matchAll(
    /(?:for\s+account|Loan\s*(?:A\/C|No\.?)|A\/C(?:\s*No\.?)?|Account\s*(?:No\.?|Number)?[:#-]?)\s+([A-Za-z0-9-]{3,30})/gi
  );
  for (const m of accMatches) {
    const candidate = m[1]?.trim();
    if (candidate && !/^(for|on|at|to|from|loan|bank|and|the|has|was)$/i.test(candidate)) {
      accountReference = candidate;
      break;
    }
  }

  // Paybill / Till number
  const paybillOrTill =
    text.match(/(?:Paybill|Business\s*No\.?|Till(?:\s*No\.?)?)[:\s#-]*(\d{4,10})/i)?.[1]?.trim() ||
    undefined;

  const method: 'mpesa' | 'bank_transfer' =
    /mpesa|m-pesa|ksh/i.test(sender || '') || Boolean(startRef) ? 'mpesa' : 'bank_transfer';

  const refDate = occurredAtIso ? new Date(occurredAtIso) : new Date();
  const paymentDate = Number.isNaN(refDate.getTime())
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
    : refDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  return {
    transactionRef,
    amountMinor,
    method,
    payeeOrLender,
    accountReference,
    paybillOrTill,
    paymentDate,
    rawText: text,
  };
}
