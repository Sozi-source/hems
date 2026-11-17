import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  generateAmortizationSchedule,
  InterestMethod,
  LoanType,
} from '@/lib/loans/amortization';

const VALID_LOAN_TYPES: LoanType[] = ['bank_loan', 'asset_financing', 'mobile_loan', 'other'];
const VALID_METHODS: InterestMethod[] = ['reducing_balance', 'flat'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const statusFilter = searchParams.get('status');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to view loans.' }, { status: 401 });
    }

    let query = supabase
      .from('loan_terms')
      .select(`
        obligation_id,
        business_id,
        lender_name,
        loan_type,
        interest_method,
        principal_minor,
        interest_rate_pct,
        interest_minor,
        total_payable_minor,
        installment_minor,
        monthly_instalment_minor,
        instalment_overridden,
        date_taken,
        term_months,
        repayment_day,
        first_due_date,
        maturity_date,
        payment_details,
        loan_status,
        archived_at,
        notes,
        created_at,
        updated_at,
        businesses!inner ( id, code, name ),
        obligations!inner ( id, reference_no, balance_minor, status, issue_date, due_date )
      `)
      .order('created_at', { ascending: false });

    if (businessId && businessId !== 'all' && businessId !== 'MASTER') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);
      if (isUuid) {
        query = query.eq('business_id', businessId);
      } else {
        const { data: biz } = await supabase.from('businesses').select('id').eq('code', businessId).maybeSingle();
        if (biz?.id) {
          query = query.eq('business_id', biz.id);
        }
      }
    }

    if (!includeArchived) {
      query = query.is('archived_at', null);
    }

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('loan_status', statusFilter);
    }

    const { data: loans, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const loanIds = (loans || []).map((l: any) => l.obligation_id);
    let instalmentsByLoan: Record<string, any[]> = {};

    if (loanIds.length > 0) {
      const { data: instalments } = await supabase
        .from('loan_instalments')
        .select('*')
        .in('obligation_id', loanIds)
        .order('instalment_no', { ascending: true });

      for (const inst of instalments || []) {
        if (!instalmentsByLoan[inst.obligation_id]) {
          instalmentsByLoan[inst.obligation_id] = [];
        }
        instalmentsByLoan[inst.obligation_id].push(inst);
      }
    }

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const enriched = (loans || []).map((l: any) => {
      const schedule = instalmentsByLoan[l.obligation_id] || [];
      const totalPrincipalRepaid = schedule.reduce((s, r) => s + Number(r.paid_principal_minor || 0), 0);
      const totalInterestPaid = schedule.reduce((s, r) => s + Number(r.paid_interest_minor || 0), 0);
      const outstandingPrincipal = Math.max(0, Number(l.principal_minor || 0) - totalPrincipalRepaid);
      const totalScheduledInterest = schedule.reduce((s, r) => s + Number(r.interest_minor || 0), 0);
      const outstandingInterest = Math.max(0, totalScheduledInterest - totalInterestPaid);

      const unpaidInstalments = schedule.filter((r) => !r.verified_at);
      const nextInstalment = unpaidInstalments[0] || null;
      const overdueInstalments = unpaidInstalments.filter((r) => r.due_date < todayStr);

      return {
        ...l,
        business_name: l.businesses?.name || '',
        business_code: l.businesses?.code || '',
        reference_no: l.obligations?.reference_no || '',
        outstanding_principal_minor: outstandingPrincipal,
        outstanding_interest_minor: outstandingInterest,
        outstanding_balance_minor: outstandingPrincipal,
        total_principal_repaid_minor: totalPrincipalRepaid,
        total_interest_paid_minor: totalInterestPaid,
        next_instalment: nextInstalment,
        overdue_count: overdueInstalments.length,
        instalments_count: schedule.length,
      };
    });

    return NextResponse.json({ success: true, loans: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load loans' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      businessId,
      loanType = 'bank_loan',
      lenderName,
      principalAmount, // major units (KES) OR principalMinor
      principalMinor: rawPrincipalMinor,
      dateTaken,
      interestRatePct,
      interestMethod = 'reducing_balance',
      termMonths,
      repaymentDay,
      monthlyInstalmentOverride, // major units (KES) optional
      paymentDetails,
      notes,
    } = body;

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'Select a business for this loan.' }, { status: 400 });
    }
    if (!VALID_LOAN_TYPES.includes(loanType)) {
      return NextResponse.json({ error: 'Invalid loan type.' }, { status: 400 });
    }
    if (!VALID_METHODS.includes(interestMethod)) {
      return NextResponse.json({ error: 'Invalid interest calculation method.' }, { status: 400 });
    }
    const cleanLender = typeof lenderName === 'string' ? lenderName.trim() : '';
    if (cleanLender.length < 2 || cleanLender.length > 120) {
      return NextResponse.json({ error: 'Enter a bank or lender name (2–120 characters).' }, { status: 400 });
    }

    const principalMinor = rawPrincipalMinor
      ? Math.round(Number(rawPrincipalMinor))
      : Math.round(Number(principalAmount) * 100);

    if (!Number.isFinite(principalMinor) || principalMinor <= 0) {
      return NextResponse.json({ error: 'Original loan amount must be greater than zero.' }, { status: 400 });
    }

    const ratePct = Number(interestRatePct);
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 500) {
      return NextResponse.json({ error: 'Enter a valid annual interest rate (0% to 500%).' }, { status: 400 });
    }

    const months = Number(termMonths);
    if (!Number.isInteger(months) || months <= 0 || months > 600) {
      return NextResponse.json({ error: 'Repayment period must be between 1 and 600 months.' }, { status: 400 });
    }

    const day = Number(repaymentDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return NextResponse.json({ error: 'Repayment due day must be between 1 and 31.' }, { status: 400 });
    }

    if (typeof dateTaken !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateTaken)) {
      return NextResponse.json({ error: 'Enter a valid date taken (YYYY-MM-DD).' }, { status: 400 });
    }

    const overrideMinor =
      monthlyInstalmentOverride !== undefined &&
      monthlyInstalmentOverride !== null &&
      String(monthlyInstalmentOverride).trim() !== ''
        ? Math.round(Number(monthlyInstalmentOverride) * 100)
        : null;

    if (overrideMinor !== null && (!Number.isFinite(overrideMinor) || overrideMinor <= 0)) {
      return NextResponse.json({ error: 'Monthly instalment override must be greater than zero.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to create a loan.' }, { status: 401 });
    }

    const schedule = generateAmortizationSchedule({
      principalMinor,
      annualRatePct: ratePct,
      termMonths: months,
      dateTaken,
      repaymentDay: day,
      method: interestMethod,
      overrideInstalmentMinor: overrideMinor,
    });

    const { data: loanId, error: rpcError } = await supabase.rpc('create_loan', {
      p_business_id: businessId,
      p_loan_type: loanType,
      p_lender_name: cleanLender,
      p_principal_minor: principalMinor,
      p_date_taken: dateTaken,
      p_interest_rate_pct: ratePct,
      p_interest_method: interestMethod,
      p_term_months: months,
      p_monthly_instalment_minor: schedule.monthly_instalment_minor,
      p_instalment_overridden: overrideMinor !== null,
      p_repayment_day: day,
      p_first_due_date: schedule.first_due_date,
      p_maturity_date: schedule.maturity_date,
      p_total_interest_minor: schedule.total_interest_minor,
      p_payment_details: paymentDetails || {},
      p_notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      p_instalments: schedule.rows,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, loanId, schedule }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create loan' }, { status: 500 });
  }
}
