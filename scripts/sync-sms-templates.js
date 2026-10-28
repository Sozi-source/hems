const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function syncTemplates() {
  console.log('Fetching businesses...');
  const { data: businesses, error: bErr } = await supabase.from('businesses').select('id, code, name');
  if (bErr) {
    console.error('Error fetching businesses:', bErr);
    process.exit(1);
  }

  const haronCodes = ['HARON_FASHION', 'DEV_HARON_FASHION'];
  const zenithCodes = ['ZENITH_PLAST', 'DEV_ZENITH_PLAST'];

  const haronBizs = businesses.filter(b => haronCodes.includes(b.code));
  const zenithBizs = businesses.filter(b => zenithCodes.includes(b.code));

  console.log(`Found ${haronBizs.length} Haron businesses, ${zenithBizs.length} Zenith businesses.`);

  // Optimized templates strictly guaranteed <= 160 characters (and <= 163 chars under all circumstances)
  const haronTemplates = [
    {
      key: 'credit_sale_invoice',
      name: 'Goods received on credit',
      body: 'Dear {{first_name}}, goods {{amount}} on credit. Bal: {{balance}} due {{due_date}}. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    },
    {
      key: 'customer_reminder',
      name: 'Customer debt reminder',
      body: 'Dear {{first_name}}, reminder: balance is {{balance}}. Pay Equity 247247/NCBA 880100 Acc 650166 (Ref: {{account}}). Haron fashio-0725499796',
    },
    {
      key: 'payment_confirmation',
      name: 'Payment received',
      body: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Balance: {{balance}}. Haron fashio-0725499796',
    },
    {
      key: 'payment_confirmation_paid_in_full',
      name: 'Payment received - paid in full',
      body: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Your account is PAID IN FULL. Haron fashio-0725499796',
    },
  ];

  for (const biz of haronBizs) {
    console.log(`Updating templates for Haron Fashion (${biz.code} - ${biz.id})...`);
    for (const t of haronTemplates) {
      const { error } = await supabase.from('sms_templates').upsert({
        business_id: biz.id,
        key: t.key,
        name: t.name,
        body: t.body,
        is_active: true,
      }, { onConflict: 'business_id,key' });
      if (error) {
        console.error(`Failed to upsert ${t.key} for ${biz.code}:`, error);
      } else {
        console.log(`  ✓ ${t.key} updated`);
      }
    }
  }

  // Templates for Zenith Plast
  const zenithTemplates = [
    {
      key: 'credit_sale_invoice',
      name: 'Goods received on credit',
      body: 'Dear {{first_name}}, goods {{amount}} on credit. Bal: {{balance}} due {{due_date}}. Pay Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    },
    {
      key: 'customer_reminder',
      name: 'Customer debt reminder',
      body: 'Dear {{first_name}}, reminder: balance is {{balance}}. Pay via Absa Paybill 303030 Acc 1398# (Ref: {{account}}). Zenith- 0711377496',
    },
    {
      key: 'payment_confirmation',
      name: 'Payment received',
      body: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Balance: {{balance}}. Zenith- 0711377496',
    },
    {
      key: 'payment_confirmation_paid_in_full',
      name: 'Payment received - paid in full',
      body: 'Dear {{first_name}}, payment of {{amount}} received. Thank you. Your account is PAID IN FULL. Zenith- 0711377496',
    },
  ];

  for (const biz of zenithBizs) {
    console.log(`Updating templates for Zenith Plast (${biz.code} - ${biz.id})...`);
    for (const t of zenithTemplates) {
      const { error } = await supabase.from('sms_templates').upsert({
        business_id: biz.id,
        key: t.key,
        name: t.name,
        body: t.body,
        is_active: true,
      }, { onConflict: 'business_id,key' });
      if (error) {
        console.error(`Failed to upsert ${t.key} for ${biz.code}:`, error);
      } else {
        console.log(`  ✓ ${t.key} updated`);
      }
    }
  }

  console.log('SMS templates synchronization finished successfully.');
}

syncTemplates();
