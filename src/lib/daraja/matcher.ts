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

  // Account numbers and phone numbers are not globally unique across tenants.
  // Never let an unassigned callback guess which business owns a payment.
  if (!businessId) {
    return {
      paymentId: payment.id,
      confidence: 0,
      ruleName: 'unassigned_business_requires_review',
    };
  }

  // 1. Direct Invoice Reference match (e.g. billRef is 'CD0001')
  if (billRef && resolvedBusinessId) {
    const { data: obligation } = await supabase
      .from('obligations')
      .select('id, customer_id, reference_no, balance_minor')
      .eq('business_id', resolvedBusinessId)
      .eq('reference_no', billRef)
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
      .eq('customer_no', billRef);

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

  // 3. Customer Phone Number match (exact unmasked or Safaricom masked like 0700***522)
  if (!matchedCustomerId && msisdn) {
    if (!msisdn.includes('*')) {
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
    } else if (resolvedBusinessId) {
      // Masked phone e.g. "0700***522" -> prefix "+254700" and suffix "522"
      const maskMatch = msisdn.match(/^(?:0|\+?254)?([17]\d{2})\*+(\d{3})$/);
      if (maskMatch) {
        const prefix = `+254${maskMatch[1]}`;
        const suffix = maskMatch[2];
        const { data: candidates } = await supabase
          .from('customers')
          .select('id, business_id, full_name, nickname, phone')
          .eq('business_id', resolvedBusinessId)
          .like('phone', `${prefix}%${suffix}`);

        if (candidates && candidates.length === 1) {
          matchedCustomerId = candidates[0].id;
          confidence = 88;
          ruleName = 'masked_phone_match';
          factors.masked_phone = msisdn;
        } else if (candidates && candidates.length > 1 && payment.payer_name) {
          const payerLower = payment.payer_name.trim().toLowerCase();
          const nameMatched = candidates.find(
            (c) =>
              c.full_name?.toLowerCase() === payerLower ||
              c.nickname?.toLowerCase() === payerLower ||
              payerLower.includes(c.full_name?.toLowerCase() || '___')
          );
          if (nameMatched) {
            matchedCustomerId = nameMatched.id;
            confidence = 90;
            ruleName = 'masked_phone_and_name_match';
            factors.masked_phone = msisdn;
          }
        }
      }
    }
  }

  // 4. Full Name / Nickname / Alias match on payer_name or account_reference
  if (!matchedCustomerId && resolvedBusinessId) {
    const termsToTry = [
      (payment.payer_name || '').trim(),
      billRef && !/^(650166|XX6709|\d{5,7})$/i.test(billRef) ? billRef : '',
    ].filter((t) => t.length >= 3);

    for (const candidateTerm of termsToTry) {
      try {
        const { data: customerByName } = await supabase
          .from('customers')
          .select('id, business_id, full_name, nickname')
          .eq('business_id', resolvedBusinessId)
          .or(`full_name.ilike.${candidateTerm},nickname.ilike.${candidateTerm}`)
          .limit(1)
          .maybeSingle();

        if (customerByName) {
          matchedCustomerId = customerByName.id;
          resolvedBusinessId = customerByName.business_id;
          confidence = 85;
          ruleName = 'customer_name_or_nickname_match';
          factors.matched_name = customerByName.full_name || customerByName.nickname;
          break;
        }
      } catch {
        // Ignore if query fails
      }
    }

    // 4B. Partial multi-word Kenyan name match (e.g. SMS has "NORAH CHELANGAT TANGUS"
    // while HEMS customer is registered as "Norah Tangus" or "Norah Chelangat")
    if (!matchedCustomerId && payment.payer_name) {
      const smsTokens = payment.payer_name
        .toLowerCase()
        .split(/[^a-z0-9']+/)
        .filter((w: string) => w.length >= 3);

      if (smsTokens.length >= 2) {
        const { data: allCustomers } = await supabase
          .from('customers')
          .select('id, business_id, full_name, nickname')
          .eq('business_id', resolvedBusinessId);

        if (allCustomers && allCustomers.length > 0) {
          const matches = allCustomers.filter((c) => {
            const custTokens = `${c.full_name || ''} ${c.nickname || ''}`
              .toLowerCase()
              .split(/[^a-z0-9']+/)
              .filter((w: string) => w.length >= 3);
            if (custTokens.length < 2) return false;
            const shared = smsTokens.filter((t: string) => custTokens.includes(t));
            // Match if at least 2 distinct name words match (e.g. first + last, or first + middle)
            return shared.length >= 2;
          });

          if (matches.length === 1) {
            matchedCustomerId = matches[0].id;
            confidence = 82;
            ruleName = 'partial_full_name_match';
            factors.matched_name = matches[0].full_name;
          }
        }
      }
    }
  }

  // If we matched a customer but not a specific obligation, find their oldest open debt
  let matchedObligationBalanceMinor: number | undefined;
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
      matchedObligationBalanceMinor = Number(openDebt.balance_minor);
      factors.oldest_open_debt = openDebt.id;
    }
  }

  // Record candidate and update transaction confidence
  if (confidence > 0 && resolvedBusinessId) {
    // Ensure payment transaction has business_id and suggested_kind set
    const { error: paymentUpdateError } = await supabase
      .from('payment_transactions')
      .update({
        business_id: resolvedBusinessId,
        suggested_kind: 'customer_debt',
        match_confidence: confidence,
      })
      .eq('id', payment.id);
    if (paymentUpdateError) throw new Error(`Could not save payment match result: ${paymentUpdateError.message}`);

    const suggestedAmountMinor =
      matchedObligationBalanceMinor && matchedObligationBalanceMinor > 0
        ? Math.min(payment.amount_minor, matchedObligationBalanceMinor)
        : payment.amount_minor;

    const { error: candidateError } = await supabase.from('match_candidates').upsert({
      business_id: resolvedBusinessId,
      payment_id: payment.id,
      target_kind: 'customer_debt',
      customer_id: matchedCustomerId || null,
      obligation_id: matchedObligationId || null,
      confidence: confidence,
      score_breakdown: { rule_name: ruleName, ...factors },
      suggested_amount_minor: suggestedAmountMinor,
      rank: 1,
      engine_version: 'v1.0-daraja',
    }, { onConflict: 'payment_id,engine_version,rank' });
    if (candidateError) throw new Error(`Could not save payment match candidate: ${candidateError.message}`);
  }

  return {
    paymentId: payment.id,
    matchedCustomerId,
    matchedObligationId,
    confidence,
    ruleName,
  };
}
