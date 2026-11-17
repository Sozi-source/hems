import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await context.params;
    const body = await request.json();
    const { action, reason, referenceNo, notes, paymentDate, method } = body;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to update this payment.' }, { status: 401 });
    }

    if (action === 'verify') {
      const { error } = await supabase.rpc('verify_loan_payment', {
        p_payment_id: paymentId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'reverse') {
      const cleanReason = typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : 'Reversed by user';
      const { error } = await supabase.rpc('reverse_loan_payment', {
        p_payment_id: paymentId,
        p_reason: cleanReason,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'edit') {
      const updates: Record<string, any> = {};
      if (typeof referenceNo === 'string') updates.reference_no = referenceNo.trim() || null;
      if (typeof notes === 'string') updates.notes = notes.trim() || null;
      if (typeof paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        updates.payment_date = paymentDate;
      }
      if (typeof method === 'string') updates.method = method;

      const { error } = await supabase
        .from('loan_payments')
        .update(updates)
        .eq('id', paymentId)
        .eq('obligation_id', id)
        .is('reversed_at', null);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported payment action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update loan payment' }, { status: 500 });
  }
}
