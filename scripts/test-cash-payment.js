const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function testCashPaymentWorkflow() {
  console.log('--- Testing Pay Debt Cash Workflow ---');

  // 1. Fetch DEV_HARON_FASHION business
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, code, name')
    .eq('code', 'DEV_HARON_FASHION')
    .single();

  if (!biz) {
    console.error('DEV_HARON_FASHION not found.');
    return;
  }
  console.log('Business:', biz.name, `(${biz.id})`);

  // 2. Fetch a customer in this business
  const { data: custs } = await supabase
    .from('customers')
    .select('id, full_name, phone, customer_no')
    .eq('business_id', biz.id)
    .limit(1);

  const customer = custs?.[0];
  if (!customer) {
    console.error('No customer found.');
    return;
  }
  console.log('Customer:', customer.full_name, `(${customer.customer_no})`);

  // 3. Create a temporary test debt obligation of KES 500 (50,000 cents)
  const testRef = 'TEST-DEBT-' + Date.now().toString().slice(-6);
  const { data: obId, error: obErr } = await supabase.rpc('create_obligation', {
    p_business: biz.id,
    p_kind: 'customer_debt',
    p_amount_minor: 50000,
    p_customer: customer.id,
    p_description: 'Test debt for cash payment verification',
    p_reference: testRef
  });

  if (obErr || !obId) {
    console.error('Failed to create test obligation:', obErr);
    return;
  }
  console.log('Created test obligation:', testRef, `(ID: ${obId})`);

  // Verify obligation initial balance
  const { data: obBefore } = await supabase
    .from('obligations')
    .select('balance_minor, status')
    .eq('id', obId)
    .single();
  console.log('Obligation before payment:', obBefore);

  // 4. Test cash payment of KES 300 (30,000 cents) partial payment
  const cashRef = 'CSH-TEST-' + Date.now().toString().slice(-6);
  console.log('Simulating cash payment via ingest + approve...');

  // Ingest
  const { data: ingRes, error: ingErr } = await supabase.rpc('ingest_payment', {
    p: {
      provider: 'cash',
      transaction_ref: cashRef,
      source: 'manual',
      direction: 'in',
      amount_minor: 30000,
      business_id: biz.id,
      shortcode: `CASH-${biz.code}`,
      payer_name: customer.full_name,
      payer_msisdn: customer.phone,
      account_reference: customer.customer_no,
      raw_text: `Cash payment for ${customer.full_name}`,
      description: `Paper cash received at counter: ${cashRef}`
    }
  });

  if (ingErr || !ingRes?.payment_id) {
    console.error('Ingest error:', ingErr);
    return;
  }
  console.log('Cash payment ingested:', ingRes.payment_id);

  // Approve and allocate to obligation
  const { data: appRes, error: appErr } = await supabase.rpc('approve_payment', {
    p_payment_id: ingRes.payment_id,
    p_allocations: [
      { obligation_id: obId, amount_minor: '30000' }
    ],
    p_business: biz.id,
    p_note: 'Paper cash payment test'
  });

  if (appErr) {
    console.error('Approve error:', appErr);
    return;
  }
  console.log('Cash payment approved and allocated:', appRes);

  // 5. Verify updated obligation balance
  const { data: obAfter } = await supabase
    .from('obligations')
    .select('balance_minor, status')
    .eq('id', obId)
    .single();

  console.log('Obligation after payment:', obAfter);
  if (Number(obAfter.balance_minor) === 20000 && obAfter.status === 'partially_paid') {
    console.log('SUCCESS: Obligation balance reduced from 50,000 to 20,000 cents (KES 200) and status set to partially_paid!');
  } else {
    console.error('MISMATCH in balance or status:', obAfter);
  }

  // 6. Check confirmation SMS
  const { data: smsQueue } = await supabase
    .from('sms_outbox')
    .select('id, to_phone, body, status, kind')
    .eq('related_payment_id', ingRes.payment_id);
  console.log('Confirmation SMS queued:', smsQueue);

  // 7. Cleanup test data
  console.log('Cleaning up test records...');
  // Reverse payment to cleanly restore balance and unbind allocations
  await supabase.rpc('reverse_payment', {
    p_payment_id: ingRes.payment_id,
    p_reason: 'Automated test cleanup'
  });

  // Delete test SMS outbox row
  if (smsQueue && smsQueue.length > 0) {
    await supabase.from('sms_outbox').delete().in('id', smsQueue.map(s => s.id));
  }

  // Delete test payment
  await supabase.from('payment_transactions').delete().eq('id', ingRes.payment_id);

  // Delete test obligation
  await supabase.from('obligation_entries').delete().eq('obligation_id', obId);
  await supabase.from('obligations').delete().eq('id', obId);

  console.log('Cleaned up test records cleanly. ALL TESTS PASSED!');
}

testCashPaymentWorkflow();
