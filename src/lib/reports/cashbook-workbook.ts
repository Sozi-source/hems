import ExcelJS from 'exceljs';

export type CashbookPayment = {
  occurred_at: string;
  transaction_ref: string;
  provider: string;
  direction: string | null;
  payer_name: string | null;
  payer_msisdn: string | null;
  payer_msisdn_masked?: string | null;
  account_reference: string | null;
  receiving_account?: string | null;
  description?: string | null;
  amount_minor: number | string;
  status: string;
  conflict_flags: string[] | null;
  decision_note: string | null;
};

export type DebtorRow = {
  name: string;
  phone: string | null;
  openDebts: number;
  balanceMinor: number;
  oldestDue: string | null;
};

export type BusinessBook = {
  name: string;
  payments: CashbookPayment[];
  debtors: DebtorRow[];
};

export type CashbookInput = {
  monthLabel: string; // e.g. "October 2026"
  businesses: BusinessBook[];
  generatedAt: Date;
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Reconciled',
  pending: 'Pending review',
  rejected: 'Rejected',
  reversed: 'Reversed',
};
const STATUS_FILL: Record<string, string> = {
  Reconciled: 'FFDCFCE7',
  'Pending review': 'FFFEF3C7',
  Rejected: 'FFFEE2E2',
  Reversed: 'FFE5E7EB',
};
const STATUS_ORDER = ['Reconciled', 'Pending review', 'Rejected', 'Reversed'];

const MONEY = '#,##0.00;[Red]-#,##0.00';
const HEADER_FILL = 'FF1E293B';
const NAIROBI = 'Africa/Nairobi';

const kes = (minor: number | string | null | undefined) => Number(minor || 0) / 100;
const isOut = (p: CashbookPayment) => p.direction === 'out';
const statusOf = (p: CashbookPayment) => STATUS_LABEL[p.status] || p.status;

// "M-Pesa", "Cash", or the bank's name (Equity, Absa) so bank money is split by bank.
export function channelOf(provider: string): string {
  const p = (provider || '').toLowerCase();
  if (p.startsWith('mpesa')) return 'M-Pesa';
  if (p.startsWith('cash')) return 'Cash';
  if (p.startsWith('bank')) {
    const name = p.replace(/^bank[_:\s-]*/, '').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Bank';
  }
  return 'Other';
}

