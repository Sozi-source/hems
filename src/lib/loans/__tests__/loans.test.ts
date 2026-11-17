import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMonthlyInstalmentMinor,
  computeDueDateForOffset,
  generateAmortizationSchedule,
} from '../amortization.ts';
import { allocateLoanPayment } from '../payment-allocation.ts';
import {
  buildLoanReminderMessage,
  evaluateLoanReminderSchedule,
} from '../reminder-schedule.ts';

test('Amortization: reducing balance clears principal exactly to 0 on final instalment', () => {
  const schedule = generateAmortizationSchedule({
    principalMinor: 12000000, // KSh 120,000
    annualRatePct: 12,
    termMonths: 12,
    dateTaken: '2026-01-20',
    repaymentDay: 20,
    method: 'reducing_balance',
  });

  assert.equal(schedule.rows.length, 12);
  assert.equal(schedule.rows[0].opening_balance_minor, 12000000);
  // First month interest: 120,000 * 1% = 1,200 (120,000 minor)
  assert.equal(schedule.rows[0].interest_minor, 120000);
  const last = schedule.rows[schedule.rows.length - 1];
  assert.equal(last.closing_balance_minor, 0);

  const sumPrincipal = schedule.rows.reduce((s, r) => s + r.principal_minor, 0);
  assert.equal(sumPrincipal, 12000000);
});

test('Amortization: handles month-end edge cases (day 31 in Feb and Apr)', () => {
  assert.equal(computeDueDateForOffset('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(computeDueDateForOffset('2024-01-31', 1, 31), '2024-02-29'); // leap year
  assert.equal(computeDueDateForOffset('2026-03-31', 1, 31), '2026-04-30');
});

test('Amortization: manual monthly instalment override is respected', () => {
  const auto = calculateMonthlyInstalmentMinor(10000000, 14, 12, 'reducing_balance');
  const schedule = generateAmortizationSchedule({
    principalMinor: 10000000,
    annualRatePct: 14,
    termMonths: 12,
    dateTaken: '2026-01-10',
    repaymentDay: 10,
    overrideInstalmentMinor: auto + 50000,
  });
  assert.equal(schedule.monthly_instalment_minor, auto + 50000);
  assert.equal(schedule.rows[schedule.rows.length - 1].closing_balance_minor, 0);
});

test('Reminder scheduling: 3, 2, 1, 0 days, overdue from 21st onward, stops when verified', () => {
  const due = '2026-11-20';

  assert.equal(evaluateLoanReminderSchedule(due, '2026-11-16', false), null);
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-17', false), {
    daysOffset: 3,
    label: '3 days remaining',
  });
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-18', false), {
    daysOffset: 2,
    label: '2 days remaining',
  });
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-19', false), {
    daysOffset: 1,
    label: '1 day remaining',
  });
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-20', false), {
    daysOffset: 0,
    label: 'Payment due today',
  });
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-21', false), {
    daysOffset: -1,
    label: 'Overdue by 1 day',
  });
  assert.deepEqual(evaluateLoanReminderSchedule(due, '2026-11-25', false), {
    daysOffset: -5,
    label: 'Overdue by 5 days',
  });

  // Stops automatically once recorded AND verified
  assert.equal(evaluateLoanReminderSchedule(due, '2026-11-20', true), null);
  assert.equal(evaluateLoanReminderSchedule(due, '2026-11-25', true), null);
});

test('Reminder message: includes lender, business, amount, due date, days, and payment details', () => {
  const msg = buildLoanReminderMessage({
    lenderName: 'Equity Bank',
    businessName: 'Haron Fashion',
    amountDueMinor: 2500000,
    dueDateIso: '2026-11-20',
    decision: { daysOffset: 3, label: '3 days remaining' },
    paymentDetails: { paybill: '247247', account_number: '123456' },
  });

  assert.match(msg, /Equity Bank/);
  assert.match(msg, /Haron Fashion/);
  assert.match(msg, /25,000/);
  assert.match(msg, /3 days remaining/);
  assert.match(msg, /Paybill 247247/);
  assert.match(msg, /Acc 123456/);
});

test('Payment allocation: splits interest first then principal, handles underpayment & overpayment', () => {
  const instalments = [
    {
      id: 'i1',
      instalment_no: 1,
      interest_minor: 100000,
      principal_minor: 900000,
      paid_interest_minor: 0,
      paid_principal_minor: 0,
    },
    {
      id: 'i2',
      instalment_no: 2,
      interest_minor: 90000,
      principal_minor: 910000,
      paid_interest_minor: 0,
      paid_principal_minor: 0,
    },
  ];

  // Underpayment of 500,000 minor -> 100,000 interest + 400,000 principal (partial)
  const under = allocateLoanPayment(instalments, 500000);
  assert.equal(under.total_interest_minor, 100000);
  assert.equal(under.total_principal_minor, 400000);
  assert.equal(under.allocations[0].resulting_status, 'partial');

  // Overpayment of 2,500,000 minor -> covers both instalments (2,000,000) + 500,000 extra to principal
  const over = allocateLoanPayment(instalments, 2500000);
  assert.equal(over.total_interest_minor, 190000);
  assert.equal(over.total_principal_minor, 2310000);
  assert.equal(over.overpayment_to_principal_minor, 500000);
});
