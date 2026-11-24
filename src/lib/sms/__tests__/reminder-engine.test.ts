import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCustomerReminderSms,
  evaluateCustomerDebtReminder,
  normalizeDueTodayTemplate,
} from '../reminder-schedule.ts';

test('evaluateCustomerDebtReminder: due today returns due_soon with daysValue 0 and offsetDays 0', () => {
  const decision = evaluateCustomerDebtReminder(
    [{ due_date: '2026-11-24', issue_date: '2026-11-10', reference_no: 'INV-1' }],
    '2026-11-24'
  );

  assert.ok(decision);
  assert.equal(decision.mode, 'due_soon');
  assert.equal(decision.daysValue, 0);
  assert.equal(decision.offsetDays, 0);
  assert.equal(decision.commonDueDateStr, '2026-11-24');
});

test('evaluateCustomerDebtReminder: overdue debt takes priority over debt due today', () => {
  const decision = evaluateCustomerDebtReminder(
    [
      { due_date: '2026-11-24', issue_date: '2026-11-10', reference_no: 'INV-2' },
      { due_date: '2026-11-20', issue_date: '2026-11-05', reference_no: 'INV-1' },
    ],
    '2026-11-24'
  );

  assert.ok(decision);
  assert.equal(decision.mode, 'overdue');
  assert.equal(decision.daysValue, 4);
  assert.equal(decision.commonDueDateStr, '2026-11-20');
});

test('buildCustomerReminderSms: reads today (never 0d or 0 days) when due date is today with DB templates or fallbacks', () => {
  const dbDueSoonTemplate =
    'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796';

  const { text: withDbTpl } = buildCustomerReminderSms({
    businessCode: 'HARON_FASHION',
    businessName: 'Haron Fashion',
    customerFullName: 'John Kamau',
    customerNo: 'C0001',
    totalBalanceMinor: 1200000,
    totalOriginalMinor: 1500000,
    debtCount: 1,
    primaryReferenceNo: 'INV-1',
    commonDueDateStr: '2026-11-24',
    todayStr: '2026-11-24',
    mode: 'due_soon',
    daysValue: 0,
    templates: { dueSoon: dbDueSoonTemplate },
  });

  assert.match(withDbTpl, /due today \(24 Nov\)/);
  assert.doesNotMatch(withDbTpl, /\b0d\b|\b0 day/i);
  assert.ok(withDbTpl.length <= 160);

  const { text: withFallback } = buildCustomerReminderSms({
    businessCode: 'ZENITH_PLAST',
    businessName: 'Zenith Plast',
    customerFullName: 'Mary Wanjiru',
    customerNo: 'C0002',
    totalBalanceMinor: 500000,
    totalOriginalMinor: 500000,
    debtCount: 1,
    commonDueDateStr: '2026-11-24',
    todayStr: '2026-11-24',
    mode: 'due_soon',
    daysValue: 0,
  });

  assert.match(withFallback, /due today \(24 Nov\)/);
  assert.doesNotMatch(withFallback, /\b0d\b|\b0 day/i);
  assert.ok(withFallback.length <= 160);
});

test('buildCustomerReminderSms: still counts positive days remaining when due in 1..3 days', () => {
  const dbDueSoonTemplate =
    'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496';

  const { text } = buildCustomerReminderSms({
    businessCode: 'ZENITH_PLAST',
    businessName: 'Zenith Plast',
    customerFullName: 'Mary Wanjiru',
    customerNo: 'C0002',
    totalBalanceMinor: 500000,
    totalOriginalMinor: 500000,
    debtCount: 1,
    commonDueDateStr: '2026-11-26',
    todayStr: '2026-11-24',
    mode: 'due_soon',
    daysValue: 2,
    templates: { dueSoon: dbDueSoonTemplate },
  });

  assert.match(text, /due in 2d \(26 Nov\)/);
});

test('normalizeDueTodayTemplate: handles days, day(s), d, and bare placeholder variations', () => {
  assert.equal(
    normalizeDueTodayTemplate('bal {{balance}} due in {{days_remaining}} days ({{due_date}}).'),
    'bal {{balance}} due today ({{due_date}}).'
  );
  assert.equal(
    normalizeDueTodayTemplate('bal {{balance}} is due in {{days_remaining}} day(s).'),
    'bal {{balance}} is due today.'
  );
  assert.equal(
    normalizeDueTodayTemplate('bal {{balance}} expires in {{days_remaining}} days.'),
    'bal {{balance}} expires today.'
  );
  assert.equal(
    normalizeDueTodayTemplate('bal {{balance}} ({{days_remaining}} days left).'),
    'bal {{balance}} (due today).'
  );
});
