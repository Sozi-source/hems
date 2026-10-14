import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchPayment } from '@/lib/daraja/matcher';
import { ParsedStatementRow } from '@/lib/reconciliation/statement-parser';

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
    const rows: ParsedStatementRow[] = Array.isArray(body.rows) ? body.rows : [];

    if (!businessId || rows.length === 0) {
      return NextResponse.json({ error: 'businessId and valid rows are required' }, { status: 400 });
    }

    // Role verification
    const admin = createAdminClient();
    const { data: member } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!member || !['owner', 'admin', 'accountant'].includes(member.role)) {
      return NextResponse.json({ error: 'Permission denied. Only owner, admin, or accountant can import statements.' }, { status: 403 });
    }

    let createdCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.transactionRef || !row.amountMinor || row.amountMinor <= 0) {
        errorCount++;
        continue;
      }

      try {
        const { data: ingestResult, error: ingestError } = await admin.rpc('ingest_payment', {
          p: {
            provider: row.provider || 'bank',
            transaction_ref: row.transactionRef,
            source: 'manual',
            direction: 'in',
            amount_minor: row.amountMinor,
            business_id: businessId,
            payer_name: row.payerName || null,
            account_reference: row.accountReference || null,
            occurred_at: row.occurredAt || new Date().toISOString(),
            raw_text: row.rawDescription || `Statement row ${row.rowNumber}`,
            description: `Bank Statement Import: ${row.rawDescription || row.transactionRef}`,
          },
        });

        if (ingestError) {
          errorCount++;
          errors.push(`Row ${row.rowNumber} (${row.transactionRef}): ${ingestError.message}`);
          continue;
        }

        const outcome = ingestResult?.outcome;
        if (outcome === 'created') {
          createdCount++;
          if (ingestResult?.payment_id) {
            // Run matching engine
            await matchPayment(ingestResult.payment_id);
          }
        } else if (outcome === 'duplicate_ref' || outcome === 'duplicate_content') {
          duplicateCount++;
        } else {
          createdCount++;
        }
      } catch (err: any) {
        errorCount++;
        errors.push(`Row ${row.rowNumber}: ${err.message || 'Ingest failed'}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessed: rows.length,
      createdCount,
      duplicateCount,
      errorCount,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error('Statement import error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
