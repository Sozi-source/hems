import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
    const cutoffDays = typeof body.cutoffDays === 'number' && body.cutoffDays > 0 ? body.cutoffDays : 7;
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : 'Historical transaction batch approved';

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify user role in business
    const { data: member } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!member || !['owner', 'admin', 'accountant'].includes(member.role)) {
      return NextResponse.json({ error: 'Permission denied. Only owner, admin, or accountant can batch approve payments.' }, { status: 403 });
    }

    const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

    // Query pending payments for this business
    const { data: pending, error: fetchErr } = await admin
      .from('payment_transactions')
      .select('id, business_id, transaction_ref, amount_minor, occurred_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('occurred_at', { ascending: true });

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const toApprove = [];
    const keptRecent = [];

    for (const p of pending || []) {
      const occurred = new Date(p.occurred_at);
      if (occurred < cutoffDate) {
        toApprove.push(p);
      } else {
        keptRecent.push(p);
      }
    }

    let approvedCount = 0;
    const errors: string[] = [];

    for (const p of toApprove) {
      const { error: appErr } = await admin.rpc('approve_payment', {
        p_payment_id: p.id,
        p_allocations: [],
        p_business: businessId,
        p_note: note,
      });

      if (appErr) {
        errors.push(`${p.transaction_ref}: ${appErr.message}`);
      } else {
        approvedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      cutoffDays,
      cutoffDate: cutoffDate.toISOString(),
      totalFound: pending?.length || 0,
      approvedCount,
      keptRecentCount: keptRecent.length,
      failedCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error('Batch approval error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
