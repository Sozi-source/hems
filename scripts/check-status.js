const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function checkPaymentDetails() {
  const { data: p } = await supabase
    .from('payment_transactions')
    .select('id, transaction_ref, status, amount_minor, payer_name, payer_msisdn, business_id, decided_at, decided_by, decision_note')
    .eq('transaction_ref', 'UJFMDAEN6H')
    .single();

  console.log('PAYMENT_STATUS_CHECK:', p);

  const { data: biz } = await supabase.from('businesses').select('id, name, code');
  console.log('BIZ:', biz);
}

checkPaymentDetails();
