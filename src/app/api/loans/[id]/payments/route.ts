import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const VALID_METHODS = ['mpesa', 'bank_transfer', 'cash', 'cheque', 'other'];

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to view loan payments.' }, { status: 401 });
    }

    const { data: payments, error } = await supabase
      .from('loan_payments')
      .select('*')
      .eq('obligation_id', id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, payments: payments || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load loan payments' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const {
      paymentDate,
      amount,
      amountMinor: rawAmountMinor,
      method = 'bank_transfer',
      referenceNo,
      attachmentUrl,
      notes,
      verifyNow = false,
    } = body;

    if (typeof paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return NextResponse.json({ error: 'Enter a valid payment date (YYYY-MM-DD).' }, { status: 400 });
    }

    const amountMinor = rawAmountMinor
      ? Math.round(Number(rawAmountMinor))
      : Math.round(Number(amount) * 100);

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 });
    }

    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json({ error: 'Select a valid payment method.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to record a loan payment.' }, { status: 401 });
    }

    const { data: paymentId, error: rpcError } = await supabase.rpc('record_loan_payment', {
      p_obligation_id: id,
      p_payment_date: paymentDate,
      p_amount_minor: amountMinor,
      p_method: method,
      p_reference_no: typeof referenceNo === 'string' && referenceNo.trim() ? referenceNo.trim() : null,
      p_attachment_url: typeof attachmentUrl === 'string' && attachmentUrl.trim() ? attachmentUrl.trim() : null,
      p_notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      p_verify_now: Boolean(verifyNow),
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, paymentId }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to record loan payment' }, { status: 500 });
  }
}
