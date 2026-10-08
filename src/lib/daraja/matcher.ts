import { createAdminClient } from '@/lib/supabase/admin';

export interface MatchResult {
  paymentId: string;
  matchedCustomerId?: string;
  matchedObligationId?: string;
  confidence: number;
  ruleName: string;
}

export async function matchPayment(paymentId: string): Promise<MatchResult | null> {
  const supabase = createAdminClient();

  // Fetch the payment transaction
  const { data: payment, error: pError } = await supabase
    .from('payment_transactions')
    .select('id, business_id, payer_msisdn, payer_name, account_reference, amount_minor, status')
    .eq('id', paymentId)
    .single();

  if (pError || !payment || payment.status !== 'pending') {
    return null;
  }

  const businessId = payment.business_id;
  const billRef = (payment.account_reference || '').trim();
  const msisdn = (payment.payer_msisdn || '').trim();

  let resolvedBusinessId = businessId;
  let matchedCustomerId: string | undefined;
  let matchedObligationId: string | undefined;
  let confidence = 0;
  let ruleName = 'unmatched';
  const factors: Record<string, any> = {};

  // 1. Direct Invoice Reference match (e.g. billRef is 'CD0001')
  if (billRef && resolvedBusinessId) {
    const { data: obligation } = await supabase
      .from('obligations')
      .select('id, customer_id, reference_no, balance_minor')
      .eq('business_id', resolvedBusinessId)
      .ilike('reference_no', billRef)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (obligation) {
      matchedObligationId = obligation.id;
      matchedCustomerId = obligation.customer_id;
      confidence = 100;
      ruleName = 'exact_invoice_reference';
      factors.reference_no = obligation.reference_no;
    }
  }

  // 2. Exact Customer Number match (e.g. billRef is 'C0001')
  if (!matchedCustomerId && billRef) {
    let query = supabase
      .from('customers')
      .select('id, business_id, customer_no')
      .ilike('customer_no', billRef);

    if (resolvedBusinessId) {
      query = query.eq('business_id', resolvedBusinessId);
    }

    const { data: customer } = await query.limit(1).maybeSingle();

    if (customer) {
      matchedCustomerId = customer.id;
      resolvedBusinessId = customer.business_id;
      confidence = 100;
      ruleName = 'exact_customer_number';
      factors.customer_no = customer.customer_no;
    }
  }

  // 3. Customer Phone Number match (e.g. payer_msisdn or billRef is customer's phone)
  if (!matchedCustomerId && msisdn) {
    let query = supabase
      .from('customers')
      .select('id, business_id, customer_no, phone')
      .eq('phone', msisdn);

    if (resolvedBusinessId) {
      query = query.eq('business_id', resolvedBusinessId);
    }

    const { data: customerByPhone } = await query.limit(1).maybeSingle();

    if (customerByPhone) {
      matchedCustomerId = customerByPhone.id;
      resolvedBusinessId = customerByPhone.business_id;
      confidence = 90;
      ruleName = 'payer_phone_match';
      factors.phone = customerByPhone.phone;
    }
  }

  // If we matched a customer but not a specific obligation, find their oldest open debt
  if (matchedCustomerId && !matchedObligationId && resolvedBusinessId) {
    const { data: openDebt } = await supabase
      .from('obligations')
      .select('id, balance_minor')
      .eq('business_id', resolvedBusinessId)
      .eq('customer_id', matchedCustomerId)
      .eq('direction', 'receivable')
      .gt('balance_minor', 0)
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (openDebt) {
      matchedObligationId = openDebt.id;
      factors.oldest_open_debt = openDebt.id;
    }
  }

  // Record candidate and update transaction confidence
  if (confidence > 0 && resolvedBusinessId) {
    // Ensure payment transaction has business_id and suggested_kind set
    await supabase
      .from('payment_transactions')
      .update({
        business_id: resolvedBusinessId,
        suggested_kind: 'customer_debt',
        match_confidence: confidence,
      })
      .eq('id', payment.id);

    // Insert match candidate record
    await supabase.from('match_candidates').insert({
      business_id: resolvedBusinessId,
      payment_id: payment.id,
      target_kind: 'customer_debt',
      customer_id: matchedCustomerId || null,
      obligation_id: matchedObligationId || null,
      confidence: confidence,
      score_breakdown: { rule_name: ruleName, ...factors },
      suggested_amount_minor: payment.amount_minor,
      rank: 1,
      engine_version: 'v1.0-daraja',
    });
  }

  return {
    paymentId: payment.id,
    matchedCustomerId,
    matchedObligationId,
    confidence,
    ruleName,
  };
}
