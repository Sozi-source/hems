import { parse_kes } from '@/lib/format';

export interface ParsedStatementRow {
  rowNumber: number;
  occurredAt: string;
  transactionRef: string;
  amountMinor: number;
  payerName?: string;
  accountReference?: string;
  rawDescription: string;
  provider: 'bank_equity' | 'bank_absa' | 'bank';
  isValid: boolean;
  error?: string;
}

export interface StatementParseResult {
  detectedBank: 'equity' | 'absa' | 'generic';
  totalRows: number;
  validRows: ParsedStatementRow[];
  skippedRows: { rowNumber: number; reason: string; raw: string }[];
  totalCreditMinor: number;
}

/**
 * Splits CSV lines safely, respecting double-quoted values containing commas.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalizes different date formats to ISO string (Nairobi UTC+3 aware)
 */
function normalizeDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  // 1. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    const hour = (dmyMatch[4] || '12').padStart(2, '0');
    const minute = (dmyMatch[5] || '00').padStart(2, '0');
    const second = (dmyMatch[6] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`;
  }

  // 2. DD-MMM-YYYY (e.g. 14-Oct-2026 or 14-OCT-2026)
  const dMmmYMatch = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (dMmmYMatch) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const day = dMmmYMatch[1].padStart(2, '0');
    const month = months[dMmmYMatch[2].toLowerCase()] || '01';
    const year = dMmmYMatch[3];
    return `${year}-${month}-${day}T12:00:00+03:00`;
  }

  // 3. YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${trimmed.slice(0, 10)}T12:00:00+03:00`;
  }

  // Fallback to now
  return new Date().toISOString();
}

/**
 * Parses bank statement CSV content from Equity Bank, ABSA, or standard formats.
 */
