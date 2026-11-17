import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCashbookWorkbook, type BusinessBook, type DebtorRow } from '@/lib/reports/cashbook-workbook';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// GET /api/reports/cashbook?month=YYYY-MM
// One workbook containing every business the caller may export (owner/admin/accountant).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || '';
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    if (!match) {
      return NextResponse.json({ error: 'month (YYYY-MM) is required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from('business_members')
      .select('business_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const allowedIds = (memberships || [])
      .filter((m: any) => ['owner', 'admin', 'accountant'].includes(m.role))
      .map((m: any) => m.business_id);
    if (allowedIds.length === 0) {
      return NextResponse.json({ error: 'Only owners, admins and accountants can export the cashbook.' }, { status: 403 });
    }

    const { data: businesses } = await admin
      .from('businesses')
      .select('id, name, code')
      .in('id', allowedIds)
      .order('name');
    const list = (businesses || []).filter((b: any) => b.code !== 'MASTER');
    if (list.length === 0) return NextResponse.json({ error: 'No businesses found.' }, { status: 404 });

    // Month boundaries in Nairobi time (UTC+3, no DST).
    const year = Number(match[1]);
    const mon = Number(match[2]);
    const start = `${month}-01T00:00:00+03:00`;
    const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;
    const end = `${next}-01T00:00:00+03:00`;

    const books: BusinessBook[] = [];
    for (const biz of list as any[]) {
      const payments = await fetchAll((from, to) =>
        admin
          .from('payment_transactions')
          .select('occurred_at,transaction_ref,provider,direction,payer_name,payer_msisdn,payer_msisdn_masked,account_reference,receiving_account,description,amount_minor,status,conflict_flags,decision_note')
          .eq('business_id', biz.id)
          .gte('occurred_at', start)
          .lt('occurred_at', end)
          .order('occurred_at', { ascending: true })
          .range(from, to),
      );

      const obligations = await fetchAll((from, to) =>
        admin
          .from('obligations')
          .select('customer_id,balance_minor,due_date')
          .eq('business_id', biz.id)
          .eq('kind', 'customer_debt')
          .in('status', ['open', 'partially_paid'])
          .gt('balance_minor', 0)
          .range(from, to),
      );

      const customers = await fetchAll((from, to) =>
        admin.from('customers').select('id,full_name,phone').eq('business_id', biz.id).range(from, to),
      );
      const customerById = new Map(customers.map((c: any) => [c.id, c]));

      const byCustomer = new Map<string, DebtorRow>();
      for (const o of obligations as any[]) {
        const c: any = customerById.get(o.customer_id);
        const row = byCustomer.get(o.customer_id) || {
          name: c?.full_name || 'Unknown customer',
          phone: c?.phone || null,
          openDebts: 0,
          balanceMinor: 0,
          oldestDue: null,
        };
        row.openDebts += 1;
        row.balanceMinor += Number(o.balance_minor || 0);
        if (o.due_date && (!row.oldestDue || o.due_date < row.oldestDue)) row.oldestDue = o.due_date;
        byCustomer.set(o.customer_id, row);
      }

      books.push({ name: biz.name, payments: payments as any, debtors: Array.from(byCustomer.values()) });
    }

    const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, mon - 1, 1)));

    const buffer = await buildCashbookWorkbook({ monthLabel, businesses: books, generatedAt: new Date() });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Cashbook_${month}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Cashbook export error:', error);
    return NextResponse.json({ error: 'Could not generate the cashbook.' }, { status: 500 });
  }
}
