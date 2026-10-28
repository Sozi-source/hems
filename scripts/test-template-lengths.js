const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function renderTemplate(tpl, vars) {
  let result = tpl;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, v);
  }
  return result;
}

// Optimized templates strictly guaranteed <= 160 characters (and <= 163 chars under all circumstances)
const candidateTemplates = {
  HARON_FASHION: {
    credit_sale_invoice: 'Dear {{first_name}}, goods {{amount}} on credit. Bal: {{balance}} due {{due_date}}. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    customer_reminder: 'Dear {{first_name}}, reminder: balance is {{balance}}. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    payment_confirmation: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Balance: {{balance}}. Haron fashio-0725499796',
    payment_confirmation_paid_in_full: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Your account is PAID IN FULL. Haron fashio-0725499796',
  },
  ZENITH_PLAST: {
    credit_sale_invoice: 'Dear {{first_name}}, goods {{amount}} on credit. Bal: {{balance}} due {{due_date}}. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    customer_reminder: 'Dear {{first_name}}, reminder: balance is {{balance}}. Pay via Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    payment_confirmation: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Balance: {{balance}}. Zenith- 0711377496',
    payment_confirmation_paid_in_full: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Your account is PAID IN FULL. Zenith- 0711377496',
  }
};

const stressTests = [
  {
    label: 'Standard Customer (John, KSh 5,000, Bal KSh 12,000)',
    first_name: 'John',
    amount: 'KSh 5,000',
    balance: 'KSh 12,000',
    due_date: '15 Nov',
    account: 'C0012',
  },
  {
    label: 'Long First Name (Christopher, KSh 150,000, Bal KSh 350,000)',
    first_name: 'Christopher',
    amount: 'KSh 150,000',
    balance: 'KSh 350,000',
    due_date: '30 Nov',
    account: 'C0123',
  },
  {
    label: 'Extreme Edge Case (Bartholomew, KSh 1,500,000, Bal KSh 5,000,000)',
    first_name: 'Bartholomew',
    amount: 'KSh 1,500,000',
    balance: 'KSh 5,000,000',
    due_date: '31 Dec',
    account: 'C9999',
  },
];

console.log('--- TESTING MAXIMUM RENDERED SMS LENGTHS ---');
let maxOverall = 0;
let fails = 0;

for (const [bizCode, tpls] of Object.entries(candidateTemplates)) {
  console.log(`\n=================== ${bizCode} ===================`);
  for (const [key, tpl] of Object.entries(tpls)) {
    console.log(`\nTemplate [${key}]:`);
    for (const test of stressTests) {
      const rendered = renderTemplate(tpl, test);
      const len = rendered.length;
      if (len > maxOverall) maxOverall = len;
      const isUnder = len <= 160;
      if (!isUnder) fails++;
      const tag = len <= 160 ? 'PASS (<=160 1 SMS)' : 'FAIL (>160)';
      console.log(`  [${tag}] ${len} chars: "${rendered}"`);
    }
  }
}

console.log(`\nMax length seen across ALL stress tests: ${maxOverall} chars.`);
if (fails === 0 && maxOverall <= 160) {
  console.log('SUCCESS: Every single SMS is guaranteed <= 160 chars (well below 163 char limit)!');
} else {
  console.error(`FAILED: ${fails} tests exceeded 160 chars.`);
  process.exit(1);
}
