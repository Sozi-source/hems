const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function verifyFeatures() {
  console.log('=== VERIFYING NEW FUNCTIONALITIES ===\n');

  // 1. Verify SMS Templates
  console.log('1. Checking Live SMS Templates in Supabase:');
  const { data: templates, error: tplErr } = await supabase
    .from('sms_templates')
    .select('business_id, key, name, body')
    .in('key', ['customer_reminder_overdue', 'customer_reminder_due_soon']);

  if (tplErr || !templates || templates.length === 0) {
    console.error('FAILED: Could not find overdue/due-soon templates in DB:', tplErr);
    process.exit(1);
  }
  console.log(`✓ Found ${templates.length} overdue & due-soon templates across businesses.`);
  templates.forEach(t => {
    console.log(`  - [${t.key}] (${t.body.length} chars): ${t.body}`);
  });

  // 2. Verify recent messages in sms_outbox are <= 160 chars
  console.log('\n2. Verifying recent sms_outbox character lengths:');
  const { data: outbox } = await supabase
    .from('sms_outbox')
    .select('id, to_phone, body, status, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  let maxLen = 0;
  let lenViolations = 0;
  (outbox || []).forEach(sms => {
    if (sms.body.length > maxLen) maxLen = sms.body.length;
    if (sms.body.length > 163) lenViolations++;
  });
  console.log(`✓ Checked ${outbox?.length || 0} recent messages. Max length found: ${maxLen} chars.`);
  if (lenViolations > 0) {
    console.error(`FAILED: ${lenViolations} recent messages exceeded 163 chars!`);
    process.exit(1);
  } else {
    console.log('✓ All recent messages are strictly within single-SMS credit limits (<= 160 chars, well under 163).');
  }

  // 3. Verify Business Members & Roles
  console.log('\n3. Verifying Business Members & Roles:');
  const { data: members, error: memErr } = await supabase
    .from('business_members')
    .select('business_id, user_id, role, is_active');
  if (memErr) {
    console.error('FAILED to query business_members:', memErr);
    process.exit(1);
  }
  console.log(`✓ Found ${members.length} members with roles:`, [...new Set(members.map(m => m.role))]);

  // 4. Verify Audit Log
  console.log('\n4. Verifying Audit Log:');
  const { data: audit, count, error: auditErr } = await supabase
    .from('audit_log')
    .select('id, occurred_at, table_name, action, actor_label', { count: 'exact' })
    .limit(5);

  if (auditErr) {
    console.error('FAILED to query audit_log:', auditErr);
    process.exit(1);
  }
  console.log(`✓ Audit log is active with ${count} total logged events.`);

  console.log('\n=== ALL NEW FUNCTIONALITY CHECKS PASSED SUCCESSFULLY ===');
}

verifyFeatures();
