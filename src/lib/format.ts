/**
 * HEMS Formatting Utilities
 * Strictly enforces Rule 2: Money is bigint minor units (cents). KSh 10,000 = 1,000,000. Never floats.
 */

export function fmt_kes(
  minorUnits: bigint | number | null | undefined,
  options: { showCents?: boolean; prefix?: string } = {}
): string {
  if (minorUnits === null || minorUnits === undefined) {
    return 'KSh 0.00';
  }

  const prefix = options.prefix ?? 'KSh ';
  const showCents = options.showCents ?? true;
  const isNegative = typeof minorUnits === 'bigint' ? minorUnits < 0n : minorUnits < 0;
  const absUnits = typeof minorUnits === 'bigint' 
    ? (minorUnits < 0n ? -minorUnits : minorUnits)
    : Math.abs(minorUnits);

  const majorPart = typeof absUnits === 'bigint' ? absUnits / 100n : Math.floor(absUnits / 100);
  const minorPart = typeof absUnits === 'bigint' ? absUnits % 100n : Math.round(absUnits % 100);

  // Format integer portion with thousands commas
  const majorFormatted = majorPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const minorFormatted = minorPart.toString().padStart(2, '0');

  const sign = isNegative ? '-' : '';
  if (!showCents && minorPart === (typeof absUnits === 'bigint' ? 0n : 0)) {
    return `${sign}${prefix}${majorFormatted}`;
  }

  return `${sign}${prefix}${majorFormatted}.${minorFormatted}`;
}

/**
 * Parses user input into bigint minor units (cents).
 * KSh "10,000.50" -> 1000050n
 */
export function parse_kes(input: string | number): bigint {
  if (typeof input === 'number') {
    return BigInt(Math.round(input * 100));
  }
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned || cleaned === '-') return 0n;

  const parts = cleaned.split('.');
  const integerPart = parts[0] ? BigInt(parts[0]) : 0n;
  const isNegative = cleaned.startsWith('-');
  
  if (parts.length > 1) {
    const fractionString = (parts[1] + '00').slice(0, 2);
    const fractionPart = BigInt(fractionString);
    const result = (isNegative ? -1n : 1n) * (BigInt(Math.abs(Number(integerPart))) * 100n + fractionPart);
    return result;
  }

  return integerPart * 100n;
}

/**
 * Normalizes MSISDN to standard +254 Kenyan format
 */
export function normalize_msisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.slice(1);
  }
  if (digits.startsWith('7') && digits.length === 9) {
    return '254' + digits;
  }
  if (digits.startsWith('1') && digits.length === 9) {
    return '254' + digits;
  }
  return digits;
}

/**
 * Formats a phone number for UI display
 */
export function fmt_phone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const norm = normalize_msisdn(phone);
  if (norm.length === 12 && norm.startsWith('254')) {
    return `+254 ${norm.slice(3, 6)} ${norm.slice(6, 9)} ${norm.slice(9)}`;
  }
  return phone;
}

/**
 * Formats date into Nairobi business-local representation
 */
export function fmt_date(date: string | Date | null | undefined, includeTime = false): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}
