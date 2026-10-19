import { parse_kes, normalize_msisdn } from '@/lib/format';

export interface ParsedPaymentAlert {
  provider: 'mpesa' | 'bank_equity' | 'bank_ncba' | 'bank_absa' | 'bank';
  transactionRef: string;
  amountMinor: number;
  payerName?: string;
  payerPhone?: string;
  accountReference?: string;
  occurredAt?: string;
  rawText: string;
  detectedFormat: 'mpesa_c2b' | 'equity_credit' | 'ncba_credit' | 'absa_credit' | 'generic';
}

function cleanPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  // If phone is masked like "0700***522", preserve the mask for audit visibility
  if (trimmed.includes('*')) {
    return trimmed;
  }
  return normalize_msisdn(trimmed) || undefined;
}

function cleanName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2 || /^(balance|bal|new|is|phone|ref|thank\s*you)$/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}

function isValidTransactionRef(ref?: string | null): boolean {
  if (!ref) return false;
  const cleaned = ref.trim().toUpperCase();
  if (cleaned.length < 8 || cleaned.length > 14) return false;
  // Real M-Pesa/Bank transaction references contain at least one letter and at least one digit
  // (prevents 10-letter English words like ENTERPRISE or CONFIRMED from matching)
  return /^[A-Z0-9]+$/.test(cleaned) && /[A-Z]/.test(cleaned) && /\d/.test(cleaned);
}

/**
 * Checks whether an SMS text is clearly an outgoing debit, withdrawal, airtime purchase,
 * loan notification, reversal, or OTP message rather than an incoming customer payment.
 */
