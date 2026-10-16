import { normalize_msisdn } from '@/lib/format';

export interface ParsedContact {
  fullName: string;
  nickname?: string;
  phone: string;
  source: 'vcf' | 'csv' | 'paste';
  rawRecord?: string;
}

export interface PhonebookParseResult {
  contacts: ParsedContact[];
  skippedCount: number;
  warnings: string[];
}

/**
 * Normalizes phone numbers specifically for Kenyan contact books.
 * Accepts formats: +254 712 345 678, 0712345678, 254712345678, 712345678, 0112345678
 */
function cleanPhone(raw: string): string | null {
  if (!raw) return null;
  // Remove spaces, hyphens, brackets, non-digit chars except plus
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  const normalized = normalize_msisdn(digits);
  if (/^254[17]\d{8}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Extracts nickname from parenthesized or quoted name strings:
 * e.g. "Norah Chelangat (Mama Ivy)" -> { fullName: "Norah Chelangat", nickname: "Mama Ivy" }
 * e.g. "John 'Fundi' Kamau" -> { fullName: "John Kamau", nickname: "Fundi" }
 */
function extractNicknameFromName(rawName: string, explicitNickname?: string): { fullName: string; nickname?: string } {
  let name = rawName.replace(/\s+/g, ' ').trim();
  let nick = explicitNickname?.trim() || undefined;

  if (!nick) {
    // Check for (Nickname)
    const parenMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*(.*?)$/);
    if (parenMatch) {
      const p1 = parenMatch[1].trim();
      const p3 = parenMatch[3].trim();
      nick = parenMatch[2].trim();
      name = [p1, p3].filter(Boolean).join(' ').trim();
    } else {
      // Check for 'Nickname' or "Nickname"
      const quoteMatch = name.match(/^(.*?)\s*["']([^"']+)["']\s*(.*?)$/);
      if (quoteMatch) {
        const p1 = quoteMatch[1].trim();
        const p3 = quoteMatch[3].trim();
        nick = quoteMatch[2].trim();
        name = [p1, p3].filter(Boolean).join(' ').trim();
      }
    }
  }

  // If name became empty, fallback to nickname
  if (!name && nick) {
    name = nick;
  }

  return {
    fullName: name || 'Customer',
    nickname: nick && nick !== name ? nick : undefined,
  };
}

/**
 * Parses Android & iOS vCard (.vcf) phonebook exports.
 * Supports vCard 2.1, 3.0, and 4.0.
 */
export function parseVCard(vcfText: string): PhonebookParseResult {
  const contacts: ParsedContact[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  // Split into individual VCARD blocks
  const cards = vcfText.split(/BEGIN:VCARD/i).filter((c) => c.trim().length > 0);

  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let fn: string | undefined;
    let n: string | undefined;
    let nickname: string | undefined;
    const phones: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // Handle folded lines (vCard line unfolding starts with space or tab)
      while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
        i++;
        line += lines[i].trim();
      }

      if (/^FN/i.test(line)) {
        fn = line.replace(/^FN[^:]*:/i, '').trim();
      } else if (/^NICKNAME/i.test(line)) {
        nickname = line.replace(/^NICKNAME[^:]*:/i, '').trim();
      } else if (/^N[:;]/i.test(line) && !fn) {
        const parts = line.replace(/^N[^:]*:/i, '').split(';').map((s) => s.trim()).filter(Boolean);
        // parts typically: Last, First, Middle
        if (parts.length >= 2) {
          n = `${parts[1]} ${parts[0]}`.trim();
        } else if (parts.length === 1) {
          n = parts[0];
        }
      } else if (/^TEL/i.test(line)) {
        const rawPhone = line.replace(/^TEL[^:]*:/i, '').trim();
        const cleaned = cleanPhone(rawPhone);
        if (cleaned && !phones.includes(cleaned)) {
          phones.push(cleaned);
        }
      }
    }

    const candidateName = fn || n || nickname || '';
    if (phones.length === 0 || !candidateName) {
      skippedCount++;
      continue;
    }

    const { fullName, nickname: extractedNick } = extractNicknameFromName(candidateName, nickname);

    for (const phone of phones) {
      contacts.push({
        fullName,
        nickname: extractedNick,
        phone,
        source: 'vcf',
        rawRecord: candidateName,
      });
    }
  }

  return { contacts, skippedCount, warnings };
}