export function parseBankStatementCsv(csvContent: string): StatementParseResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      detectedBank: 'generic',
      totalRows: 0,
      validRows: [],
      skippedRows: [{ rowNumber: 1, reason: 'File is empty or missing headers', raw: '' }],
      totalCreditMinor: 0,
    };
  }

  // Find header row (some bank exports have metadata rows at the top)
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parsed = parseCsvLine(lines[i]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (
      parsed.some((h) => h.includes('date')) &&
      (parsed.some((h) => h.includes('credit') || h.includes('amount') || h.includes('paidin') || h.includes('deposit')) ||
       parsed.some((h) => h.includes('narrative') || h.includes('description') || h.includes('particulars')))
    ) {
      headerIndex = i;
      headers = parseCsvLine(lines[i]);
      break;
    }
  }

  if (headerIndex === -1) {
    // Default to first row
    headerIndex = 0;
    headers = parseCsvLine(lines[0]);
  }

  const cleanHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Detect column indexes
  const dateCol = cleanHeaders.findIndex((h) => h.includes('date') || h.includes('txn'));
  const descCol = cleanHeaders.findIndex((h) =>
    h.includes('narrative') || h.includes('description') || h.includes('particulars') || h.includes('details')
  );
  const refCol = cleanHeaders.findIndex((h) =>
    h.includes('ref') || h.includes('txnid') || h.includes('receipt') || h.includes('cheque')
  );
  let creditCol = cleanHeaders.findIndex((h) =>
    h.includes('credit') || h.includes('paidin') || h.includes('deposit') || h.includes('cr')
  );
  const debitCol = cleanHeaders.findIndex((h) =>
    h.includes('debit') || h.includes('paidout') || h.includes('withdrawal') || h.includes('dr')
  );
  const amountCol = cleanHeaders.findIndex((h) => h === 'amount');

  // Detect bank
  let detectedBank: 'equity' | 'absa' | 'generic' = 'generic';
  const allHeaderStr = headers.join(' ').toLowerCase();
  const fileSnippet = lines.slice(0, 5).join(' ').toLowerCase();
  if (allHeaderStr.includes('eazzy') || fileSnippet.includes('equity') || cleanHeaders.includes('valuedate')) {
    detectedBank = 'equity';
  } else if (allHeaderStr.includes('absa') || fileSnippet.includes('absa')) {
    detectedBank = 'absa';
  }

  const validRows: ParsedStatementRow[] = [];
  const skippedRows: { rowNumber: number; reason: string; raw: string }[] = [];
  let totalCreditMinor = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = parseCsvLine(rawLine);
    if (cols.length < 2 || cols.every((c) => !c)) {
      continue; // empty row
    }

    const rowNumber = i + 1;
    const rawDesc = descCol >= 0 ? cols[descCol] || '' : '';
    const rawDate = dateCol >= 0 ? cols[dateCol] || '' : '';
    const rawRef = refCol >= 0 ? cols[refCol] || '' : '';

    // Calculate credit amount
    let creditAmount = 0n;
    if (creditCol >= 0 && cols[creditCol]) {
      creditAmount = parse_kes(cols[creditCol]);
    } else if (amountCol >= 0 && cols[amountCol]) {
      // Single amount column: positive = credit, negative = debit
      const parsedAmount = parse_kes(cols[amountCol]);
      if (parsedAmount > 0n && (!debitCol || !cols[debitCol])) {
        creditAmount = parsedAmount;
      }
    }

    // Skip debit rows or 0 amount rows
    if (creditAmount <= 0n) {
      skippedRows.push({
        rowNumber,
        reason: 'Debit/non-credit transaction or zero amount',
        raw: rawLine,
      });
      continue;
    }

    // Extract M-Pesa reference or Bank transaction reference
    // 1. Look for M-Pesa 10-char receipt format in reference or narrative
    let transactionRef = '';
    const mpesaMatch = `${rawRef} ${rawDesc}`.match(/\b([A-Z0-9]{10})\b/);
    if (mpesaMatch) {
      transactionRef = mpesaMatch[1].toUpperCase();
    } else if (rawRef && rawRef.length >= 6) {
      transactionRef = rawRef.trim().toUpperCase();
    } else {
      // Fallback hash/generated ref from date and row
      transactionRef = `BNK-${Date.now().toString(36).toUpperCase()}-${rowNumber}`;
    }

    // Extract Account / BillRef (e.g., "ACC: CUST01", "REF: CD0001", "INV: 102")
    const accMatch = rawDesc.match(/(?:ACC(?:OUNT)?|REF(?:ERENCE)?|INV(?:OICE)?|BILLREF)\s*:?\s*([A-Za-z0-9_-]{2,30})/i);
    const accountReference = accMatch ? accMatch[1].trim() : undefined;

    // Extract Payer Name from narrative
    let payerName: string | undefined;
    const mpesaSlashMatch = rawDesc.match(/MPESA\s*\/?\s*[A-Z0-9]{8,12}\s*\/?\s*([A-Za-z\s]{3,35})(?:\/|$|-)/i);
    if (mpesaSlashMatch) {
      payerName = mpesaSlashMatch[1].trim();
    } else {
      const fromMatch = rawDesc.match(/(?:from|by)\s+([A-Za-z\s]{3,35}?)(?:\s+for|\s+acc|\s+ref|\.|$)/i);
      if (fromMatch && !/mpesa/i.test(fromMatch[1])) {
        payerName = fromMatch[1].trim();
      }
    }

    const provider = detectedBank === 'equity' ? 'bank_equity' : detectedBank === 'absa' ? 'bank_absa' : 'bank';
    const amountMinor = Number(creditAmount);
    totalCreditMinor += amountMinor;

    validRows.push({
      rowNumber,
      occurredAt: normalizeDate(rawDate),
      transactionRef,
      amountMinor,
      payerName,
      accountReference,
      rawDescription: rawDesc || rawLine,
      provider,
      isValid: true,
    });
  }

  return {
    detectedBank,
    totalRows: lines.length - (headerIndex + 1),
    validRows,
    skippedRows,
    totalCreditMinor,
  };
}