export function isNonCreditSms(rawText: string): boolean {
  const text = rawText.trim();
  // OTP / Verification codes / Balance inquiries
  if (/\b(otp|one[\s-]time\s+pin|verification\s+code|security\s+code|auth\s+code)\b/i.test(text)) {
    return true;
  }
  // Outgoing M-Pesa or Bank debit phrases
  if (
    /\b(sent\s+to|paid\s+to|you\s+bought|withdraw(?:n|al)?\s+from|debited|has\s+been\s+debited|reversed|reversal|fuliza\s+m-?pesa|transferred\s+to\s+m-?shwari|airtime\s+for)\b/i.test(
      text
    ) &&
    !/\b(you\s+have\s+received|received\s+from|has\s+been\s+credited|has\s+been\s+received\s+from|Via\s+MPESA\s+Ref)\b/i.test(
      text
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Parses raw SMS or alert notification text from Equity Bank, NCBA Bank, ABSA Bank, or Safaricom M-Pesa.
 * Supports both automatic Android SMS forwarder webhooks and manual clipboard paste.
 */
export function parsePaymentAlert(rawText: string, sender?: string): ParsedPaymentAlert | null {
  const text = rawText.trim();
  if (!text || text.length < 15) return null;
  if (isNonCreditSms(text)) return null;

  const senderStr = (sender || '').toUpperCase();

  // -------------------------------------------------------------------------
  // 1. EQUITY BANK CREDIT ALERTS
  // -------------------------------------------------------------------------
  // Format 1A (Paybill to account):
  // "Confirmed KES. 16,000.00 to HARON ENTERPRISE MULOT A/C Ref.Number 650166  Via MPESA Ref UJFA5AWCDW by NORAH CHELANGAT TANGUS Phone  on 15-10-2026 at 10:36.Thank you."
  // "Confirmed KES. 5,500.00 to HARON ENTERPRISE MULOT A/C Ref.Number 650166  Via MPESA Ref UJELU9STN8 by kipkorir festus Phone 254113761329 on 14-10-2026 at 17:49.Thank you."
  // Format 1B (Internal direct transfer):
  // "Confirmed. KES. 30,000.00 from IRENE MBITHE JAMES Phone No.  received Ref. UJFP7AE4QJ on 15-10-2026 at 00:17. Thank you"
  // Format 1C (Legacy EazzyNet / SMS):
  // "Dear Customer, KES 5,000.00 has been credited to your account from MPESA REF QA12BC34DE..."
  const isEquityCredit =
    /A\/C\s+Ref\.?Number/i.test(text) ||
    /received\s+Ref\.?\s*[A-Z0-9]{8,14}/i.test(text) ||
    /Via\s+MPESA\s+Ref/i.test(text) ||
    /credited to your account.*from MPESA REF/i.test(text) ||
    (senderStr.includes('EQUITY') && /\b(received|credited|Via\s+MPESA)\b/i.test(text));

  if (isEquityCredit) {
    const refMatch =
      text.match(/(?:Via\s+MPESA\s+Ref|received\s+Ref\.?|MPESA\s+REF|Ref(?:\s*No)?:?)\s*([A-Z0-9]{8,14})/i);
    const amountMatch = text.match(/(?:KES|KSH)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);

    if (refMatch && amountMatch && isValidTransactionRef(refMatch[1])) {
      const transactionRef = refMatch[1].toUpperCase();
      const amountMinor = Number(parse_kes(amountMatch[1]));

      // Account reference (e.g. "A/C Ref.Number 650166")
      const accMatch = text.match(/A\/C\s+Ref\.?Number\s+([A-Za-z0-9_-]+)/i);
      const accountReference = accMatch ? accMatch[1].trim() : undefined;

      // Payer Name & Phone
      let payerName: string | undefined;
      let payerPhone: string | undefined;

      const byMatch = text.match(/by\s+([A-Za-z.\s'’-]{2,45}?)\s+Phone\s*([0-9*]*)/i);
      if (byMatch) {
        payerName = cleanName(byMatch[1]);
        payerPhone = cleanPhone(byMatch[2]);
      } else {
        const fromMatch = text.match(/from\s+([A-Za-z.\s'’-]{2,45}?)\s+Phone\s+No\.?\s*([0-9*]*)/i);
        if (fromMatch) {
          payerName = cleanName(fromMatch[1]);
          payerPhone = cleanPhone(fromMatch[2]);
        }
      }

      if (transactionRef && amountMinor > 0) {
        return {
          provider: 'bank_equity',
          transactionRef,
          amountMinor,
          payerName,
          payerPhone,
          accountReference,
          rawText: text,
          detectedFormat: 'equity_credit',
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. NCBA BANK CREDIT ALERTS
  // -------------------------------------------------------------------------
  // Format 2A:
  // "Dear HARON M a transaction of KES 2,850.00 for 650166  has been received from TABITHA CHEPNGETICH  on 15/10/2026 12:10 PM. M-Pesa Ref: UJF2CADSKZ. NCBA, Go for it."
  // "Dear HARON M a transaction of KES 600.00 for 650166  has been received from MERCYLINE MORAA  on 15/10/2026 11:59 AM. M-Pesa Ref: UJFF2A3QVM. NCBA, Go for it."
  const isNcbaCredit =
    /transaction\s+of\s+KES.+has\s+been\s+received\s+from/i.test(text) ||
    ((senderStr.includes('NCBA') || /NCBA,\s*Go\s*for\s*it/i.test(text)) &&
      /\b(received\s+from|credited)\b/i.test(text));

  if (isNcbaCredit) {
    const refMatch =
      text.match(/M-Pesa\s+Ref:\s*([A-Z0-9]{8,14})/i) ||
      text.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])([A-Z0-9]{10})\b/);
    const amountMatch = text.match(/transaction\s+of\s+KES\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
      text.match(/(?:KES|KSH)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);

    if (refMatch && amountMatch && isValidTransactionRef(refMatch[1])) {
      const transactionRef = refMatch[1].toUpperCase();
      const amountMinor = Number(parse_kes(amountMatch[1]));

      const accMatch = text.match(/for\s+([A-Za-z0-9_-]+)\s+has\s+been\s+received/i);
      const accountReference = accMatch ? accMatch[1].trim() : undefined;

      const nameMatch = text.match(/received\s+from\s+([A-Za-z.\s'’-]{2,45}?)\s+on/i);
      const payerName = cleanName(nameMatch ? nameMatch[1] : undefined);

      if (transactionRef && amountMinor > 0) {
        return {
          provider: 'bank_ncba',
          transactionRef,
          amountMinor,
          payerName,
          accountReference,
          rawText: text,
          detectedFormat: 'ncba_credit',
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. ABSA BANK CREDIT ALERTS
  // -------------------------------------------------------------------------
  // Format 3A:
  // "Dear HARON ENTERPRISE MULOT, you have received KES10000.0 MPESA ref: UJFRM9EKOU to your account XX6709 from MELDA ATIENO ODONGO- 254728663176"
  // "Dear HARON ENTERPRISE MULOT, you have received KES45820.0 MPESA ref: UJE5OA62G1 to your account XX6709 from HUNNINGTONE KIPKOECH KORIR- 254746106825"
  const isAbsaCredit =
    /you\s+have\s+received\s+KES.*MPESA\s+ref:/i.test(text) ||
    /credit alert:.*credited with\s+kes/i.test(text) ||
    (senderStr.includes('ABSA') && /\b(you\s+have\s+received|credited\s+with)\b/i.test(text));

  if (isAbsaCredit) {
    const refMatch =
      text.match(/MPESA\s+ref:\s*([A-Z0-9]{8,14})/i) ||
      text.match(/Ref(?:\s*No)?:?\s*([A-Z0-9]{8,14})/i);
    const amountMatch = text.match(/KES\s*([0-9,]+(?:\.[0-9]+)?)/i);

    if (refMatch && amountMatch && isValidTransactionRef(refMatch[1])) {
      const transactionRef = refMatch[1].toUpperCase();
      const amountMinor = Number(parse_kes(amountMatch[1]));

      const accMatch = text.match(/to\s+your\s+account\s+([A-Za-z0-9_-]+)/i);
      const accountReference = accMatch ? accMatch[1].trim() : undefined;

      let payerName: string | undefined;
      let payerPhone: string | undefined;
      const fromMatch = text.match(/from\s+([A-Za-z.\s'’-]{2,45}?)\s*[-–]\s*([0-9*]+)/i);
      if (fromMatch) {
        payerName = cleanName(fromMatch[1]);
        payerPhone = cleanPhone(fromMatch[2]);
      }

      if (transactionRef && amountMinor > 0) {
        return {
          provider: 'bank_absa',
          transactionRef,
          amountMinor,
          payerName,
          payerPhone,
          accountReference,
          rawText: text,
          detectedFormat: 'absa_credit',
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. SAFARICOM M-PESA DIRECT INCOMING NOTIFICATIONS
  // -------------------------------------------------------------------------
  // Format 4A (Merchant Till Inflow):
  // "UJFMDAEN6H Confirmed.on 15/10/26 at 2:01 AMKSH5.00 received from 254711390861 WILFRED OSOZI. New Account balance is KSH25.00..."
  // Format 4B (Direct Inflow with Masked Phone):
  // "UJELS9NVU2 Confirmed.You have received Ksh1,400.00 from Caren  Chepkemoi 0700***522 on 14/10/26 at 5:33 PM  New M-PESA balance is Ksh8,970.86..."
  const mpesaMatch = text.match(/\b([A-Z0-9]{10})\s+Confirmed/i);
  const isMpesaIncoming = /\b(you\s+have\s+received|received\s+from)\b/i.test(text);

  if (mpesaMatch && isMpesaIncoming && isValidTransactionRef(mpesaMatch[1])) {
    const transactionRef = mpesaMatch[1].toUpperCase();
    const amountMatch = text.match(/(?:Ksh|KES)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const amountMinor = amountMatch ? Number(parse_kes(amountMatch[1])) : 0;

    let payerName: string | undefined;
    let payerPhone: string | undefined;

    // Pattern 4A1: Till SMS "AMKSH5.00 received from 254711390861 WILFRED OSOZI."
    const phoneFirstMatch = text.match(/received from\s+(0[17]\d{8}|254[17]\d{8})\s+([A-Za-z.\s'’-]{2,45}?)(?:\.|$)/i);
    if (phoneFirstMatch) {
      payerPhone = cleanPhone(phoneFirstMatch[1]);
      payerName = cleanName(phoneFirstMatch[2]);
    } else {
      // Pattern 4A2: Masked phone "from Caren  Chepkemoi 0700***522 on"
      const fromMaskedMatch = text.match(/(?:received|from)\s+([A-Za-z.\s'’-]{2,45}?)\s+([0-9*]{7,15})\s+on/i);
      if (fromMaskedMatch) {
        payerName = cleanName(fromMaskedMatch[1]);
        payerPhone = cleanPhone(fromMaskedMatch[2]);
      } else {
        // Pattern 4A3: Standard unmasked "received from JOHN DOE 0712345678"
        const fromMatch = text.match(/received from\s+([^0-9]+?)\s+(0[17]\d{8}|254[17]\d{8})/i);
        if (fromMatch) {
          payerName = cleanName(fromMatch[1]);
          payerPhone = cleanPhone(fromMatch[2]);
        }
      }
    }

    // Account ref or Till number (e.g. "for account CUST01")
    const accMatch = text.match(/(?:for\s+account|acc(?:ount)?\s*(?:no\.?|number|#|:)|ref(?:erence)?\.?)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    let accountReference = accMatch ? accMatch[1].trim() : undefined;
    if (accountReference && /^(balance|bal|new|is)$/i.test(accountReference)) {
      accountReference = undefined;
    }

    if (!accountReference) {
      const tillMatch = text.match(/(?:till|store|paybill|business)\s*(?:no\.?|number)?\s*:?\s*(\d{5,7})\b/i);
      if (tillMatch) {
        accountReference = tillMatch[1];
      }
    }

    if (transactionRef && amountMinor > 0) {
      return {
        provider: 'mpesa',
        transactionRef,
        amountMinor,
        payerName,
        payerPhone,
        accountReference,
        rawText: text,
        detectedFormat: 'mpesa_c2b',
      };
    }
  }

  // -------------------------------------------------------------------------
  // 5. GENERIC KENYAN BANK / M-PESA FALLBACK (for manual clipboard paste only)
  // -------------------------------------------------------------------------
  const hasCreditSignal = /\b(received|credited|payment\s+from|deposit)\b/i.test(text);
  const genericRefMatch = text.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])([A-Z0-9]{10})\b/);
  const genericAmountMatch = text.match(/(?:KES|KSH|Ksh)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);

  if (hasCreditSignal && genericRefMatch && genericAmountMatch && isValidTransactionRef(genericRefMatch[1])) {
    const transactionRef = genericRefMatch[1].toUpperCase();
    const amountMinor = Number(parse_kes(genericAmountMatch[1]));

    const phoneMatch = text.match(/\b(0[17]\d{8}|254[17]\d{8})\b/);
    const payerPhone = cleanPhone(phoneMatch ? phoneMatch[1] : undefined);

    const accMatch = text.match(/(?:acc(?:ount)?|inv(?:oice)?|ref|bill)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    if (amountMinor > 0) {
      return {
        provider: 'bank',
        transactionRef,
        amountMinor,
        payerPhone,
        accountReference,
        rawText: text,
        detectedFormat: 'generic',
      };
    }
  }

  return null;
}