/**
 * Parses Google Contacts or Excel phonebook CSV exports.
 */
export function parseContactsCsv(csvText: string): PhonebookParseResult {
  const contacts: ParsedContact[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { contacts, skippedCount: 0, warnings: ['File is empty or has no header row'] };
  }

  // Parse header row
  const headerParts = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

  // Find column indices
  let nameIdx = headerParts.findIndex((h) => h === 'name' || h === 'full name' || h === 'contact name');
  let firstIdx = headerParts.findIndex((h) => h === 'first name' || h === 'given name');
  let lastIdx = headerParts.findIndex((h) => h === 'last name' || h === 'family name');
  let nickIdx = headerParts.findIndex((h) => h === 'nickname' || h === 'alias');
  
  // Find phone indices (may have multiple: Phone 1 - Value, Mobile, Phone, Tel)
  const phoneIndices: number[] = [];
  headerParts.forEach((h, idx) => {
    if (h.includes('phone') || h.includes('mobile') || h.includes('tel') || h === 'cell') {
      phoneIndices.push(idx);
    }
  });

  if (nameIdx === -1 && firstIdx === -1 && phoneIndices.length === 0) {
    // If no header matches, assume Col 0 is Name, Col 1 is Phone, Col 2 is Nickname
    nameIdx = 0;
    phoneIndices.push(1);
    if (headerParts.length > 2) nickIdx = 2;
  }

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV row parser (handles quoted values with commas)
    const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
    const cleanCells = row.map((cell) => cell.replace(/^["']|["']$/g, '').trim());

    let rawName = '';
    if (nameIdx !== -1 && cleanCells[nameIdx]) {
      rawName = cleanCells[nameIdx];
    } else if (firstIdx !== -1) {
      rawName = `${cleanCells[firstIdx] || ''} ${cleanCells[lastIdx] || ''}`.trim();
    }

    const rawNick = nickIdx !== -1 ? cleanCells[nickIdx] : undefined;

    const phones: string[] = [];
    for (const pIdx of phoneIndices) {
      if (cleanCells[pIdx]) {
        const cleaned = cleanPhone(cleanCells[pIdx]);
        if (cleaned && !phones.includes(cleaned)) {
          phones.push(cleaned);
        }
      }
    }

    if (!rawName || phones.length === 0) {
      skippedCount++;
      continue;
    }

    const { fullName, nickname: extractedNick } = extractNicknameFromName(rawName, rawNick);

    for (const phone of phones) {
      contacts.push({
        fullName,
        nickname: extractedNick,
        phone,
        source: 'csv',
        rawRecord: lines[i],
      });
    }
  }

  return { contacts, skippedCount, warnings };
}

/**
 * Parses freeform pasted text lines:
 * e.g. "Mama Brian - 0712345678"
 * e.g. "Norah Tangus (Mama Ivy), 254711390861"
 * e.g. "Kipkorir Festus 0700123456"
 */
export function parsePastedContacts(text: string): PhonebookParseResult {
  const contacts: ParsedContact[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Look for a Kenyan phone number in the line
    const phoneMatch = line.match(/\b(0[17]\d{8}|254[17]\d{8}|\+254[17]\d{8})\b/);
    if (!phoneMatch) {
      skippedCount++;
      continue;
    }

    const phone = cleanPhone(phoneMatch[1]);
    if (!phone) {
      skippedCount++;
      continue;
    }

    // The name is whatever surrounds the phone, stripped of separators (-, :, ,)
    const namePart = line
      .replace(phoneMatch[0], '')
      .replace(/^[-–:,|]+|[-–:,|]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const candidateName = namePart || 'Customer';
    const { fullName, nickname } = extractNicknameFromName(candidateName);

    contacts.push({
      fullName,
      nickname,
      phone,
      source: 'paste',
      rawRecord: line,
    });
  }

  return { contacts, skippedCount, warnings };
}
