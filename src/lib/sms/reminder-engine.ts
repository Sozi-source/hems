import { createAdminClient } from '@/lib/supabase/admin';
import { fmt_kes } from '@/lib/format';

interface ObligationRow {
  id: string;
  business_id: string;
  kind: string;
  balance_minor: number;
  original_minor: number;
  due_date: string | null;
  issue_date: string;
  reference_no: string | null;
  customer_id: string | null;
  payee_name: string | null;
  description: string | null;
  status: string;
}

interface BusinessRow {
  id: string;
  code: string;
  name: string;
  timezone: string | null;
}

interface BusinessSettingsRow {
  business_id: string;
  sms_enabled: boolean;
  reminder_send_hour: number;
}

interface CustomerRow {
  id: string;
  full_name: string;
  customer_no: string;
  phone: string | null;
  sms_opt_out: boolean | null;
}

interface CustomerDebtGroup {
  bizId: string;
  customerId: string;
  debts: ObligationRow[];
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let result = tpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v ?? '');
  }
  return result;
}

function formatDueDate(dueDateStr: string | null, todayStr: string): string {
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

function computeScheduledAt(now: Date, timeZone: string, targetHour: number = 8): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const localYear = parseInt(get('year'), 10);
  const localMonth = parseInt(get('month'), 10) - 1;
  const localDay = parseInt(get('day'), 10);
  const localHour = parseInt(get('hour'), 10);

  if (localHour < targetHour) {
    const localNow = new Date(Date.UTC(localYear, localMonth, localDay, localHour, parseInt(get('minute'), 10)));
    const offsetMs = localNow.getTime() - now.getTime();
    const targetLocalMs = Date.UTC(localYear, localMonth, localDay, targetHour, 0, 0);
    return new Date(targetLocalMs - offsetMs).toISOString();
  }
  return now.toISOString();
}

/**
 * Runs due reminders check with customer-level debt merging:
 * 1. Groups active debt obligations by (business_id, customer_id).
 * 2. Merges multi-debt balances into one total outstanding amount.
 * 3. Calculates a common due date:
 *    - If any debt is overdue: uses the oldest overdue debt due date (FIFO anchor).
 *    - Else if debts are upcoming: uses the nearest upcoming due date (advance notice if <= 3 days).
 * 4. Strictly generates 1 single SMS (<= 160 characters, safely under 163 threshold) per customer per day.
 * 5. Schedules delivery at 8:00 AM local business time.
 */
