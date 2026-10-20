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
  RefreshCw,
  Smartphone,
  Search,
  Wallet,
  CheckCircle2,
  TrendingDown,
} from 'lucide-react';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { StkPromptModal } from '@/components/payments/stk-prompt-modal';
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
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [stkTarget, setStkTarget] = useState<ObligationItem | null>(null);

  async function loadObligations() {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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
      {/* Header & Ergonomic Mobile Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F7A3D]">
            Receivables & Supplier Bills
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
            Debts & Invoices
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1 sm:flex-none justify-center"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Debt or Bill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadObligations}
            isLoading={isLoading}
            aria-label="Refresh debts and invoices"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Solid-Color KPI Summary Strip (Safaricom Green, Deep Cream, Slate Gray) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-[#144827] border-[#216B3B] text-white p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#B8E8C4]">
              Owed to You
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#1E6337] border border-[#2E824C] text-[#8DDBA0] flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={receivablesBalanceMinor} size="lg" variant="inverse" />
          <p className="mt-1 text-[10px] text-[#8DDBA0]/90 font-medium">
            Open customer debt balance
          </p>
        </Card>

        <Card className="bg-[#F3EDE0] border-[#DFD2B6] text-[#1F241D] p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#5A4D35]">
              Paid Toward Debts
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#E6DCC6] border border-[#D3C4A3] text-[#4A3B1C] flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={receivablesPaidMinor} size="lg" variant="positive" />
          <p className="mt-1 text-[10px] text-[#6E5F43] font-medium">
            Recovered from invoices
          </p>
        </Card>

        <Card className="col-span-2 sm:col-span-1 bg-[#E7ECE9] border-[#CBD6CF] text-[#17231C] p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#425449]">
              Bills to Pay
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#D7E0DB] border border-[#BFCBC4] text-[#26382E] flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={payablesBalanceMinor} size="lg" variant="negative" />
          <p className="mt-1 text-[10px] text-[#526559] font-medium">
            Supplier & payable obligations
          </p>
        </Card>
      </div>

      {/* Search & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer, supplier, or invoice reference..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-[#DCE5DF] text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1F7A3D]"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-[#EAEFEC] p-1 rounded-lg border border-[#CFD8D2] shrink-0">
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
                  ? 'bg-[#144827] text-white shadow-sm'
                  : 'text-[#3A4D41] hover:text-[#14231A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredObligations.length === 0 ? (
        <Card className="bg-white border-[#DCE5DF] shadow-sm text-center py-12 px-4">
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
          {/* Mobile Native Debt Card List (< md) — Zero Horizontal Scrolling */}
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
                  className={`p-3.5 transition-all scroll-mt-24 ${
                    isSettled
                      ? 'bg-white border-[#DCE5DF]'
                      : isReceivable
                      ? 'bg-[#FDFBF6] border-[#DFD2B6] border-l-4 border-l-[#144827]'
                      : 'bg-[#F8FAF9] border-[#CBD6CF] border-l-4 border-l-[#B42332]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-[#8DDBA0] bg-[#144827] px-2 py-0.5 rounded">
                          {ob.reference_no}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {ob.kind.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-1.5 leading-snug [overflow-wrap:anywhere]">
                        {ob.counterparty_name}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Due: <span className="font-medium text-slate-700">{fmt_date(ob.due_date)}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        {isSettled ? 'Settled' : 'Balance Due'}
                      </span>
                      <MoneyDisplay
                        minorUnits={ob.balance_minor}
                        size="md"
                        variant={isSettled ? 'neutral' : isReceivable ? 'positive' : 'negative'}
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
                          <Badge variant="info" size="sm" dot>
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Repayment Progress Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                      <span>
                        Original: <MoneyDisplay minorUnits={ob.original_minor} size="sm" className="text-[11px]" />
                      </span>
                      <span className="text-[#144827] font-bold">{pctPaid}% Paid</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#E5ECE8] overflow-hidden">
                      <div
                        className="h-full bg-[#1F7A3D] rounded-full transition-all"
                        style={{ width: `${pctPaid}%` }}
                      />
                    </div>
                  </div>

                  {isReceivable && ob.balance_minor > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#E6DEC8] flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full sm:w-auto min-h-9 px-3 text-xs font-semibold justify-center"
                        onClick={() => setStkTarget(ob)}
                      >
                        <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                        Prompt Customer via M-Pesa
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-[#DCE5DF] shadow-sm p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#EAEFEC] border-b border-[#CFD8D2] text-[11px] font-bold text-[#2F4036] uppercase tracking-wider">
                    <th className="py-3 px-4">Invoice / Ref</th>
                    <th className="py-3 px-4">Person or Company</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4 text-right">Original Amount</th>
                    <th className="py-3 px-4 text-right">Current Balance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7EDE8] text-xs">
                  {paginatedObligations.map((ob) => {
                    const isReceivable = ob.direction === 'receivable';

                    return (
                      <tr id={ob.id} key={ob.id} className="hover:bg-[#F8FAF8] transition-colors scroll-mt-24">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-[#8DDBA0] bg-[#144827] px-2 py-0.5 rounded text-xs">
                            {ob.reference_no}
                          </span>
                          <div className="mt-1 text-[11px] text-slate-500 capitalize">
                            {ob.kind.replace('_', ' ')}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {ob.counterparty_name}
                        </td>

                        <td className="py-3.5 px-4 text-slate-600">
                          {fmt_date(ob.due_date)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <MoneyDisplay minorUnits={ob.original_minor} size="sm" />
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <MoneyDisplay
                            minorUnits={ob.balance_minor}
                            size="sm"
                            variant={ob.balance_minor === 0 ? 'neutral' : isReceivable ? 'positive' : 'negative'}
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
                            <Badge variant="info" size="sm" dot>
                              Active
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {isReceivable && ob.balance_minor > 0 ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-slate-800"
                              onClick={() => setStkTarget(ob)}
                              title="Prompt customer via M-Pesa"
                            >
                              <Smartphone className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                              Prompt M-Pesa
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
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

      {stkTarget && (
        <StkPromptModal
          isOpen={Boolean(stkTarget)}
          onClose={() => setStkTarget(null)}
          businessId={stkTarget.business_id}
          customerId={stkTarget.customer_id || ''}
          customerName={stkTarget.counterparty_name}
          customerPhone=""
          amountMinor={stkTarget.balance_minor}
          accountReference={stkTarget.reference_no}
          onSuccess={loadObligations}
        />
      )}
    </div>
  );
}