// 254712345678 -> 0712 345 678. Masked numbers (2547****123) are shown as received.
function phoneOf(p: CashbookPayment): string {
  const raw = (p.payer_msisdn || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('254')) {
    const l = `0${digits.slice(3)}`;
    return `${l.slice(0, 4)} ${l.slice(4, 7)} ${l.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return raw || (p.payer_msisdn_masked || '').trim();
}

// Bank rows: show the statement narration (useful for matching to the statement).
function noteOf(p: CashbookPayment): string {
  const flags = (p.conflict_flags || []).filter(Boolean).map((f) => f.replace(/_/g, ' '));
  const isBank = (p.provider || '').toLowerCase().startsWith('bank');
  const narration = isBank
    ? (p.description || '').replace(/^Bank Statement Import:\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 70)
    : '';
  return [...flags, narration, p.decision_note || ''].filter(Boolean).join('; ').slice(0, 120);
}

function nairobiDate(iso: string): Date {
  // UTC-midnight of the Nairobi calendar day, so Excel shows the right day.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso)).split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function styleHeader(row: ExcelJS.Row, cols = 0) {
  row.height = 22;
  const apply = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  };
  if (cols > 0) for (let i = 1; i <= cols; i++) apply(row.getCell(i));
  else row.eachCell(apply);
}


const colLetter = (n: number) => String.fromCharCode(64 + n);

function uniqueSheetName(wb: ExcelJS.Workbook, base: string): string {
  const clean = base.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = clean;
  let i = 2;
  while (wb.getWorksheet(name)) name = `${clean.slice(0, 28)} ${i++}`;
  return name;
}

type Refs = {
  book: string; lastRow: number; debt: string; dLast: number;
  cols: { in: string; out: string | null; status: string; channel: string };
};

export async function buildCashbookWorkbook(input: CashbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HEMS';
  wb.created = input.generatedAt;

  // Money Out only appears when there is something to show, to keep sheets simple.
  const hasOut = input.businesses.some((b) => b.payments.some(isOut));

  const summary = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  const refs: Refs[] = [];

  for (const biz of input.businesses) {
    const book = wb.addWorksheet(uniqueSheetName(wb, biz.name), { views: [{ state: 'frozen', ySplit: 1 }] });
    const debt = wb.addWorksheet(uniqueSheetName(wb, `${biz.name.slice(0, 22)} Debtors`), { views: [{ state: 'frozen', ySplit: 1 }] });

    // Column letters shift by one when Money Out is hidden.
    const cChannel = 'F';
    const cIn = 'G';
    const cOut = hasOut ? 'H' : null;
    const cBal = hasOut ? 'I' : 'H';
    const cStatus = hasOut ? 'J' : 'I';
    const cNote = hasOut ? 'K' : 'J';

    book.columns = [
      { header: 'Date', key: 'date', width: 13 },
      { header: 'Receipt / Ref', key: 'ref', width: 18 },
      { header: 'Customer / Payer', key: 'payer', width: 28 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Account', key: 'account', width: 14 },
      { header: 'Channel', key: 'channel', width: 11 },
      { header: 'Money In', key: 'in', width: 15 },
      ...(hasOut ? [{ header: 'Money Out', key: 'out', width: 15 }] : []),
      { header: 'Running Balance', key: 'bal', width: 17 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Note', key: 'note', width: 34 },
    ];
    styleHeader(book.getRow(1));

    const sorted = [...biz.payments].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
    );
    let running = 0;
    sorted.forEach((p, i) => {
      const r = i + 2;
      const status = statusOf(p);
      const out = isOut(p);
      const amount = kes(p.amount_minor);
      if (status === 'Reconciled') running += out ? -amount : amount;

      const row = book.addRow({
        date: nairobiDate(p.occurred_at),
        ref: p.transaction_ref,
        payer: p.payer_name || '—',
        phone: phoneOf(p),
        account: p.account_reference || '',
        channel: channelOf(p.provider),
        in: out ? null : amount,
        out: out ? amount : null,
        bal: null,
        status,
        note: noteOf(p),
      });
      // Running balance counts reconciled rows only, so it agrees with customer accounts.
      const outPart = cOut ? `-N(${cOut}${r})` : '';
      row.getCell('bal').value = {
        formula: `${r === 2 ? '' : `${cBal}${r - 1}+`}IF(${cStatus}${r}="Reconciled",N(${cIn}${r})${outPart},0)`,
        result: running,
      };
      row.getCell('date').numFmt = 'dd mmm yyyy';
      ['in', ...(hasOut ? ['out'] : []), 'bal'].forEach((k) => (row.getCell(k).numFmt = MONEY));
      const fill = STATUS_FILL[status];
      if (fill) row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    });
    const lastRow = Math.max(sorted.length + 1, 2);
    book.autoFilter = { from: 'A1', to: `${cNote}${lastRow}` };

    // Debtors
    debt.columns = [
      { header: 'Customer', key: 'name', width: 30 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Open Debts', key: 'n', width: 12 },
      { header: 'Balance Owed', key: 'bal', width: 17 },
      { header: 'Oldest Due Date', key: 'due', width: 16 },
    ];
    styleHeader(debt.getRow(1));
    const rows = [...biz.debtors].sort((a, b) => b.balanceMinor - a.balanceMinor);
    rows.forEach((d) => {
      const row = debt.addRow({
        name: d.name, phone: d.phone || '', n: d.openDebts, bal: kes(d.balanceMinor),
        due: d.oldestDue ? new Date(`${d.oldestDue}T00:00:00Z`) : null,
      });
      row.getCell('bal').numFmt = MONEY;
      row.getCell('due').numFmt = 'dd mmm yyyy';
    });
    const dLast = rows.length + 1;
    const total = debt.addRow({
      name: 'TOTAL',
      n: { formula: `SUM(C2:C${dLast})`, result: rows.reduce((s, d) => s + d.openDebts, 0) },
      bal: { formula: `SUM(D2:D${dLast})`, result: kes(rows.reduce((s, d) => s + d.balanceMinor, 0)) },
    });
    total.font = { bold: true };
    total.getCell('bal').numFmt = MONEY;
    total.eachCell((c) => (c.border = { top: { style: 'thin' } }));
    debt.autoFilter = { from: 'A1', to: `E${Math.max(dLast, 2)}` };

    refs.push({ book: book.name, lastRow, debt: debt.name, dLast, cols: { in: cIn, out: cOut, status: cStatus, channel: cChannel } });
  }

  // ----------------------------------------------------------------- Summary
  const width = hasOut ? 4 : 3;
  summary.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 18 }];
  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = `Cashbook Summary — ${input.monthLabel}`;
  summary.getCell('A1').font = { bold: true, size: 16 };
  summary.mergeCells('A2:D2');
  summary.getCell('A2').value = `Generated ${new Intl.DateTimeFormat('en-KE', {
    timeZone: NAIROBI, dateStyle: 'medium', timeStyle: 'short',
  }).format(input.generatedAt)}  ·  One cashbook and one debtors sheet per business`;
  summary.getCell('A2').font = { color: { argb: 'FF64748B' } };

  let r = 4;
  input.businesses.forEach((biz, idx) => {
    const ref = refs[idx];
    const q = `'${ref.book}'`;
    const rng = (col: string) => `${q}!$${col}$2:$${col}$${ref.lastRow}`;
    const inCol = ref.cols.in;
    const outCol = ref.cols.out;
    const stCol = ref.cols.status;

    summary.mergeCells(`A${r}:D${r}`);
    summary.getCell(`A${r}`).value = biz.name;
    summary.getCell(`A${r}`).font = { bold: true, size: 13, color: { argb: 'FF1E293B' } };
    summary.getCell(`A${r}`).border = { bottom: { style: 'medium', color: { argb: 'FF1E293B' } } };
    r += 1;

    // Status table
    const head = summary.getRow(r);
    ['Status', 'Count', 'Money In', ...(hasOut ? ['Money Out'] : [])].forEach((l, i) => (head.getCell(i + 1).value = l));
    styleHeader(head, width);
    r += 1;
    const firstStatusRow = r;
    STATUS_ORDER.forEach((label) => {
      const rows = biz.payments.filter((p) => statusOf(p) === label);
      summary.getCell(`A${r}`).value = label;
      summary.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[label] } };
      summary.getCell(`B${r}`).value = { formula: `COUNTIF(${rng(stCol)},A${r})`, result: rows.length };
      summary.getCell(`C${r}`).value = {
        formula: `SUMIFS(${rng(inCol)},${rng(stCol)},A${r})`,
        result: rows.filter((p) => !isOut(p)).reduce((s, p) => s + kes(p.amount_minor), 0),
      };
      summary.getCell(`C${r}`).numFmt = MONEY;
      if (outCol) {
        summary.getCell(`D${r}`).value = {
          formula: `SUMIFS(${rng(outCol)},${rng(stCol)},A${r})`,
          result: rows.filter(isOut).reduce((s, p) => s + kes(p.amount_minor), 0),
        };
        summary.getCell(`D${r}`).numFmt = MONEY;
      }
      r += 1;
    });
    const rec = biz.payments.filter((p) => statusOf(p) === 'Reconciled');
    const recIn = rec.filter((p) => !isOut(p)).reduce((s, p) => s + kes(p.amount_minor), 0);
    const recOut = rec.filter(isOut).reduce((s, p) => s + kes(p.amount_minor), 0);
    summary.getCell(`A${r}`).value = outCol ? 'Net reconciled cash' : 'Total reconciled';
    summary.getCell(`C${r}`).value = {
      formula: outCol ? `C${firstStatusRow}-D${firstStatusRow}` : `C${firstStatusRow}`,
      result: recIn - recOut,
    };
    summary.getCell(`C${r}`).numFmt = MONEY;
    summary.getRow(r).font = { bold: true };
    [1, 2, 3, ...(hasOut ? [4] : [])].forEach((c) => (summary.getRow(r).getCell(c).border = { top: { style: 'thin' } }));
    r += 2;

    // Channels (reconciled money in)
    const ch = summary.getRow(r);
    ['Reconciled by channel', 'Count', 'Money In'].forEach((l, i) => (ch.getCell(i + 1).value = l));
    styleHeader(ch, 3);
    r += 1;
    // M-Pesa and Cash always listed; banks (Equity, Absa...) appear when they have receipts.
    const extra = Array.from(new Set(rec.map((p) => channelOf(p.provider))))
      .filter((c) => c !== 'M-Pesa' && c !== 'Cash')
      .sort();
    ['M-Pesa', 'Cash', ...extra].forEach((name) => {
      const rows = rec.filter((p) => channelOf(p.provider) === name && !isOut(p));
      summary.getCell(`A${r}`).value = name;
      summary.getCell(`B${r}`).value = {
        formula: `COUNTIFS(${rng(ref.cols.channel)},A${r},${rng(stCol)},"Reconciled",${rng(inCol)},">0")`,
        result: rows.length,
      };
      summary.getCell(`C${r}`).value = {
        formula: `SUMIFS(${rng(inCol)},${rng(ref.cols.channel)},A${r},${rng(stCol)},"Reconciled")`,
        result: rows.reduce((s, p) => s + kes(p.amount_minor), 0),
      };
      summary.getCell(`C${r}`).numFmt = MONEY;
      r += 1;
    });
    r += 1;

    // Customers
    const dq = `'${ref.debt}'`;
    summary.getCell(`A${r}`).value = 'Customers owing (today)';
    summary.getCell(`C${r}`).value = { formula: `COUNTA(${dq}!$A$2:$A$${ref.dLast})`, result: biz.debtors.length };
    r += 1;
    summary.getCell(`A${r}`).value = 'Total outstanding';
    summary.getCell(`C${r}`).value = {
      formula: `${dq}!D${ref.dLast + 1}`,
      result: kes(biz.debtors.reduce((s, d) => s + d.balanceMinor, 0)),
    };
    summary.getCell(`C${r}`).numFmt = MONEY;
    summary.getRow(r).font = { bold: true };
    r += 1;

    const pending = biz.payments.filter((p) => statusOf(p) === 'Pending review').length;
    summary.mergeCells(`A${r}:D${r}`);
    summary.getCell(`A${r}`).value = pending > 0
      ? `⚠ ${pending} payment${pending === 1 ? '' : 's'} still need review`
      : '✓ Every payment this month has been reviewed';
    summary.getCell(`A${r}`).font = { bold: true, color: { argb: pending > 0 ? 'FFB45309' : 'FF15803D' } };
    r += 3;
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
