const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function syncOverdueTemplates() {
  console.log('Fetching businesses from Supabase...');
  const { data: businesses, error: bErr } = await supabase.from('businesses').select('id, code, name');
  if (bErr) {
    console.error('Error fetching businesses:', bErr);
    process.exit(1);
  }

  const haronBizs = businesses.filter(b => b.code === 'HARON_FASHION' || b.code === 'DEV_HARON_FASHION');
  const zenithBizs = businesses.filter(b => b.code === 'ZENITH_PLAST' || b.code === 'DEV_ZENITH_PLAST');

  const haronTemplates = [
    {
      key: 'customer_reminder_overdue',
      name: 'Customer overdue debt reminder (daily)',
      body: 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}}d overdue. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    },
    {
      key: 'customer_reminder_due_soon',
      name: 'Customer debt due soon reminder',
      body: 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    },
  ];

  const zenithTemplates = [
    {
      key: 'customer_reminder_overdue',
      name: 'Customer overdue debt reminder (daily)',
      body: 'Dear {{first_name}}, reminder: bal {{balance}} is {{days_overdue}}d overdue. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    },
    {
      key: 'customer_reminder_due_soon',
      name: 'Customer debt due soon reminder',
      body: 'Dear {{first_name}}, reminder: bal {{balance}} due in {{days_remaining}}d ({{due_date}}). Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    },
  ];

  for (const biz of haronBizs) {
    for (const t of haronTemplates) {
      await supabase.from('sms_templates').upsert({
        business_id: biz.id,
        key: t.key,
        name: t.name,
        body: t.body,
        is_active: true,
      }, { onConflict: 'business_id,key' });
    }
  }

  for (const biz of zenithBizs) {
    for (const t of zenithTemplates) {
      await supabase.from('sms_templates').upsert({
        business_id: biz.id,
        key: t.key,
        name: t.name,
        body: t.body,
        is_active: true,
      }, { onConflict: 'business_id,key' });
    }
  }

  console.log('Reminder templates updated with concise notation.');
}

syncOverdueTemplates();
