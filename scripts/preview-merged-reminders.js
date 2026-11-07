const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if ((!SUPABASE_URL || !SUPABASE_KEY) && fs.existsSync('.env.local')) {
  const env = fs.readFileSync('.env.local', 'utf8');
  SUPABASE_URL = SUPABASE_URL || env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
  SUPABASE_KEY = SUPABASE_KEY || env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fmt_kes(minorUnits, options = {}) {
  if (minorUnits === null || minorUnits === undefined) return 'KSh 0';
  const prefix = options.prefix ?? 'KSh ';
  const showCents = options.showCents ?? false;
  const isNegative = minorUnits < 0;
  const absUnits = Math.abs(minorUnits);
  const majorPart = Math.floor(absUnits / 100);
  const minorPart = Math.round(absUnits % 100);
  const majorFormatted = majorPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const minorFormatted = minorPart.toString().padStart(2, '0');
  const sign = isNegative ? '-' : '';
  if (!showCents && minorPart === 0) {
    return `${sign}${prefix}${majorFormatted}`;
  }
  return `${sign}${prefix}${majorFormatted}.${minorFormatted}`;
}

function formatDueDate(dueDateStr, todayStr) {
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

function renderTemplate(tpl, vars) {
  let result = tpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v ?? '');
  }
  return result;
}

async function run() {
  const { data: businesses } = await supabase.from('businesses').select('id, code, name, timezone').eq('is_active', true);
  const { data: settingsList } = await supabase.from('business_settings').select('business_id, sms_enabled, reminder_send_hour');
  const settingsMap = new Map();
  (settingsList || []).forEach(s => settingsMap.set(s.business_id, s));

  const { data: tpls } = await supabase.from('sms_templates').select('business_id, key, body, is_active').eq('is_active', true);
  const templatesMap = new Map();
  (tpls || []).forEach(t => templatesMap.set(`${t.business_id}:${t.key}`, t.body));

  const { data: channels } = await supabase.from('payment_channels').select('business_id, provider, shortcode, is_active').eq('is_active', true);
  const paybillByBiz = new Map();
  (channels || []).forEach(ch => {
    if (ch.provider === 'mpesa_paybill' && !paybillByBiz.has(ch.business_id)) {
      paybillByBiz.set(ch.business_id, ch.shortcode);
    }
  });

  const { data: obligations, error } = await supabase
    .from('obligations')
    .select('id, business_id, kind, balance_minor, original_minor, due_date, issue_date, reference_no, customer_id, payee_name, description, status')
    .in('status', ['open', 'partially_paid'])
    .gt('balance_minor', 0)
    .in('kind', ['customer_debt', 'loan'])
    .not('customer_id', 'is', null);

  if (error) {
    console.error('Error fetching obligations:', error);
    return;
  }

  // Group by (business_id, customer_id)
  const customerMap = new Map();
  for (const obl of obligations) {
    const key = `${obl.business_id}:${obl.customer_id}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        bizId: obl.business_id,
        customerId: obl.customer_id,
        debts: []
      });
    }
    customerMap.get(key).debts.push(obl);
  }

  console.log(`Total active debt obligations: ${obligations.length}`);
  console.log(`Total unique customers with active debt: ${customerMap.size}`);

  let multiDebtCount = 0;
  let singleDebtCount = 0;
  let maxSmsLength = 0;

  for (const group of customerMap.values()) {
    const biz = businesses.find(b => b.id === group.bizId);
    if (!biz) continue;
    const bs = settingsMap.get(biz.id);
    if (!bs?.sms_enabled) continue;

    const tz = biz.timezone || 'Africa/Nairobi';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayStr = formatter.format(now);
    const todayDate = new Date(`${todayStr}T00:00:00Z`);

    const { data: cust } = await supabase
      .from('customers')
      .select('id, full_name, customer_no, phone, sms_opt_out')
      .eq('id', group.customerId)
      .maybeSingle();

    if (!cust || !cust.phone || cust.sms_opt_out) continue;

    let totalBalanceMinor = 0;
    let totalOriginalMinor = 0;
    for (const d of group.debts) {
      totalBalanceMinor += Number(d.balance_minor || 0);
      totalOriginalMinor += Number(d.original_minor || 0);
    }
    if (totalBalanceMinor <= 0) continue;

    const overdueDebts = [];
    const upcomingDebts = [];

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

    let mode = null;
    let primaryDebt = null;
    let commonDueDateStr = null;
    let daysValue = 0;

    if (overdueDebts.length > 0) {
      // Sort ascending by anchorStr (earliest due date first = oldest overdue debt)
      overdueDebts.sort((a, b) => a.anchorStr.localeCompare(b.anchorStr));
      const oldest = overdueDebts[0];
      primaryDebt = oldest.debt;
      commonDueDateStr = oldest.anchorStr;
      daysValue = oldest.diffDays;
      mode = 'overdue';
    } else if (upcomingDebts.length > 0) {
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
        continue;
      }
    } else {
      continue;
    }

    if (group.debts.length > 1) multiDebtCount++;
    else singleDebtCount++;

    const formattedDue = formatDueDate(commonDueDateStr, todayStr);
    const firstName = (cust.full_name || 'Customer').trim().split(/\s+/)[0].slice(0, 12);
    const paybill = paybillByBiz.get(biz.id) || '';

    let tplBody = '';
    if (mode === 'overdue') {
      tplBody =
        templatesMap.get(`${biz.id}:customer_reminder_overdue`) ||
        templatesMap.get(`${biz.id}:customer_reminder`) ||
        'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}} days overdue.';
    } else {
      tplBody =
        templatesMap.get(`${biz.id}:customer_reminder_due_soon`) ||
        templatesMap.get(`${biz.id}:customer_reminder`) ||
        'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}).';
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

    if (smsText.length > maxSmsLength) maxSmsLength = smsText.length;

    const dedupeKey = `reminder:merged:${biz.id}:${cust.id}:${todayStr}:${mode}`;

    if (group.debts.length > 1) {
      console.log(`\n[MULTI-DEBT CUSTOMER: ${group.debts.length} DEBTS] ${cust.full_name} (${cust.phone})`);
      console.log(`  Mode: ${mode.toUpperCase()} | Common Due Date: ${commonDueDateStr} (${formattedDue}) | Days: ${daysValue}`);
      console.log(`  Total Bal: ${fmt_kes(totalBalanceMinor, { showCents: false })} | Debts: ${group.debts.map(d => `${d.reference_no}:${fmt_kes(d.balance_minor, { showCents: false })}`).join(', ')}`);
      console.log(`  SMS [${smsText.length} chars]: "${smsText}"`);
      console.log(`  Dedupe Key: ${dedupeKey}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Single-debt customers needing reminder: ${singleDebtCount}`);
  console.log(`  Multi-debt customers merged: ${multiDebtCount}`);
  console.log(`  Max SMS length across ALL generated messages: ${maxSmsLength} chars (must be <= 160 chars)`);
  if (maxSmsLength <= 160) {
    console.log(`PASS: All generated merged SMS fit strictly within 1 single SMS (<= 160 chars)!`);
  } else {
    console.log(`FAIL: At least one SMS exceeded 160 chars!`);
  }
}

run().catch(console.error);
