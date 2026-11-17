export type LoanType = 'bank_loan' | 'asset_financing' | 'mobile_loan' | 'other';
export type InterestMethod = 'reducing_balance' | 'flat';
export type CalculatorFrequency = 'monthly' | 'yearly';
export type LoanStatus = 'active' | 'fully_paid' | 'defaulted';

export interface LoanPaymentDetails {
  paybill?: string;
  till?: string;
  account_number?: string;
  bank_account?: string;
  reference?: string;
}

export interface AmortizationRow {
  instalment_no: number;
  due_date: string; // YYYY-MM-DD
  opening_balance_minor: number;
  instalment_minor: number;
  interest_minor: number;
  principal_minor: number;
  closing_balance_minor: number;
}

export interface AmortizationScheduleResult {
  rows: AmortizationRow[];
  monthly_instalment_minor: number;
  total_interest_minor: number;
  total_payable_minor: number;
  first_due_date: string;
  maturity_date: string;
}

/**
 * Computes the due date for a given month offset from dateTakenIso,
 * clamping repaymentDay (1-31) to the last day of that target month.
 */
export function computeDueDateForOffset(
  dateTakenIso: string,
  monthsOffset: number,
  repaymentDay: number
): string {
  const [yStr, mStr] = dateTakenIso.split('-');
  const baseYear = parseInt(yStr, 10);
  const baseMonthIndex = parseInt(mStr, 10) - 1; // 0-based

  const totalMonths = baseYear * 12 + baseMonthIndex + monthsOffset;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = totalMonths % 12;

  const daysInMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, Math.trunc(repaymentDay)), daysInMonth);

  const mm = String(targetMonthIndex + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

/**
 * Determines the first due date >= dateTakenIso (or next month if repaymentDay already passed).
 * If dateTaken is e.g. 2026-11-05 and repaymentDay is 20, first due date is 2026-11-20 or 2026-12-20?
 * Standard bank loans have first instalment 1 month after date taken; we also allow an explicit firstDueDate override.
 */
export function resolveFirstDueDate(
  dateTakenIso: string,
  repaymentDay: number,
  explicitFirstDueDate?: string | null
): string {
  if (explicitFirstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitFirstDueDate)) {
    return explicitFirstDueDate;
  }
  return computeDueDateForOffset(dateTakenIso, 1, repaymentDay);
}

/**
 * Calculates the standard monthly instalment in minor units (cents)
 * using either reducing-balance PMT or flat-rate interest.
 */
export function calculateMonthlyInstalmentMinor(
  principalMinor: number,
  annualRatePct: number,
  termMonths: number,
  method: InterestMethod = 'reducing_balance'
): number {
  if (principalMinor <= 0 || termMonths <= 0) return 0;

  if (method === 'flat') {
    const totalInterest = Math.round(principalMinor * (annualRatePct / 100) * (termMonths / 12));
    return Math.round((principalMinor + totalInterest) / termMonths);
  }

  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) {
    return Math.round(principalMinor / termMonths);
  }

  const factor = Math.pow(1 + monthlyRate, termMonths);
  const pmt = (principalMinor * monthlyRate * factor) / (factor - 1);
  return Math.round(pmt);
}

/**
 * Generates a full amortization schedule in integer minor units.
 * - Period interest = round(opening_balance * monthly_rate) for reducing balance
 * - Principal = instalment - interest
 * - Final instalment adjusts principal to clear opening_balance exactly to 0.
 */
