import { fmt_date, fmt_kes } from '../format.ts';

export interface ReminderDecision {
  daysOffset: number; // positive = days remaining, 0 = due today, negative = -days_overdue
  label: string;
}

/**
 * Pure reminder schedule evaluator:
 * - Stops immediately once the instalment is recorded AND verified (isVerified === true).
 * - 3, 2, 1 days before due date -> "3 days remaining", "2 days remaining", "1 day remaining"
 * - On due date -> "Payment due today"
 * - 1+ days past due date -> "Overdue by N days" (daily)
 */
export function evaluateLoanReminderSchedule(
  dueDateIso: string,
  todayIso: string,
  isVerified: boolean
): ReminderDecision | null {
  if (isVerified) return null;

  const dueMs = Date.parse(`${dueDateIso}T00:00:00Z`);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return null;

  const diffDays = Math.round((dueMs - todayMs) / 86400000);

  if (diffDays > 3) return null;
  if (diffDays === 3) return { daysOffset: 3, label: '3 days remaining' };
  if (diffDays === 2) return { daysOffset: 2, label: '2 days remaining' };
  if (diffDays === 1) return { daysOffset: 1, label: '1 day remaining' };
  if (diffDays === 0) return { daysOffset: 0, label: 'Payment due today' };

  const overdueDays = Math.abs(diffDays);
  return {
    daysOffset: -overdueDays,
    label: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
  };
}

export function buildLoanReminderMessage(params: {
  lenderName: string;
  businessName: string;
  amountDueMinor: number;
  dueDateIso: string;
  decision: ReminderDecision;
  paymentDetails?: Record<string, string | undefined>;
}): string {
  const { lenderName, businessName, amountDueMinor, dueDateIso, decision, paymentDetails } = params;
  const amountStr = fmt_kes(amountDueMinor, { showCents: false });
  const dueStr = fmt_date(dueDateIso);

  const pd = paymentDetails || {};
  const payParts: string[] = [];
  if (pd.paybill) payParts.push(`Paybill ${pd.paybill}`);
  if (pd.till) payParts.push(`Till ${pd.till}`);
  if (pd.account_number) payParts.push(`Acc ${pd.account_number}`);
  if (pd.bank_account) payParts.push(`Bank ${pd.bank_account}`);
  if (pd.reference && pd.reference !== pd.bank_account) payParts.push(`Ref ${pd.reference}`);
  const payInfo = payParts.length > 0 ? payParts.join(', ') : 'See HEMS loan details';

  return `LOAN REMINDER (${decision.label}): ${businessName} - ${lenderName}. Amount due: ${amountStr}, Due: ${dueStr}. Pay via: ${payInfo}.`;
}
