'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import {
  Calendar,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  X,
  Smartphone,
  User,
  Clock,
} from 'lucide-react';
import { ObligationDirection } from '@/lib/types';

export interface ObligationModalItem {
  id: string;
  business_id: string;
  customer_id?: string;
  kind: string;
  direction: ObligationDirection;
  reference_no: string;
  counterparty_name: string;
  original_minor: number;
  balance_minor: number;
  paid_minor: number;
  status: string;
  due_date: string | null;
  issue_date: string | null;
  is_overdue?: boolean;
}

interface ObligationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  obligation: ObligationModalItem | null;
}

interface JournalEntry {
  id: string;
  entryType: string;
  signedMinor: number;
  entryDate: string;
  memo?: string | null;
  transactionRef?: string | null;
  provider?: string | null;
}

export function ObligationHistoryModal({
  isOpen,
  onClose,
  obligation,
}: ObligationHistoryModalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !obligation) {
      setEntries([]);
      return;
    }

    async function loadEntries() {
      if (!obligation) return;
      setLoading(true);
      try {
        const supabase = createClient();

        // 1. Fetch obligation journal entries
        const { data: rawEntries } = await supabase
          .from('obligation_entries')
          .select('id, entry_type, signed_minor, entry_date, memo, payment_allocation_id, created_at')
          .eq('obligation_id', obligation.id)
          .order('created_at', { ascending: false });

        // 2. Fetch payment transaction info for entries with allocations
        const allocationIds = (rawEntries || [])
          .map((r: any) => r.payment_allocation_id)
          .filter(Boolean);

        const txMap = new Map<string, { ref: string; provider: string }>();

        if (allocationIds.length > 0) {
          const { data: allocs } = await supabase
            .from('payment_allocations')
            .select('id, payment_id')
            .in('id', allocationIds);

          const paymentIds = (allocs || []).map((a: any) => a.payment_id).filter(Boolean);
          if (paymentIds.length > 0) {
            const { data: payments } = await supabase
              .from('payment_transactions')
              .select('id, transaction_ref, provider')
              .in('id', paymentIds);

            const pMap = new Map((payments || []).map((p: any) => [p.id, p]));
            for (const a of allocs || []) {
              const p = pMap.get(a.payment_id);
              if (p) txMap.set(a.id, { ref: p.transaction_ref, provider: p.provider });
            }
          }
        }

        const journal: JournalEntry[] = (rawEntries || []).map((r: any) => {
          const tx = r.payment_allocation_id ? txMap.get(r.payment_allocation_id) : undefined;
          return {
            id: r.id,
            entryType: r.entry_type,
            signedMinor: Number(r.signed_minor || 0),
            entryDate: r.entry_date || r.created_at,
            memo: r.memo,
            transactionRef: tx?.ref,
            provider: tx?.provider,
          };
        });

        // If no journal entries exist yet, synthesize the opening charge
        if (journal.length === 0 && obligation.original_minor > 0) {
          journal.push({
            id: `orig-${obligation.id}`,
            entryType: 'charge',
            signedMinor: obligation.original_minor,
            entryDate: obligation.issue_date || new Date().toISOString(),
            memo: `Initial ${obligation.kind.replace('_', ' ')} issued`,
          });
        }

        setEntries(journal);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    }

    loadEntries();
  }, [isOpen, obligation]);

  if (!obligation) return null;

  const isReceivable = obligation.direction === 'receivable';
  const hasDebt = obligation.balance_minor > 0;
  const isSettled = obligation.balance_minor === 0 || obligation.status === 'paid';

  function copyRef(ref: string) {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1800);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      hideHeader
      className="p-4 sm:p-6 sm:max-w-3xl"
    >
      <div className="space-y-4 sm:space-y-5">
        {/* Clean, Non-Crowded Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-200/80">
              <Receipt className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {obligation.counterparty_name}
                </h2>
                <button
                  type="button"
                  onClick={() => copyRef(obligation.reference_no)}
                  className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1 transition-colors"
                  title="Click to copy invoice ref"
                >
                  <span>{obligation.reference_no}</span>
                  {copiedRef === obligation.reference_no ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-500 flex-wrap">
                <span className="capitalize">{obligation.kind.replace('_', ' ')}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Issued {fmt_date(obligation.issue_date)}
                </span>
                {obligation.due_date && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Due {fmt_date(obligation.due_date)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Row & Close */}
          <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-1"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimal 3-Card Financial Progress Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
            <span className="text-[11px] font-medium text-slate-500 block">
              Original Amount
            </span>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={obligation.original_minor} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Invoice Total
            </span>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40">
            <span className="text-[11px] font-medium text-slate-500 block">
              Amount Repaid
            </span>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={obligation.paid_minor} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-emerald-700 font-medium mt-0.5 block">
              {obligation.original_minor > 0
                ? `${Math.round((obligation.paid_minor / obligation.original_minor) * 100)}% Settled`
                : '100% Settled'}
            </span>
          </div>

          <div
            className={`p-3 sm:p-3.5 rounded-xl border transition-colors ${
              hasDebt
                ? 'border-amber-200/90 bg-amber-50/30'
                : 'border-slate-200/80 bg-slate-50/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 block">
                Remaining Balance
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isSettled
                    ? 'bg-emerald-100 text-emerald-800'
                    : obligation.is_overdue
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isSettled ? 'Settled' : obligation.is_overdue ? 'Overdue' : 'Active'}
              </span>
            </div>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={obligation.balance_minor} size="md" variant="neutral" />
            </div>
            <span
              className={`text-[11px] font-medium mt-0.5 block ${
                hasDebt ? 'text-amber-700' : 'text-slate-400'
              }`}
            >
              {hasDebt ? 'Pending Payment' : 'Fully Paid'}
            </span>
          </div>
        </div>

        {/* Ledger Entries / Timeline Header */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-semibold text-slate-800">
            Repayment & Journal History ({entries.length})
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Audit Trail
          </span>
        </div>

        {/* Entries List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
            Loading repayment history...
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
            <Receipt className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">No journal entries found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {entries.map((entry) => {
              const isPayment = entry.signedMinor < 0 || entry.entryType === 'payment';
              const absMinor = Math.abs(entry.signedMinor);

              return (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isPayment
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}
                      >
                        {isPayment ? (
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs capitalize">
                            {entry.entryType.replace('_', ' ')}
                          </span>

                          {entry.transactionRef && (
                            <button
                              type="button"
                              onClick={() => copyRef(entry.transactionRef!)}
                              className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1 transition-colors"
                            >
                              <span>{entry.transactionRef}</span>
                              {copiedRef === entry.transactionRef ? (
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 text-slate-400" />
                              )}
                            </button>
                          )}
                        </div>

                        {entry.memo && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {entry.memo}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {fmt_date(entry.entryDate, true)}
                          </span>
                          {entry.provider && (
                            <span className="capitalize text-slate-500">
                              via {entry.provider}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs sm:text-sm font-semibold font-mono ${
                          isPayment ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {isPayment ? '- ' : '+ '}
                        KES {(absMinor / 100).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Minimal Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px]">
            Master Ref: <strong className="font-mono text-slate-600">{obligation.reference_no}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
