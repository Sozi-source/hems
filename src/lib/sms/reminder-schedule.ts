import { fmt_kes } from '../format.ts';

export interface ReminderDebtAnchor {
  due_date: string | null;
  issue_date: string;
  reference_no?: string | null;
}

export interface DebtReminderDecision<T extends ReminderDebtAnchor = ReminderDebtAnchor> {
  mode: 'overdue' | 'due_soon';
  primaryDebt: T;
  commonDueDateStr: string;
  daysValue: number;
  offsetDays: number;
}

export function formatReminderDueDate(dueDateStr: string | null, todayStr: string): string {
  if (!dueDateStr) return 'Not set';
  try {
    const d = new Date(dueDateStr + 'T00:00:00Z');
    const today = new Date(todayStr + 'T00:00:00Z');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getUTCDate();
    const month = months[d.getUTCMonth()];
    if (d.getUTCFullYear() === today.getUTCFullYear()) {
      return `${day} ${month}`;
    }
    return `${day} ${month} ${d.getUTCFullYear()}`;
  } catch {
    return dueDateStr;
  }
}

export function renderReminderTemplate(tpl: string, vars: Record<string, string>): string {
  let result = tpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v ?? '');
  }
  return result;
}

/**
 * Normalizes a due-soon template when daysValue === 0 (due today) so it reads
 * "today" instead of "0d" or "0 days".
 */
export function normalizeDueTodayTemplate(tpl: string): string {
  return tpl
    .replace(/\bdue\s+in\s+\{\{days_remaining\}\}\s*(?:day\(s\)|days?|d)?(?=\s|\.|,|;|:|\(|$)/gi, 'due today')
    .replace(/\bin\s+\{\{days_remaining\}\}\s*(?:day\(s\)|days?|d)(?=\s|\.|,|;|:|\(|$)/gi, 'today')
    .replace(/\{\{days_remaining\}\}\s*(?:day\(s\)|days?|d)\s*left\b/gi, 'due today')
    .replace(/\{\{days_remaining\}\}\s*(?:day\(s\)|days?|d)(?=\s|\.|,|;|:|\(|$)/gi, 'today');
}

/**
 * Evaluates merged customer debt reminders using a common due date:
 * - Priority 1: Any overdue debt -> oldest overdue date (FIFO anchor), daily reminder.
 * - Priority 2: Upcoming debts -> nearest upcoming date if <= 3 days remaining (0 = due today).
 */
export function evaluateCustomerDebtReminder<T extends ReminderDebtAnchor>(
  debts: T[],
  todayStr: string
): DebtReminderDecision<T> | null {
  const todayDate = new Date(`${todayStr}T00:00:00Z`);
  if (Number.isNaN(todayDate.getTime())) return null;

  const overdueDebts: Array<{ debt: T; anchorStr: string; diffDays: number }> = [];
  const upcomingDebts: Array<{ debt: T; anchorStr: string; diffDays: number }> = [];

  for (const d of debts) {
    const anchorStr = d.due_date || d.issue_date;
    if (!anchorStr) continue;
    const anchorDate = new Date(`${anchorStr}T00:00:00Z`);
    if (Number.isNaN(anchorDate.getTime())) continue;
    const diffDays = Math.round((todayDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      overdueDebts.push({ debt: d, anchorStr, diffDays });
    } else {
      upcomingDebts.push({ debt: d, anchorStr, diffDays });
    }
  }

  if (overdueDebts.length > 0) {
    overdueDebts.sort((a, b) => a.anchorStr.localeCompare(b.anchorStr));
    const oldest = overdueDebts[0];
    return {
      mode: 'overdue',
      primaryDebt: oldest.debt,
      commonDueDateStr: oldest.anchorStr,
      daysValue: oldest.diffDays,
      offsetDays: oldest.diffDays,
    };
  }

  if (upcomingDebts.length > 0) {
    upcomingDebts.sort((a, b) => a.anchorStr.localeCompare(b.anchorStr));
    const nearest = upcomingDebts[0];
    const daysRemaining = nearest.diffDays === 0 ? 0 : -nearest.diffDays;
    if (daysRemaining <= 3) {
      return {
        mode: 'due_soon',
        primaryDebt: nearest.debt,
        commonDueDateStr: nearest.anchorStr,
        daysValue: daysRemaining,
        offsetDays: daysRemaining === 0 ? 0 : -daysRemaining,
      };
    }
  }

  return null;
}

export function buildCustomerReminderSms(params: {
  businessCode: string;
  businessName: string;
  customerFullName: string;
  customerNo: string;
  totalBalanceMinor: number;
  totalOriginalMinor: number;
  debtCount: number;
  primaryReferenceNo?: string | null;
  commonDueDateStr: string;
  todayStr: string;
  mode: 'overdue' | 'due_soon';
  daysValue: number;
  paybill?: string;
  templates?: {
    overdue?: string;
    dueToday?: string;
    dueSoon?: string;
    fallback?: string;
  };
}): { text: string; formattedDue: string } {
  const {
    businessCode,
    businessName,
    customerFullName,
    customerNo,
    totalBalanceMinor,
    totalOriginalMinor,
    debtCount,
    primaryReferenceNo,
    commonDueDateStr,
    todayStr,
    mode,
    daysValue,
    paybill = '',
    templates = {},
  } = params;

  const formattedDue = formatReminderDueDate(commonDueDateStr, todayStr);
  const firstName = (customerFullName || 'Customer').trim().split(/\s+/)[0].slice(0, 12);
  const isZenith = businessCode === 'ZENITH_PLAST';

  let tplBody = '';
  if (mode === 'overdue') {
    tplBody =
      templates.overdue ||
      templates.fallback ||
      (isZenith
        ? 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}} days overdue. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496'
        : 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}} days overdue. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796');
  } else if (daysValue === 0) {
    if (templates.dueToday) {
      tplBody = templates.dueToday;
    } else if (templates.dueSoon || templates.fallback) {
      tplBody = normalizeDueTodayTemplate(templates.dueSoon || templates.fallback || '');
    } else {
      tplBody = isZenith
        ? 'Dear {{first_name}}, reminder: bal {{balance}} due today ({{due_date}}). Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496'
        : 'Dear {{first_name}}, reminder: bal {{balance}} due today ({{due_date}}). Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796';
    }
  } else {
    tplBody =
      templates.dueSoon ||
      templates.fallback ||
      (isZenith
        ? 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496'
        : 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796');
  }

  let text = renderReminderTemplate(tplBody, {
    first_name: firstName,
    customer_name: customerFullName,
    business_name: businessName,
    balance: fmt_kes(totalBalanceMinor, { showCents: false }),
    original: fmt_kes(totalOriginalMinor, { showCents: false }),
    reference: debtCount > 1 ? `${debtCount} debts` : (primaryReferenceNo || ''),
    due_date: formattedDue,
    days_overdue: String(daysValue),
    days_remaining: daysValue === 0 ? 'today' : String(daysValue),
    paybill,
    account: customerNo,
  });

  // Hard character guarantee: <= 160 characters (strictly avoiding 2 SMS carrier charges)
  if (text.length > 160) {
    text = text.slice(0, 160);
  }

  return { text, formattedDue };
}
