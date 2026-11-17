import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { ParsedLoanRepaymentSms } from './repayment-sms-parser';

export interface LoanMatchResult {
  matched: boolean;
  reason?: string;
  loanId?: string;
  paymentId?: string;
  lenderName?: string;
  businessId?: string;
}

/**
 * Matches an outgoing repayment SMS against active business loans and records+verifies
 * the payment automatically when there is an unambiguous high-confidence match.
 */
export async function matchAndRecordLoanRepayment(
  admin: ReturnType<typeof createAdminClient>,
  parsed: ParsedLoanRepaymentSms,
  sender?: string
): Promise<LoanMatchResult> {
  // 1. Idempotency: never double-record the same transactionRef
  const { data: existingPay } = await admin
    .from('loan_payments')
    .select('id, obligation_id')
    .eq('reference_no', parsed.transactionRef)
    .is('reversed_at', null)
    .maybeSingle();

  if (existingPay) {
    return {
      matched: true,
      loanId: existingPay.obligation_id,
      paymentId: existingPay.id,
      reason: 'already_recorded',
    };
  }

  // 2. Load all active, non-archived loans
  const { data: loans, error } = await admin
    .from('loan_terms')
    .select('obligation_id, business_id, lender_name, monthly_instalment_minor, installment_minor, payment_details')
    .eq('loan_status', 'active')
    .is('archived_at', null);

  if (error || !loans || loans.length === 0) {
    return { matched: false, reason: 'no_active_loans' };
  }

  const rawUpper = parsed.rawText.toUpperCase();
  const payeeUpper = (parsed.payeeOrLender || '').toUpperCase();
  const senderUpper = (sender || '').toUpperCase();

  const scored = loans.map((loan: any) => {
    let score = 0;
    const pd = loan.payment_details || {};

    // Account / Paybill / Till / Bank Account / Reference match (strongest signal)
    const accTokens = [
      pd.account_number,
      pd.bank_account,
      pd.reference,
      pd.paybill,
      pd.till,
    ]
      .map((v: any) => String(v || '').trim().toUpperCase())
      .filter((v: string) => v.length >= 3);

    for (const tok of accTokens) {
      if (
        rawUpper.includes(tok) ||
        (parsed.accountReference && parsed.accountReference.toUpperCase() === tok) ||
        (parsed.paybillOrTill && parsed.paybillOrTill.toUpperCase() === tok)
      ) {
        score += 60;
      }
    }

    // Lender name token match
    const lenderTokens = String(loan.lender_name || '')
      .toUpperCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['BANK', 'LTD', 'LIMITED', 'LOAN'].includes(w));

    for (const lt of lenderTokens) {
      if (payeeUpper.includes(lt) || rawUpper.includes(lt) || senderUpper.includes(lt)) {
        score += 30;
        break;
      }
    }

    // Instalment amount match (exact or within 1%)
    const expectedMinor = Number(loan.monthly_instalment_minor || loan.installment_minor || 0);
    if (expectedMinor > 0) {
      const diff = Math.abs(parsed.amountMinor - expectedMinor);
      if (diff === 0) score += 25;
      else if (diff / expectedMinor <= 0.01) score += 15;
    }

    return { loan, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const runnerUp = scored[1];

  // Require high confidence (>= 60, meaning account/paybill match OR lender+amount match)
  // and clear separation from runner-up so we never guess between two loans.
  const isUnambiguous =
    top &&
    top.score >= 55 &&
    (!runnerUp || top.score - runnerUp.score >= 20);

  const sha = crypto
    .createHash('sha256')
    .update(`loan_sms|${parsed.transactionRef}|${parsed.rawText}`)
    .digest('hex');

  if (!isUnambiguous) {
    await admin.from('payment_ingest_log').upsert(
      {
        source: 'sms_forwarder',
        content_sha256: sha,
        raw: parsed.rawText,
        outcome: 'unmatched_loan_repayment',
        error: `Could not unambiguously match loan repayment (top score: ${top?.score ?? 0})`,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'content_sha256' }
    );
    return { matched: false, reason: 'ambiguous_or_no_match' };
  }

  // 3. Record and verify automatically via SQL RPC
  const { data: paymentId, error: rpcErr } = await admin.rpc('record_loan_payment', {
    p_obligation_id: top.loan.obligation_id,
    p_payment_date: parsed.paymentDate,
    p_amount_minor: parsed.amountMinor,
    p_method: parsed.method,
    p_reference_no: parsed.transactionRef,
    p_attachment_url: null,
    p_notes: `Auto-recorded from SMS Forwarder (${sender || 'device'})`,
    p_verify_now: true,
  });

  if (rpcErr) {
    await admin.from('payment_ingest_log').upsert(
      {
        source: 'sms_forwarder',
        content_sha256: sha,
        raw: parsed.rawText,
        outcome: 'loan_repayment_error',
        error: rpcErr.message,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'content_sha256' }
    );
    return { matched: false, reason: rpcErr.message };
  }

  await admin.from('payment_ingest_log').upsert(
    {
      source: 'sms_forwarder',
      content_sha256: sha,
      raw: parsed.rawText,
      outcome: 'matched_loan_repayment',
      error: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'content_sha256' }
  );

  return {
    matched: true,
    loanId: top.loan.obligation_id,
    paymentId,
    lenderName: top.loan.lender_name,
    businessId: top.loan.business_id,
  };
}
