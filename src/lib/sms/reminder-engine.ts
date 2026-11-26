import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCustomerReminderSms,
  evaluateCustomerDebtReminder,
} from './reminder-schedule';

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
 *    - Else if debts are upcoming: uses the nearest upcoming due date (advance notice if <= 1 day: tomorrow or today).
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

    const decision = evaluateCustomerDebtReminder(group.debts, todayStr);
    if (!decision) {
      continue;
    }

    const { mode, primaryDebt, commonDueDateStr, daysValue, offsetDays } = decision;

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
    const paybill = paybillByBiz.get(biz.id) || '';
    const { text: smsText } = buildCustomerReminderSms({
      businessCode: biz.code,
      businessName: biz.name,
      customerFullName: cust.full_name,
      customerNo: cust.customer_no,
      totalBalanceMinor,
      totalOriginalMinor,
      debtCount: group.debts.length,
      primaryReferenceNo: primaryDebt.reference_no,
      commonDueDateStr,
      todayStr,
      mode,
      daysValue,
      paybill,
      templates: {
        overdue: templatesByBizKey.get(`${biz.id}:customer_reminder_overdue`),
        dueToday: templatesByBizKey.get(`${biz.id}:customer_reminder_due_today`),
        dueTomorrow: templatesByBizKey.get(`${biz.id}:customer_reminder_due_tomorrow`),
        dueSoon: templatesByBizKey.get(`${biz.id}:customer_reminder_due_soon`),
        fallback: templatesByBizKey.get(`${biz.id}:customer_reminder`),
      },
    });

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
