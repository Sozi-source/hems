import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  computeDueDateForOffset,
  generateAmortizationSchedule,
  InterestMethod,
  LoanStatus,
  LoanType,
} from '@/lib/loans/amortization';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to view loan details.' }, { status: 401 });
    }

    const { data: loan, error } = await supabase
      .from('loan_terms')
      .select(`
        *,
        businesses!inner ( id, code, name ),
        obligations!inner ( id, reference_no, balance_minor, status, issue_date, due_date )
      `)
      .eq('obligation_id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!loan) return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });

    const { data: instalments, error: instErr } = await supabase
      .from('loan_instalments')
      .select('*')
      .eq('obligation_id', id)
      .order('instalment_no', { ascending: true });

    if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      loan,
      instalments: instalments || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load loan details' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to update this loan.' }, { status: 401 });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('loan_terms')
      .select('*')
      .eq('obligation_id', id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });

    // Quick status or archive actions
    if (body.action === 'archive') {
      const { error } = await supabase
        .from('loan_terms')
        .update({ archived_at: new Date().toISOString() })
        .eq('obligation_id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'unarchive') {
      const { error } = await supabase
        .from('loan_terms')
        .update({ archived_at: null })
        .eq('obligation_id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'set_status') {
      const nextStatus = body.loanStatus as LoanStatus;
      if (!['active', 'fully_paid', 'defaulted'].includes(nextStatus)) {
        return NextResponse.json({ error: 'Invalid loan status.' }, { status: 400 });
      }
      const { error } = await supabase
        .from('loan_terms')
        .update({ loan_status: nextStatus })
        .eq('obligation_id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // Full term edit: recalculate ONLY future/unpaid instalments, preserving paid instalments
    const lenderName = typeof body.lenderName === 'string' && body.lenderName.trim()
      ? body.lenderName.trim()
      : existing.lender_name;
    const loanType = (body.loanType || existing.loan_type) as LoanType;
    const interestRatePct = body.interestRatePct !== undefined
      ? Number(body.interestRatePct)
      : Number(existing.interest_rate_pct);
    const termMonths = body.termMonths !== undefined
      ? Number(body.termMonths)
      : Number(existing.term_months);
    const repaymentDay = body.repaymentDay !== undefined
      ? Number(body.repaymentDay)
      : Number(existing.repayment_day);
    const loanStatus = (body.loanStatus || existing.loan_status) as LoanStatus;
    const paymentDetails = body.paymentDetails !== undefined ? body.paymentDetails : existing.payment_details;
    const notes = body.notes !== undefined ? body.notes : existing.notes;

    if (!Number.isFinite(interestRatePct) || interestRatePct < 0) {
      return NextResponse.json({ error: 'Interest rate cannot be negative.' }, { status: 400 });
    }
    if (!Number.isInteger(termMonths) || termMonths <= 0) {
      return NextResponse.json({ error: 'Repayment period must be a positive whole number.' }, { status: 400 });
    }
    if (!Number.isInteger(repaymentDay) || repaymentDay < 1 || repaymentDay > 31) {
      return NextResponse.json({ error: 'Repayment day must be between 1 and 31.' }, { status: 400 });
    }

    const overrideMinor =
      body.monthlyInstalmentOverride !== undefined &&
      body.monthlyInstalmentOverride !== null &&
      String(body.monthlyInstalmentOverride).trim() !== ''
        ? Math.round(Number(body.monthlyInstalmentOverride) * 100)
        : null;

    const { data: allInstalments } = await supabase
      .from('loan_instalments')
      .select('*')
      .eq('obligation_id', id)
      .order('instalment_no', { ascending: true });

    const paidOrPartial = (allInstalments || []).filter(
      (r: any) => Number(r.paid_interest_minor) > 0 || Number(r.paid_principal_minor) > 0 || r.verified_at !== null
    );

    const paidPrincipal = paidOrPartial.reduce((s: number, r: any) => s + Number(r.paid_principal_minor || 0), 0);
    const paidInterest = paidOrPartial.reduce((s: number, r: any) => s + Number(r.paid_interest_minor || 0), 0);
    const remainingPrincipal = Math.max(0, Number(existing.principal_minor) - paidPrincipal);
    const remainingMonths = Math.max(1, termMonths - paidOrPartial.length);
    const startNo = paidOrPartial.length + 1;

    const lastPaidDue = paidOrPartial.length > 0
      ? paidOrPartial[paidOrPartial.length - 1].due_date
      : null;
    const nextFirstDue = lastPaidDue
      ? computeDueDateForOffset(lastPaidDue, 1, repaymentDay)
      : existing.first_due_date;

    const futureSchedule = remainingPrincipal > 0
      ? generateAmortizationSchedule({
          principalMinor: remainingPrincipal,
          annualRatePct: interestRatePct,
          termMonths: remainingMonths,
          dateTaken: existing.date_taken || existing.first_due_date,
          repaymentDay,
          firstDueDate: nextFirstDue,
          method: (existing.interest_method || 'reducing_balance') as InterestMethod,
          overrideInstalmentMinor: overrideMinor,
          startInstalmentNo: startNo,
        })
      : {
          rows: [],
          monthly_instalment_minor: Number(existing.monthly_instalment_minor || existing.installment_minor),
          total_interest_minor: 0,
          total_payable_minor: 0,
          first_due_date: existing.first_due_date,
          maturity_date: lastPaidDue || existing.maturity_date,
        };

    const { error: rpcError } = await supabase.rpc('update_loan_terms', {
      p_obligation_id: id,
      p_lender_name: lenderName,
      p_loan_type: loanType,
      p_interest_rate_pct: interestRatePct,
      p_term_months: termMonths,
      p_monthly_instalment_minor: futureSchedule.monthly_instalment_minor,
      p_instalment_overridden: overrideMinor !== null,
      p_repayment_day: repaymentDay,
      p_maturity_date: futureSchedule.maturity_date,
      p_total_interest_minor: paidInterest + futureSchedule.total_interest_minor,
      p_payment_details: paymentDetails || {},
      p_loan_status: loanStatus,
      p_notes: notes,
      p_future_instalments: futureSchedule.rows,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update loan' }, { status: 500 });
  }
}
