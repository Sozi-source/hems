'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone, fmt_date, fmt_kes, parse_kes } from '@/lib/format';
import { PaymentTransaction } from '@/lib/types';
import { useBusiness } from '@/context/business-context';
import { createClient } from '@/lib/supabase/client';

interface ApprovePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payment: PaymentTransaction | null;
}

interface OpenObligationOption {
  id: string;
  reference_no: string;
  counterparty_name: string;
  balance_minor: number;
  kind: string;
}

export function ApprovePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  payment,
}: ApprovePaymentModalProps) {
  const { businesses, activeBusinessId } = useBusiness();
  const [targetBusinessId, setTargetBusinessId] = useState<string>('');
  const [approvalNote, setApprovalNote] = useState('Approved to customer account');
  const [openObligations, setOpenObligations] = useState<OpenObligationOption[]>([]);
  const [selectedObligationId, setSelectedObligationId] = useState<string>('');
  const [allocationAmount, setAllocationAmount] = useState<string>('');
  const [allocateToDebt, setAllocateToDebt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedCandidateInfo, setMatchedCandidateInfo] = useState<{ confidence: number } | null>(null);

  useEffect(() => {
    if (isOpen && payment) {
      setError(null);
      setApprovalNote('Approved to customer account');
      setAllocateToDebt(false);
      setSelectedObligationId('');
      setMatchedCandidateInfo(null);
      setAllocationAmount(payment.amount_minor ? (payment.amount_minor / 100).toFixed(2) : '');

      const biz = payment.business_id || activeBusinessId || (businesses.length > 0 ? businesses[0].id : '');
      setTargetBusinessId(biz);
    }
  }, [isOpen, payment, activeBusinessId, businesses]);

  // Load open obligations for matching/allocation
  useEffect(() => {
    async function fetchOpenDebts() {
      if (!isOpen || !targetBusinessId || !payment) return;

      try {
        const supabase = createClient();
        const { data: debts } = await supabase
          .from('v_obligation_overview')
          .select('id, reference_no, counterparty_name, balance_minor, kind')
          .eq('business_id', targetBusinessId)
          .eq('direction', 'receivable')
          .gt('balance_minor', 0)
          .order('due_date', { ascending: true });

        if (debts) {
          setOpenObligations(debts as OpenObligationOption[]);
        }

        // Fetch intelligent match candidate if exists
        const { data: candidate } = await supabase
          .from('match_candidates')
          .select('obligation_id, confidence, suggested_amount_minor')
          .eq('payment_id', payment.id)
          .order('confidence', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (candidate?.obligation_id) {
          setSelectedObligationId(candidate.obligation_id);
          setAllocateToDebt(true);
          setMatchedCandidateInfo({ confidence: candidate.confidence });
          if (candidate.suggested_amount_minor) {
            setAllocationAmount((candidate.suggested_amount_minor / 100).toFixed(2));
          }
        } else if (debts && debts.length > 0 && !selectedObligationId) {
          setSelectedObligationId(debts[0].id);
        }
      } catch {
        setOpenObligations([]);
      }
    }

    fetchOpenDebts();
  }, [isOpen, targetBusinessId, payment]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetBusinessId) {
      setError('Please select which business this payment belongs to');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      let allocationsPayload: Array<{ obligation_id: string; amount_minor: number }> = [];

      if (allocateToDebt && selectedObligationId) {
        const minor = Number(parse_kes(allocationAmount));
        if (minor <= 0) {
          throw new Error('Allocation amount must be greater than zero');
        }
        if (minor > payment.amount_minor) {
          throw new Error('Allocation cannot exceed the payment amount');
        }
        allocationsPayload = [{ obligation_id: selectedObligationId, amount_minor: minor }];
      }

      if (allocationsPayload.length === 0 && !approvalNote.trim()) {
        throw new Error('Please provide an approval note');
      }

      const { data, error: approveError } = await supabase.rpc('approve_payment', {
        p_payment_id: payment.id,
        p_allocations: allocationsPayload,
        p_business: targetBusinessId,
        p_note: approvalNote.trim() || null,
      });

      if (approveError) {
        throw new Error(approveError.message || 'Failed to approve payment');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to approve payment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Approve Payment" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Payment Summary */}
        <div className="p-3.5 rounded-fintech bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-slate-900">
              {payment.transaction_ref}
            </span>
            <MoneyDisplay minorUnits={payment.amount_minor} size="sm" variant="amber" />
          </div>

          <div className="text-xs text-slate-700 flex items-center justify-between font-medium">
            <span>{payment.payer_name || 'Customer'}</span>
            <span className="font-mono text-slate-600">{fmt_phone(payment.payer_msisdn || payment.payer_phone)}</span>
          </div>

          {(payment.account_reference || payment.bill_ref_number) && (
            <div className="text-[11px] text-slate-700 font-mono font-medium">
              Account Ref: {payment.account_reference || payment.bill_ref_number}
            </div>
          )}

          {matchedCandidateInfo && (
            <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
              <span>Intelligent Match Found</span>
              <span className="font-mono text-[10px] bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded">
                {matchedCandidateInfo.confidence}% Confidence
              </span>
            </div>
          )}
        </div>

        {/* Business Assignment if not assigned */}
        {!payment.business_id && businesses.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Assign to Business
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-colors"
              required
            >
              {businesses.map((b) => (
                <option key={b.id || b.code} value={b.id} className="bg-white text-slate-900">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Allocation Toggle */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allocateToDebt}
              onChange={(e) => setAllocateToDebt(e.target.checked)}
              className="rounded bg-white border-slate-300 text-slate-900 focus:ring-slate-900/20"
            />
            <span className="text-xs font-semibold text-slate-800">
              Allocate to specific open invoice
            </span>
          </label>

          {allocateToDebt && (
            <div className="space-y-3 pl-6 pt-1">
              {openObligations.length === 0 ? (
                <div className="text-xs text-amber-800 p-2 rounded bg-amber-50 border border-amber-200 font-medium">
                  No open receivables found. Payment will be credited to customer account balance.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Select Invoice / Debt
                    </label>
                    <select
                      value={selectedObligationId}
                      onChange={(e) => setSelectedObligationId(e.target.value)}
                      className="flex h-9 w-full rounded-fintech border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                      {openObligations.map((o) => (
                        <option key={o.id} value={o.id} className="bg-white text-slate-900">
                          {o.reference_no} — {o.counterparty_name} ({fmt_kes(o.balance_minor)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Amount to Settle (KSh)"
                    type="text"
                    value={allocationAmount}
                    onChange={(e) => setAllocationAmount(e.target.value)}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Note (required if no allocation) */}
        {!allocateToDebt && (
          <Input
            label="Approval Note"
            type="text"
            value={approvalNote}
            onChange={(e) => setApprovalNote(e.target.value)}
            placeholder="e.g. Cleared to general account"
            required
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="success" size="sm" isLoading={isLoading}>
            Confirm Approval
          </Button>
        </div>
      </form>
    </Modal>
  );
}
