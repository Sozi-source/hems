'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fmt_phone, fmt_kes, parse_kes } from '@/lib/format';
import { PaymentTransaction } from '@/lib/types';
import { useBusiness } from '@/context/business-context';
import { createClient } from '@/lib/supabase/client';
import { ShieldAlert, Sparkles, Building2, Receipt, AlertCircle } from 'lucide-react';

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
  const [conflictResolutionNote, setConflictResolutionNote] = useState('');
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
      setConflictResolutionNote('');
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
      let allocationsPayload: Array<{ obligation_id: string; amount_minor: string }> = [];

      if (allocateToDebt && selectedObligationId) {
        const minor = parse_kes(allocationAmount);
        if (minor <= 0n) {
          throw new Error('Allocation amount must be greater than zero');
        }
        if (minor > BigInt(payment.amount_minor)) {
          throw new Error('Allocation cannot exceed the payment amount');
        }
        allocationsPayload = [{ obligation_id: selectedObligationId, amount_minor: minor.toString() }];
      }

      if (allocationsPayload.length === 0 && !approvalNote.trim()) {
        throw new Error('Please provide an approval note');
      }

      const { error: approveError } = await supabase.rpc('approve_payment', {
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

  const handleResolveConflicts = async () => {
    setError(null);
    if (conflictResolutionNote.trim().length < 20) {
      setError('Describe how you independently verified this payment against the M-Pesa statement (at least 20 characters).');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: resolveError } = await supabase.rpc('resolve_payment_conflicts', {
        p_payment_id: payment.id,
        p_resolution_note: conflictResolutionNote.trim(),
      });
      if (resolveError) throw new Error(resolveError.message || 'Could not record payment reconciliation');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not record payment reconciliation');
    } finally {
      setIsLoading(false);
    }
  };

  const hasConflicts = (payment.conflict_flags?.length || 0) > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Approve Payment" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Card 1: Institutional Payment Summary */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Receipt Ref
              </span>
              <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-xs">
                {payment.transaction_ref}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-slate-500 block">Amount</span>
              <span className="text-base font-bold text-slate-900">
                {fmt_kes(payment.amount_minor)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">Payer</span>
              <span className="font-semibold text-slate-900">{payment.payer_name || 'Customer'}</span>
            </div>
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">Phone / MSISDN</span>
              <span className="font-mono font-medium text-slate-700 whitespace-nowrap tabular-nums">
                {fmt_phone(payment.payer_msisdn || payment.payer_phone)}
              </span>
            </div>

            {(payment.account_reference || payment.bill_ref_number) && (
              <div className="col-span-2 pt-1 border-t border-slate-200/50 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">Account / Till Ref:</span>
                <span className="font-mono text-xs font-semibold text-slate-800">
                  {payment.account_reference || payment.bill_ref_number}
                </span>
              </div>
            )}
          </div>

          {matchedCandidateInfo && (
            <div className="pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                <span>Automated Invoice Match</span>
              </div>
              <Badge variant="neutral" dot className="bg-emerald-50 text-emerald-800 border-emerald-200/80 text-[11px]">
                {matchedCandidateInfo.confidence}% Confidence
              </Badge>
            </div>
          )}
        </div>

        {/* Card 2: Verification Hold Resolution (Uniform slate surface with clean amber badge) */}
        {hasConflicts && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200/60 text-amber-700 mt-0.5 shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Reconciliation Verification Hold
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Data conflicts detected: {payment.conflict_flags?.map(flag => (
                      <span key={flag} className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 mx-0.5 border border-slate-200/60">
                        {flag}
                      </span>
                    ))}. Independent portal or statement verification required before release.
                  </p>
                </div>
              </div>
              <Badge variant="warning" dot className="shrink-0 text-[11px]">
                Action Required
              </Badge>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Independent Statement Verification Notes
              </label>
              <textarea
                value={conflictResolutionNote}
                onChange={(e) => setConflictResolutionNote(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="sm" isLoading={isLoading} onClick={handleResolveConflicts}>
                Record Reconciliation
              </Button>
            </div>
          </div>
        )}

        {/* Card 3: Business Assignment (if not assigned) */}
        {!payment.business_id && businesses.length > 0 && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-2 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Assign to Business
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
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

        {/* Card 4: Allocation & Accounting Controls */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3.5 shadow-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allocateToDebt}
              onChange={(e) => setAllocateToDebt(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900/10"
            />
            <span className="text-xs font-semibold text-slate-800">
              Allocate to specific open invoice
            </span>
          </label>

          {allocateToDebt ? (
            <div className="space-y-3 pt-1 border-t border-slate-100">
              {openObligations.length === 0 ? (
                <div className="text-xs text-slate-600 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  No open receivables found. Payment will be credited to customer general balance.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Select Invoice / Receivable
                    </label>
                    <select
                      value={selectedObligationId}
                      onChange={(e) => setSelectedObligationId(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
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
          ) : (
            <Input
              label="Approval Note"
              type="text"
              value={approvalNote}
              onChange={(e) => setApprovalNote(e.target.value)}
              required
            />
          )}
        </div>

        {/* Modal Action Buttons */}
        {!hasConflicts && (
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
              <Receipt className="w-3.5 h-3.5 mr-1" />
              Confirm Approval
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}
