'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_date } from '@/lib/format';
import { ObligationDirection } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import {
  Plus,
  Receipt,
  Search,
  Wallet,
  CheckCircle2,
  TrendingDown,
  Banknote,
} from 'lucide-react';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { ObligationHistoryModal } from '@/components/obligations/obligation-history-modal';
import { PayDebtModal } from '@/components/payments/pay-debt-modal';
import { PaginationBar } from '@/components/ui/pagination-bar';

const PAGE_SIZE = 15;

interface ObligationItem {
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

export default function ObligationsPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [directionFilter, setDirectionFilter] = useState<ObligationDirection | 'all'>('all');
  const [obligations, setObligations] = useState<ObligationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedObligationForLedger, setSelectedObligationForLedger] = useState<ObligationItem | null>(null);
  const [obligationForPayDebt, setObligationForPayDebt] = useState<ObligationItem | null>(null);

  async function loadObligations() {
    try {
      const supabase = createClient();

      let query = supabase
        .from('v_obligation_overview')
        .select('id, business_id, customer_id, kind, direction, reference_no, counterparty_name, original_minor, balance_minor, paid_minor, status, due_date, issue_date, is_overdue')
        .order('issue_date', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }

      const { data, error } = await query;

      if (!error && data) {
        setObligations(
          data.map((o: any) => ({
            id: o.id,
            business_id: o.business_id,
            customer_id: o.customer_id,
            kind: o.kind,
            direction: o.direction as ObligationDirection,
            reference_no: o.reference_no,
            counterparty_name: o.counterparty_name || 'Counterparty',
            original_minor: Number(o.original_minor || 0),
            balance_minor: Number(o.balance_minor || 0),
            paid_minor: Number(o.paid_minor || 0),
            status: o.status,
            due_date: o.due_date,
            issue_date: o.issue_date,
            is_overdue: Boolean(o.is_overdue),
          }))
        );
      } else {
        let fallback = supabase
          .from('obligations')
          .select('id, business_id, customer_id, kind, direction, reference_no, payee_name, original_minor, balance_minor, status, due_date, issue_date')
          .order('created_at', { ascending: false });

        if (!isMasterView && activeBusinessId) {
          fallback = fallback.eq('business_id', activeBusinessId);
        }

        if (directionFilter !== 'all') {
          fallback = fallback.eq('direction', directionFilter);
        }

        const { data: fallbackData } = await fallback;
        setObligations(
          (fallbackData || []).map((o: any) => ({
            id: o.id,
            business_id: o.business_id,
            customer_id: o.customer_id,
            kind: o.kind,
            direction: o.direction as ObligationDirection,
            reference_no: o.reference_no,
            counterparty_name: o.payee_name || 'Counterparty',
            original_minor: Number(o.original_minor || 0),
            balance_minor: Number(o.balance_minor || 0),
            paid_minor: Math.max(0, Number(o.original_minor || 0) - Number(o.balance_minor || 0)),
            status: o.status,
            due_date: o.due_date,
            issue_date: o.issue_date,
            is_overdue: false,
          }))
        );
      }
    } catch {
      setObligations([]);
    }
  }

  useEffect(() => {
    loadObligations();
  }, [activeBusinessId, isMasterView, directionFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, directionFilter, activeBusinessId, isMasterView]);

  const receivablesBalanceMinor = obligations
    .filter((o) => o.direction === 'receivable')
    .reduce((sum, o) => sum + o.balance_minor, 0);

  const receivablesPaidMinor = obligations
    .filter((o) => o.direction === 'receivable')
    .reduce((sum, o) => sum + Math.max(0, o.original_minor - o.balance_minor), 0);

  const payablesBalanceMinor = obligations
    .filter((o) => o.direction === 'payable')
    .reduce((sum, o) => sum + o.balance_minor, 0);

  const filteredObligations = obligations.filter((ob) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      ob.counterparty_name?.toLowerCase().includes(q) ||
      ob.reference_no?.toLowerCase().includes(q) ||
      ob.kind?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!filteredObligations.length || !window.location.hash) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const idx = filteredObligations.findIndex((o) => o.id === targetId);
    if (idx >= 0 && !showAll) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      setCurrentPage(targetPage);
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [obligations]);

  const totalPages = Math.max(1, Math.ceil(filteredObligations.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedObligations = showAll
    ? filteredObligations
    : filteredObligations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Clean Enterprise Page Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
          Debts & Invoices
        </h1>

        <Button
          variant="primary"
          size="sm"
          className="h-9 px-3 text-xs"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          New Debt or Bill
        </Button>
      </div>

      {/* Enterprise KPI Strip: 1 Deep Forest Hero Card + 2 Clean White Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#AEF359]" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Owed to You
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#AEF359]/25 border border-[#AEF359]/70 text-slate-900 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={receivablesBalanceMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Open customer debt balance
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Paid Toward Debts
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={receivablesPaidMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Recovered from invoices
          </p>
        </Card>

        <Card className="col-span-2 sm:col-span-1 bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Bills to Pay
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={payablesBalanceMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Supplier & payable obligations
          </p>
        </Card>
      </div>

      {/* Search & Neutral Segmented Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80 shrink-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'receivable', label: 'Owed to You' },
              { id: 'payable', label: 'Bills to Pay' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDirectionFilter(tab.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                directionFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredObligations.length === 0 ? (
        <Card className="bg-white border-slate-200/90 shadow-2xs text-center py-12 px-4">
          <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-700">
            {obligations.length === 0
              ? 'No debts or bills recorded yet'
              : 'No matching debts or invoices found'}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create a customer debt or supplier bill using the button above.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile Native Debt Card List (< md) — Clean White Surface */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {paginatedObligations.map((ob) => {
              const isReceivable = ob.direction === 'receivable';
              const isSettled = ob.balance_minor === 0 || ob.status === 'paid';
              const paidAmt = Math.max(0, ob.original_minor - ob.balance_minor);
              const pctPaid =
                ob.original_minor > 0
                  ? Math.min(100, Math.round((paidAmt / ob.original_minor) * 100))
                  : isSettled
                  ? 100
                  : 0;

              return (
                <Card
                  id={ob.id}
                  key={ob.id}
                  onClick={() => setSelectedObligationForLedger(ob)}
                  className="p-3.5 bg-white border-slate-200/90 shadow-2xs scroll-mt-24 cursor-pointer hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded">
                          {ob.reference_no}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                          {ob.kind.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 mt-1.5 leading-snug [overflow-wrap:anywhere]">
                        {ob.counterparty_name}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Due: <span className="font-medium text-slate-700">{fmt_date(ob.due_date)}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        {isSettled ? 'Settled' : 'Balance Due'}
                      </span>
                      <MoneyDisplay
                        minorUnits={ob.balance_minor}
                        size="md"
                        variant="neutral"
                      />
                      <div className="mt-1">
                        {isSettled ? (
                          <Badge variant="success" size="sm" dot>
                            Settled
                          </Badge>
                        ) : ob.is_overdue ? (
                          <Badge variant="danger" size="sm" dot>
                            Overdue
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm" dot>
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Repayment Progress Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 mb-1">
                      <span>
                        Original: <MoneyDisplay minorUnits={ob.original_minor} size="sm" className="text-[11px]" />
                      </span>
                      <span className="text-slate-700 font-semibold">{pctPaid}% Paid</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-[#AEF359] border-r border-[#9fe648] rounded-full transition-all"
                        style={{ width: `${pctPaid}%` }}
                      />
                    </div>
                  </div>

                  <div
                    className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isReceivable && ob.balance_minor > 0 ? (
                      <button
                        type="button"
                        onClick={() => setObligationForPayDebt(ob)}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors shadow-2xs"
                        title="Pay this debt with paper cash"
                      >
                        <Banknote className="w-3.5 h-3.5 text-emerald-200" />
                        <span>Pay Cash</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Tap to inspect ledger</span>
                    )}
                    <Badge variant={isSettled ? 'success' : 'neutral'} size="sm">
                      {isSettled ? 'Settled' : 'Active'}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-slate-200/90 shadow-2xs p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Invoice / Ref</th>
                    <th className="py-3 px-4">Person or Company</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4 text-right">Original Amount</th>
                    <th className="py-3 px-4 text-right">Current Balance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedObligations.map((ob) => {
                    const isReceivable = ob.direction === 'receivable';

                    return (
                      <tr
                        id={ob.id}
                        key={ob.id}
                        onClick={() => setSelectedObligationForLedger(ob)}
                        className="hover:bg-slate-50/70 transition-colors scroll-mt-24 cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-semibold text-slate-700 bg-slate-100 group-hover:bg-slate-200 border border-slate-200/80 px-2 py-0.5 rounded text-xs transition-colors">
                            {ob.reference_no}
                          </span>
                          <div className="mt-1 text-[11px] text-slate-500 capitalize">
                            {ob.kind.replace('_', ' ')}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {ob.counterparty_name}
                        </td>

                        <td className="py-3.5 px-4 text-slate-600">
                          {fmt_date(ob.due_date)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <MoneyDisplay minorUnits={ob.original_minor} size="sm" variant="neutral" />
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <MoneyDisplay
                            minorUnits={ob.balance_minor}
                            size="sm"
                            variant="neutral"
                          />
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {ob.balance_minor === 0 || ob.status === 'paid' ? (
                            <Badge variant="success" size="sm" dot>
                              Settled
                            </Badge>
                          ) : ob.is_overdue ? (
                            <Badge variant="danger" size="sm" dot>
                              Overdue
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm" dot>
                              Active
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {isReceivable && ob.balance_minor > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100 border-emerald-300 font-semibold"
                                onClick={() => setObligationForPayDebt(ob)}
                                title="Pay debt with paper cash"
                              >
                                <Banknote className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                Pay Cash
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800"
                              onClick={() => setSelectedObligationForLedger(ob)}
                              title="View obligation details & ledger"
                            >
                              Details →
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationBar
            currentPage={safePage}
            totalItems={filteredObligations.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            isShowingAll={showAll}
            onToggleShowAll={() => setShowAll((prev) => !prev)}
            itemLabel="records"
          />
        </>
      )}

      <CreateObligationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadObligations}
      />

      {selectedObligationForLedger && (
        <ObligationHistoryModal
          isOpen={Boolean(selectedObligationForLedger)}
          onClose={() => setSelectedObligationForLedger(null)}
          onUpdated={loadObligations}
          obligation={selectedObligationForLedger}
        />
      )}

      <PayDebtModal
        isOpen={Boolean(obligationForPayDebt)}
        onClose={() => setObligationForPayDebt(null)}
        onSuccess={() => {
          setObligationForPayDebt(null);
          loadObligations();
        }}
        preselectedObligation={obligationForPayDebt}
      />
    </div>
  );
}
