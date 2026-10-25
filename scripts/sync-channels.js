const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function syncChannels() {
  const { data: businesses } = await supabase.from('businesses').select('id, code, name');
  const haron = businesses.find(b => b.code === 'HARON_FASHION');
  const zenith = businesses.find(b => b.code === 'ZENITH_PLAST');

  console.log('Haron ID:', haron?.id);
  console.log('Zenith ID:', zenith?.id);

  // 1. Update/upsert Equity channel for Haron Fashion
  const { data: ch1, error: err1 } = await supabase.from('payment_channels').upsert({
    business_id: haron.id,
    provider: 'mpesa_paybill',
    shortcode: '247247',
    label: 'Equity Bank (Paybill 247247, Acc 650166)',
    is_active: true
  }, { onConflict: 'provider,shortcode' }).select();
  console.log('Equity channel:', ch1, err1);

  // 2. Insert/upsert NCBA channel for Haron Fashion
  const { data: ch2, error: err2 } = await supabase.from('payment_channels').upsert({
    business_id: haron.id,
    provider: 'mpesa_paybill',
    shortcode: '880100',
    label: 'NCBA Bank (Paybill 880100, Acc 650166)',
    is_active: true
  }, { onConflict: 'provider,shortcode' }).select();
  console.log('NCBA channel:', ch2, err2);

  // 3. Insert/upsert Absa channel for Zenith Plast
  const { data: ch3, error: err3 } = await supabase.from('payment_channels').upsert({
    business_id: zenith.id,
    provider: 'mpesa_paybill',
    shortcode: '303030',
    label: 'Absa Bank (Paybill 303030, Acc 1398#)',
    is_active: true
  }, { onConflict: 'provider,shortcode' }).select();
  console.log('Absa channel:', ch3, err3);
}

syncChannels();
