// scripts/test-sms.js
// Utility to test sending an SMS via Mobiwave API
const fs = require('fs');

function loadEnv() {
  if (!fs.existsSync('.env.local')) return;
  const content = fs.readFileSync('.env.local', 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

async function main() {
  const endpoint = process.env.MOBIWAVES_API_URL || 'https://sms.mobiwave.co.ke/api/v3/sms/send';
  const apiKey = process.env.MOBIWAVES_API_KEY;
  const senderId = process.env.MOBIWAVES_SENDER_ID;
  const testPhone = process.argv[2] || process.env.TEST_PHONE || '254711390861';

  console.log('--- Mobiwave SMS Integration Test ---');
  console.log('Endpoint :', endpoint);
  console.log('API Key  :', apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(NOT SET)');
  console.log('Sender ID:', senderId || '(NOT SET)');
  console.log('Test To  :', testPhone);

  if (!apiKey || !senderId) {
    console.error('\n[ERROR] MOBIWAVES_API_KEY and MOBIWAVES_SENDER_ID must be configured in .env.local');
    process.exit(1);
  }

  const payload = {
    recipient: testPhone.replace(/\D/g, ''),
    sender_id: senderId,
    type: 'plain',
    message: 'HEMS Test: Hello from Haron Enterprise Management System via Mobiwave!',
  };

  console.log('\nSending payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const status = response.status;
    const body = await response.text();
    console.log(`\nResponse HTTP Status: ${status}`);
    console.log('Response Body:', body);

    if (response.ok) {
      console.log('\n[SUCCESS] Test SMS sent successfully!');
    } else {
      console.log('\n[FAIL] Mobiwave API returned an error.');
    }
  } catch (err) {
    console.error('\n[EXCEPTION] Failed to connect to Mobiwave:', err.message);
  }
}

main();
