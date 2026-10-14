const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function check() {
  const { data: logs } = await supabase
    .from('payment_ingest_log')
    .select('id, source, raw, outcome, error, first_seen_at')
    .order('first_seen_at', { ascending: false })
    .limit(3);

  console.log('LATEST_LOGS:', logs);
}

check();
