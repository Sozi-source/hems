import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// PATCH /api/obligations/due-date
// Allows business owners and authorized staff (admins, accountants, cashiers)
// to adjust the due date of a specific debt obligation, or synchronize all open debts for a client.
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      businessId,
      obligationId,
      customerId,
      dueDate,
      syncAllCustomerDebts,
    } = body;

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'Business ID is required.' }, { status: 400 });
    }

    if (!dueDate || typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ error: 'A valid due date (YYYY-MM-DD) is required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify caller permissions: owner, admin, accountant, or cashier
    const { data: member, error: memErr } = await admin
      .from('business_members')
      .select('role, is_active')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (memErr || !member || !['owner', 'admin', 'accountant', 'cashier'].includes(member.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to adjust debt due dates for this business.' },
        { status: 403 }
      );
    }

    let updatedCount = 0;

    // Case 1: Synchronize all open/partially paid debts for this customer
    if (syncAllCustomerDebts && customerId) {
      const { data: updated, error: syncErr } = await admin
        .from('obligations')
        .update({
          due_date: dueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .in('status', ['open', 'partially_paid'])
        .select('id, reference_no, due_date');

      if (syncErr) {
        console.error('Failed to sync customer open debts:', syncErr);
        return NextResponse.json({ error: 'Failed to synchronize customer debt due dates.' }, { status: 500 });
      }

      updatedCount = updated?.length || 0;
    }
    // Case 2: Update a specific obligation
    else if (obligationId) {
      const { data: updated, error: updateErr } = await admin
        .from('obligations')
        .update({
          due_date: dueDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', obligationId)
        .eq('business_id', businessId)
        .select('id, reference_no, due_date');

      if (updateErr) {
        console.error('Failed to update obligation due date:', updateErr);
        return NextResponse.json({ error: 'Failed to update due date.' }, { status: 500 });
      }

      updatedCount = updated?.length || 0;
    } else {
      return NextResponse.json(
        { error: 'Either obligationId or (syncAllCustomerDebts and customerId) must be provided.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      dueDate,
    });
  } catch (err: any) {
    console.error('Adjust due date error:', err);
    return NextResponse.json({ error: 'Failed to adjust due date.' }, { status: 500 });
  }
}