export function generateAmortizationSchedule(params: {
  principalMinor: number;
  annualRatePct: number;
  termMonths: number;
  dateTaken: string;
  repaymentDay: number;
  firstDueDate?: string | null;
  method?: InterestMethod;
  overrideInstalmentMinor?: number | null;
  startInstalmentNo?: number;
}): AmortizationScheduleResult {
  const {
    principalMinor,
    annualRatePct,
    termMonths,
    dateTaken,
    repaymentDay,
    firstDueDate,
    method = 'reducing_balance',
    overrideInstalmentMinor,
    startInstalmentNo = 1,
  } = params;

  if (principalMinor <= 0) {
    throw new Error('Principal amount must be greater than zero.');
  }
  if (termMonths <= 0 || !Number.isInteger(termMonths)) {
    throw new Error('Repayment period must be a positive whole number of months.');
  }
  if (annualRatePct < 0) {
    throw new Error('Interest rate cannot be negative.');
  }

  const computedInstalment = calculateMonthlyInstalmentMinor(
    principalMinor,
    annualRatePct,
    termMonths,
    method
  );
  const baseInstalment =
    overrideInstalmentMinor && overrideInstalmentMinor > 0
      ? Math.round(overrideInstalmentMinor)
      : computedInstalment;

  const monthlyRate = annualRatePct / 100 / 12;
  const resolvedFirstDue = resolveFirstDueDate(dateTaken, repaymentDay, firstDueDate);
  const rows: AmortizationRow[] = [];

  let opening = Math.round(principalMinor);
  let totalInterest = 0;

  const flatMonthlyInterest =
    method === 'flat'
      ? Math.round((principalMinor * (annualRatePct / 100) * (termMonths / 12)) / termMonths)
      : 0;

  for (let i = 0; i < termMonths; i++) {
    const dueDate =
      i === 0 ? resolvedFirstDue : computeDueDateForOffset(resolvedFirstDue, i, repaymentDay);

    if (opening <= 0) {
      break;
    }

    const interest =
      method === 'flat' ? flatMonthlyInterest : Math.round(opening * monthlyRate);

    const isLast = i === termMonths - 1;
    let principal: number;
    let instalment: number;

    if (isLast) {
      principal = opening;
      instalment = principal + interest;
    } else {
      // Ensure principal is non-negative and doesn't exceed remaining opening balance
      const rawPrincipal = baseInstalment - interest;
      if (rawPrincipal >= opening) {
        principal = opening;
        instalment = principal + interest;
      } else if (rawPrincipal <= 0) {
        // Guard against manual override below monthly interest: pay interest only, principal 0
        principal = 0;
        instalment = baseInstalment;
      } else {
        principal = rawPrincipal;
        instalment = baseInstalment;
      }
    }

    const closing = Math.max(0, opening - principal);
    totalInterest += interest;

    rows.push({
      instalment_no: startInstalmentNo + i,
      due_date: dueDate,
      opening_balance_minor: opening,
      instalment_minor: instalment,
      interest_minor: interest,
      principal_minor: principal,
      closing_balance_minor: closing,
    });

    opening = closing;
  }

  const lastRow = rows[rows.length - 1];
  return {
    rows,
    monthly_instalment_minor: baseInstalment,
    total_interest_minor: totalInterest,
    total_payable_minor: rows.reduce((sum, r) => sum + r.instalment_minor, 0),
    first_due_date: rows[0]?.due_date || resolvedFirstDue,
    maturity_date: lastRow?.due_date || resolvedFirstDue,
  };
}

/**
 * Pure calculator helper matching the Loan Calculator UI:
 * supports Reducing / Flat and Monthly / Yearly frequency.
 */
export function calculateLoanPreview(params: {
  amountMinor: number;
  annualRatePct: number;
  periodMonths: number;
  method: InterestMethod;
  frequency: CalculatorFrequency;
}) {
  const { amountMinor, annualRatePct, periodMonths, method, frequency } = params;
  const effectiveAnnualRate = frequency === 'yearly' ? annualRatePct : annualRatePct * 12;
  const todayIso = new Date().toISOString().slice(0, 10);

  return generateAmortizationSchedule({
    principalMinor: amountMinor,
    annualRatePct: effectiveAnnualRate,
    termMonths: periodMonths,
    dateTaken: todayIso,
    repaymentDay: parseInt(todayIso.slice(8, 10), 10),
    method,
  });
}
