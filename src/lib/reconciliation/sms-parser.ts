import { parse_kes, normalize_msisdn as normalizePhone } from '@/lib/format';

export interface ParsedPaymentAlert {
  provider: 'mpesa' | 'bank_equity' | 'bank_absa' | 'bank';
  transactionRef: string;
  amountMinor: number;
  payerName?: string;
  payerPhone?: string;
  accountReference?: string;
  occurredAt?: string;
  rawText: string;
  detectedFormat: 'mpesa_c2b' | 'equity_credit' | 'absa_credit' | 'generic';
}

/**
 * Parses raw SMS or alert notification text from M-Pesa, Equity Bank, or ABSA Bank.
 */
export function parsePaymentAlert(rawText: string): ParsedPaymentAlert | null {
  const text = rawText.trim();
  if (!text || text.length < 15) return null;

  // 1. Safaricom M-Pesa direct SMS pattern
  // Example: "QA12BC34DE Confirmed. Ksh1,500.00 received from JOHN DOE 0712345678 on 14/10/26 at 2:30 PM. New M-PESA balance..."
  // Example: "QA12BC34DE Confirmed. You have received Ksh2,000.00 from 254712345678 - JANE DOE on 14/10/2026..."
  const mpesaMatch = text.match(/^([A-Z0-9]{10})\s+Confirmed\./i);
  if (mpesaMatch) {
    const transactionRef = mpesaMatch[1].toUpperCase();
    const amountMatch = text.match(/(?:Ksh|KES)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const amountMinor = amountMatch ? Number(parse_kes(amountMatch[1])) : 0;

    // Payer name and phone
    let payerName: string | undefined;
    let payerPhone: string | undefined;

    const fromMatch = text.match(/received from\s+([^0-9]+?)\s+(0[17]\d{8}|254[17]\d{8})/i);
    if (fromMatch) {
      payerName = fromMatch[1].trim();
      payerPhone = normalizePhone(fromMatch[2]);
    } else {
      const altFromMatch = text.match(/from\s+(0[17]\d{8}|254[17]\d{8})\s*[-–]\s*([A-Za-z\s]+?)(?:\s+on|\.)/i);
      if (altFromMatch) {
        payerPhone = normalizePhone(altFromMatch[1]);
        payerName = altFromMatch[2].trim();
      }
    }

    // Account ref (e.g., "for account CUST01")
    const accMatch = text.match(/(?:for\s+account|acc(?:ount)?\.?|ref(?:erence)?\.?)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    return {
      provider: 'mpesa',
      transactionRef,
      amountMinor,
      payerName,
      payerPhone,
      accountReference,
      occurredAt: new Date().toISOString(),
      rawText: text,
      detectedFormat: 'mpesa_c2b',
    };
  }

  // 2. Equity Bank credit alert SMS
  // Example: "Dear Customer, KES 5,000.00 has been credited to your account 0123456789 from MPESA REF QA12BC34DE on 14/10/2026. Bal KES 50,000.00."
  // Example: "Credit Alert: KES 1,200.00 credited to A/C ... Ref: QA12BC34DE / JOHN DOE / CUST01"
  if (/equity/i.test(text) || /(?:credited to your account|credited to a\/c).*mpesa ref/i.test(text)) {
    const refMatch = text.match(/(?:MPESA REF|REF(?:\s*NO)?:?)\s*([A-Z0-9]{8,14})/i);
    const transactionRef = refMatch ? refMatch[1].toUpperCase() : '';
    const amountMatch = text.match(/(?:KES|KSH)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const amountMinor = amountMatch ? Number(parse_kes(amountMatch[1])) : 0;

    // Check for customer account / invoice ref
    const accMatch = text.match(/(?:acc(?:ount)?|inv(?:oice)?|billref)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    // Check for payer name in narrative
    const nameMatch = text.match(/(?:from|by)\s+([A-Za-z\s]{3,35}?)(?:\s+on|\s+ref|\.|$)/i);
    const payerName = nameMatch && !/mpesa/i.test(nameMatch[1]) ? nameMatch[1].trim() : undefined;

    if (transactionRef && amountMinor > 0) {
      return {
        provider: 'bank_equity',
        transactionRef,
        amountMinor,
        payerName,
        accountReference,
        occurredAt: new Date().toISOString(),
        rawText: text,
        detectedFormat: 'equity_credit',
      };
    }
  }

  // 3. ABSA Bank credit alert SMS
  // Example: "Credit alert: Account ending 1234 has been credited with KES 4,500.00. Ref: QA12BC34DE. Available balance is..."
  // Example: "Dear Customer, your ABSA account 0123... credited with KES 2,500.00 from M-PESA REF QA12BC34DE"
  if (/absa/i.test(text) || /credit alert:.*credited with\s+kes/i.test(text)) {
    const refMatch = text.match(/(?:Ref(?:\s*No)?:?|MPESA REF:?)\s*([A-Z0-9]{8,14})/i);
    const transactionRef = refMatch ? refMatch[1].toUpperCase() : '';
    const amountMatch = text.match(/(?:KES|KSH)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    const amountMinor = amountMatch ? Number(parse_kes(amountMatch[1])) : 0;

    const accMatch = text.match(/(?:acc(?:ount)?|inv(?:oice)?|billref)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    if (transactionRef && amountMinor > 0) {
      return {
        provider: 'bank_absa',
        transactionRef,
        amountMinor,
        accountReference,
        occurredAt: new Date().toISOString(),
        rawText: text,
        detectedFormat: 'absa_credit',
      };
    }
  }

  // 4. Generic Kenyan Bank / M-Pesa pattern fallback
  // Looks for any 10-char M-Pesa ref and a KES/KSh amount
  const genericRefMatch = text.match(/\b([A-Z0-9]{10})\b/);
  const genericAmountMatch = text.match(/(?:KES|KSH|Ksh)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);

  if (genericRefMatch && genericAmountMatch) {
    const transactionRef = genericRefMatch[1].toUpperCase();
    const amountMinor = Number(parse_kes(genericAmountMatch[1]));

    const phoneMatch = text.match(/\b(0[17]\d{8}|254[17]\d{8})\b/);
    const payerPhone = phoneMatch ? normalizePhone(phoneMatch[1]) : undefined;

    const accMatch = text.match(/(?:acc(?:ount)?|inv(?:oice)?|ref|bill)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    if (amountMinor > 0) {
      return {
        provider: 'bank',
        transactionRef,
        amountMinor,
        payerPhone,
        accountReference,
        occurredAt: new Date().toISOString(),
        rawText: text,
        detectedFormat: 'generic',
      };
    }
  }

  return null;
}
