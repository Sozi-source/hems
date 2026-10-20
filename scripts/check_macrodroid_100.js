const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx !== -1) {
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkIngestLogs() {
  console.log('--- CHECKING PAYMENT INGEST LOGS ---');
  const { data: logs, error: lErr } = await client
    .from('payment_ingest_log')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(30);

  if (lErr) {
    console.error('Error fetching ingest logs:', lErr);
    return;
  }

  console.log(`Found ${logs.length} ingest logs:`);
  logs.forEach(l => {
    console.log(`\n[ID: ${l.id}] ${l.last_seen_at} | Outcome: ${l.outcome} | Error: ${l.error || 'none'}`);
    console.log(`Raw: ${l.raw}`);
  });

  console.log('\n--- CHECKING TRANSACTIONS AROUND KSH 100 OR REF WITH 100 ---');
  const { data: txs, error: tErr } = await client
    .from('payment_transactions')
    .select('id, transaction_ref, provider, amount_minor, status, occurred_at, description, decided_at, decision_note')
    .or('amount_minor.eq.10000,description.ilike.%100%')
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (txs) {
    console.log(`Found ${txs.length} matching transactions:`);
    txs.forEach(t => console.log(t));
  }
}

checkIngestLogs();