export async function runDueRemindersCheck(): Promise<{ queuedCount: number; checkedCount: number }> {
  const admin = createAdminClient();

  // 1. Fetch active businesses and their settings
  const { data: businesses, error: bizErr } = await admin
    .from('businesses')
    .select('id, code, name, timezone')
    .eq('is_active', true);
  if (bizErr || !businesses) {
    console.error('Failed to fetch businesses in runDueRemindersCheck:', bizErr);
    return { queuedCount: 0, checkedCount: 0 };
  }

  const { data: settingsList } = await admin
    .from('business_settings')
    .select('business_id, sms_enabled, reminder_send_hour');
  const settingsMap = new Map<string, BusinessSettingsRow>();
  (settingsList || []).forEach((s) => settingsMap.set(s.business_id, s as BusinessSettingsRow));

  // 2. Fetch templates & active paybills
  const { data: tpls } = await admin
    .from('sms_templates')
    .select('business_id, key, body, is_active')
    .eq('is_active', true);
  const templatesByBizKey = new Map<string, string>();
  (tpls || []).forEach((t) => templatesByBizKey.set(`${t.business_id}:${t.key}`, t.body));

  const { data: channels } = await admin
    .from('payment_channels')
    .select('business_id, provider, shortcode, is_active')
    .eq('is_active', true);
  const paybillByBiz = new Map<string, string>();
  (channels || []).forEach((ch) => {
    if (ch.provider === 'mpesa_paybill' && !paybillByBiz.has(ch.business_id)) {
      paybillByBiz.set(ch.business_id, ch.shortcode);
    }
  });

  // 3. Fetch active obligations with outstanding balances
  const { data: obligations, error: oblErr } = await admin
    .from('obligations')
    .select('id, business_id, kind, balance_minor, original_minor, due_date, issue_date, reference_no, customer_id, payee_name, description, status')
    .in('status', ['open', 'partially_paid'])
    .gt('balance_minor', 0)
    .in('kind', ['customer_debt', 'loan'])
    .not('customer_id', 'is', null);

  if (oblErr || !obligations) {
    console.error('Failed to fetch obligations in runDueRemindersCheck:', oblErr);
    return { queuedCount: 0, checkedCount: 0 };
  }

  // 4. Group obligations by (business_id, customer_id) for merged SMS reminders
  const customerMap = new Map<string, CustomerDebtGroup>();
  for (const obl of obligations as ObligationRow[]) {
    if (!obl.customer_id) continue;
    const groupKey = `${obl.business_id}:${obl.customer_id}`;
    if (!customerMap.has(groupKey)) {
      customerMap.set(groupKey, {
        bizId: obl.business_id,
        customerId: obl.customer_id,
        debts: [],
      });
    }
    customerMap.get(groupKey)!.debts.push(obl);
  }

  let queuedCount = 0;
  let checkedCount = 0;

  for (const group of customerMap.values()) {
    checkedCount += group.debts.length;
    const biz = businesses.find((b) => b.id === group.bizId);
    if (!biz) continue;

    const bs = settingsMap.get(biz.id);
    if (!bs?.sms_enabled) continue;

    const tz = biz.timezone || 'Africa/Nairobi';
    const now = new Date();
    // Resolve current date in business local time (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = formatter.format(now);
    const todayDate = new Date(`${todayStr}T00:00:00Z`);

    // Fetch customer details
    const { data: cust } = await admin
      .from('customers')
      .select('id, full_name, customer_no, phone, sms_opt_out')
      .eq('id', group.customerId)
      .maybeSingle();

    if (!cust || !cust.phone || cust.sms_opt_out) continue;

    // Aggregate open debt balances
    let totalBalanceMinor = 0;
    let totalOriginalMinor = 0;
    for (const d of group.debts) {
      totalBalanceMinor += Number(d.balance_minor || 0);
      totalOriginalMinor += Number(d.original_minor || 0);
    }
    if (totalBalanceMinor <= 0) continue;

    // Partition debts into overdue vs upcoming
    const overdueDebts: Array<{ debt: ObligationRow; anchorStr: string; diffDays: number }> = [];
    const upcomingDebts: Array<{ debt: ObligationRow; anchorStr: string; diffDays: number }> = [];

    for (const d of group.debts) {
      const anchorStr = d.due_date || d.issue_date;
      if (!anchorStr) continue;
      const anchorDate = new Date(`${anchorStr}T00:00:00Z`);
      const diffDays = Math.round((todayDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        overdueDebts.push({ debt: d, anchorStr, diffDays });
      } else {
        upcomingDebts.push({ debt: d, anchorStr, diffDays });
      }
    }

    let mode: 'overdue' | 'due_soon' | null = null;
    let primaryDebt: ObligationRow;
    let commonDueDateStr: string;
    let daysValue: number;

    // Priority 1: Customer has overdue debts -> Merged overdue reminder
    if (overdueDebts.length > 0) {
      // Sort ascending by anchorStr (earliest due date first = oldest overdue debt in FIFO)
      overdueDebts.sort((a, b) => a.anchorStr.localeCompare(b.anchorStr));
      const oldest = overdueDebts[0];
      primaryDebt = oldest.debt;
      commonDueDateStr = oldest.anchorStr;
      daysValue = oldest.diffDays;
      mode = 'overdue';
    }
    // Priority 2: Customer has upcoming debts -> Merged advance due soon reminder (<= 3 days)
    else if (upcomingDebts.length > 0) {
      // Sort ascending by anchorStr (nearest upcoming due date first)
      upcomingDebts.sort((a, b) => a.anchorStr.localeCompare(b.anchorStr));
      const nearest = upcomingDebts[0];
      const daysRemaining = -nearest.diffDays;
      if (daysRemaining <= 3) {
        primaryDebt = nearest.debt;
        commonDueDateStr = nearest.anchorStr;
        daysValue = daysRemaining;
        mode = 'due_soon';
      } else {
        // Not yet within 3 days notice window
        continue;
      }
    } else {
      continue;
    }

    // Deduplication key guarantees exactly 1 SMS per customer per day
    const dedupeKey = `reminder:merged:${biz.id}:${cust.id}:${todayStr}:${mode}`;

    const { data: existingSms } = await admin
      .from('sms_outbox')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existingSms) {
      continue; // Already queued or sent today
    }

    // Ensure reminder schedule exists for primary obligation
    let scheduleId: string | null = null;
    const { data: existingSched } = await admin
      .from('reminder_schedules')
      .select('id, status')
      .eq('obligation_id', primaryDebt.id)
      .maybeSingle();

    if (existingSched) {
      if (existingSched.status !== 'active') continue;
      scheduleId = existingSched.id;
    } else {
      const { data: newSched, error: schedErr } = await admin
        .from('reminder_schedules')
        .insert({
          business_id: biz.id,
          obligation_id: primaryDebt.id,
          recipient: 'customer',
          anchor: 'due_date',
          offsets_days: [1, 2, 3, 7, 14, 30],
          template_key: 'customer_reminder',
          status: 'active',
        })
        .select('id')
        .single();
      if (schedErr || !newSched) continue;
      scheduleId = newSched.id;
    }

    // Record reminder run
    const offsetDays = mode === 'overdue' ? daysValue : -daysValue;
    const { data: run } = await admin
      .from('reminder_runs')
      .insert({
        business_id: biz.id,
        schedule_id: scheduleId,
        obligation_id: primaryDebt.id,
        anchor_date: commonDueDateStr,
        offset_days: offsetDays,
        status: 'queued',
        note: `Merged: ${group.debts.length} debt(s)`,
      })
      .select('id')
      .maybeSingle();

    // Render SMS text with concise single-SMS templates
    const formattedDue = formatDueDate(commonDueDateStr, todayStr);
    const firstName = (cust.full_name || 'Customer').trim().split(/\s+/)[0].slice(0, 12);
    const paybill = paybillByBiz.get(biz.id) || '';

    let tplBody = '';
    if (mode === 'overdue') {
      tplBody =
        templatesByBizKey.get(`${biz.id}:customer_reminder_overdue`) ||
        templatesByBizKey.get(`${biz.id}:customer_reminder`) ||
        (biz.code === 'ZENITH_PLAST'
          ? 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}} days overdue. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496'
          : 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}} days overdue. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796');
    } else {
      tplBody =
        templatesByBizKey.get(`${biz.id}:customer_reminder_due_soon`) ||
        templatesByBizKey.get(`${biz.id}:customer_reminder`) ||
        (biz.code === 'ZENITH_PLAST'
          ? 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496'
          : 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796');
    }

    let smsText = renderTemplate(tplBody, {
      first_name: firstName,
      customer_name: cust.full_name,
      business_name: biz.name,
      balance: fmt_kes(totalBalanceMinor, { showCents: false }),
      original: fmt_kes(totalOriginalMinor, { showCents: false }),
      reference: group.debts.length > 1 ? `${group.debts.length} debts` : (primaryDebt.reference_no || ''),
      due_date: formattedDue,
      days_overdue: String(daysValue),
      days_remaining: String(daysValue),
      paybill,
      account: cust.customer_no,
    });

    // Hard character guarantee: <= 160 characters (strictly avoiding 2 SMS carrier charges)
    if (smsText.length > 160) {
      smsText = smsText.slice(0, 160);
    }

    // Schedule for 8:00 AM local business time
    const scheduledTime = computeScheduledAt(now, tz, bs.reminder_send_hour ?? 8);

    const { data: smsRow, error: smsErr } = await admin
      .from('sms_outbox')
      .insert({
        business_id: biz.id,
        customer_id: cust.id,
        kind: 'reminder',
        to_phone: cust.phone,
        body: smsText,
        related_obligation_id: primaryDebt.id,
        dedupe_key: dedupeKey,
        scheduled_at: scheduledTime,
        status: 'queued',
      })
      .select('id')
      .single();

    if (!smsErr && smsRow) {
      if (run?.id) {
        await admin.from('reminder_runs').update({ sms_id: smsRow.id }).eq('id', run.id);
      }
      queuedCount++;
    }
  }

  return { queuedCount, checkedCount };
}
