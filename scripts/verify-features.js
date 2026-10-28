const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function normalize_msisdn(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return '254' + digits.slice(1);
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^[17]\d{8}$/.test(digits)) return '254' + digits;
  return digits;
}

function cleanPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = normalize_msisdn(digits);
  if (/^254[17]\d{8}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

function extractNicknameFromName(rawName, explicitNickname) {
  let name = rawName.replace(/\s+/g, ' ').trim();
  let nick = explicitNickname?.trim() || undefined;

  if (!nick) {
    const parenMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*(.*?)$/);
    if (parenMatch) {
      const p1 = parenMatch[1].trim();
      const p3 = parenMatch[3].trim();
      nick = parenMatch[2].trim();
      name = [p1, p3].filter(Boolean).join(' ').trim();
    } else {
      const quoteMatch = name.match(/^(.*?)\s*["']([^"']+)["']\s*(.*?)$/);
      if (quoteMatch) {
        const p1 = quoteMatch[1].trim();
        const p3 = quoteMatch[3].trim();
        nick = quoteMatch[2].trim();
        name = [p1, p3].filter(Boolean).join(' ').trim();
      }
    }
  }

  if (!name && nick) {
    name = nick;
  }

  return {
    fullName: name || 'Customer',
    nickname: nick && nick !== name ? nick : undefined,
  };
}

function parseSingleContactString(text) {
  const trimmed = text.trim();
  if (!trimmed) return { fullName: '' };

  // Match Kenyan phone formats with optional spaces, hyphens, or dots between prefix and digits
  const phoneMatch = trimmed.match(/(?:\+?254|0)[\s.-]?[17](?:[\s.-]?\d){8}\b|\b[17](?:[\s.-]?\d){8}\b/);
  let phone = undefined;
  let namePart = trimmed;

  if (phoneMatch) {
    const cleaned = cleanPhone(phoneMatch[0]);
    if (cleaned) {
      phone = cleaned.startsWith('254') ? '0' + cleaned.slice(3) : cleaned;
    }
    namePart = trimmed
      .replace(phoneMatch[0], '')
      .trim()
      .replace(/^[\s\-–:,|]+|[\s\-–:,|]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const { fullName, nickname } = extractNicknameFromName(namePart || (phone ? '' : trimmed));
  return {
    fullName,
    nickname,
    phone,
  };
}

console.log('--- 1. Testing Phonebook Contact Parsing ---');
const testCases = [
  {
    input: 'Mama Brian - 0712345678',
    expectedName: 'Mama Brian',
    expectedPhone: '0712345678',
  },
  {
    input: 'Haron fashio-0725499796',
    expectedName: 'Haron fashio',
    expectedPhone: '0725499796',
  },
  {
    input: 'Zenith- 0711377496',
    expectedName: 'Zenith',
    expectedPhone: '0711377496',
  },
  {
    input: 'Norah Chelangat (Mama Ivy) 254711390861',
    expectedName: 'Norah Chelangat',
    expectedNick: 'Mama Ivy',
    expectedPhone: '0711390861',
  },
  {
    input: 'Fundi John: +254 722 000 111',
    expectedName: 'Fundi John',
    expectedPhone: '0722000111',
  },
  {
    input: 'Kipkorir 0712-345-678',
    expectedName: 'Kipkorir',
    expectedPhone: '0712345678',
  },
];

let allParserPassed = true;
for (const tc of testCases) {
  const res = parseSingleContactString(tc.input);
  const nameOk = res.fullName === tc.expectedName;
  const phoneOk = res.phone === tc.expectedPhone;
  const nickOk = tc.expectedNick ? res.nickname === tc.expectedNick : true;
  if (!nameOk || !phoneOk || !nickOk) {
    console.error(`FAILED on "${tc.input}":`, res, `Expected:`, tc);
    allParserPassed = false;
  } else {
    console.log(`✓ Parsed "${tc.input}" -> Name: "${res.fullName}", Nick: "${res.nickname || ''}", Phone: "${res.phone}"`);
  }
}
if (!allParserPassed) {
  process.exit(1);
}

// 2. Verify Supabase SMS templates
console.log('\n--- 2. Testing Database SMS Templates for Appended Phone Numbers ---');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function verifyTemplates() {
  const { data: businesses } = await supabase.from('businesses').select('id, code, name');
  const { data: tpls } = await supabase.from('sms_templates').select('business_id, key, name, body');

  let allTemplatesOk = true;

  for (const b of businesses) {
    const isHaron = b.code === 'HARON_FASHION' || b.code === 'DEV_HARON_FASHION';
    const isZenith = b.code === 'ZENITH_PLAST' || b.code === 'DEV_ZENITH_PLAST';
    const expectedTag = isHaron ? 'Haron fashio-0725499796' : (isZenith ? 'Zenith- 0711377496' : null);

    if (!expectedTag) continue;

    const bTpls = tpls.filter(t => t.business_id === b.id);
    console.log(`Checking ${bTpls.length} templates for ${b.name} (${b.code}):`);

    for (const t of bTpls) {
      if (!t.body.includes(expectedTag)) {
        console.error(`  ✕ Template ${t.key} missing tag "${expectedTag}":`, t.body);
        allTemplatesOk = false;
      } else {
        console.log(`  ✓ ${t.key} contains "${expectedTag}" (Length: ${t.body.length} chars)`);
      }
    }
  }

  if (!allTemplatesOk) {
    console.error('Some templates failed validation!');
    process.exit(1);
  }

  console.log('\nALL VERIFICATIONS PASSED SUCCESSFULLY!');
}

verifyTemplates();
