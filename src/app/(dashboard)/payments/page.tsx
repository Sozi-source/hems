'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone, fmt_date } from '@/lib/format';
import { PaymentTransaction, PaymentStatus } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCard,
  Play,
  UploadCloud,
  MessageSquare,
  Smartphone,
  Search,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { ApprovePaymentModal } from '@/components/payments/approve-payment-modal';
import { RejectPaymentModal } from '@/components/payments/reject-payment-modal';
import { SimulatePaymentModal } from '@/components/payments/simulate-payment-modal';
import { ImportStatementModal } from '@/components/payments/import-statement-modal';
import { PasteAlertModal } from '@/components/payments/paste-alert-modal';
import { SmsReaderSetupModal } from '@/components/payments/sms-reader-setup-modal';
import { PaginationBar } from '@/components/ui/pagination-bar';

const PAGE_SIZE = 15;

export default function PaymentsPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('pending');
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [summaryTotals, setSummaryTotals] = useState({
    pendingMinor: 0,
    pendingCount: 0,
    approvedMinor: 0,
    approvedCount: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const [activePaymentForApproval, setActivePaymentForApproval] = useState<PaymentTransaction | null>(null);
  const [activePaymentForRejection, setActivePaymentForRejection] = useState<PaymentTransaction | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPasteAlertModalOpen, setIsPasteAlertModalOpen] = useState(false);
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false);

  async function loadPayments() {
    try {
      const supabase = createClient();
      let query = supabase
        .from('payment_transactions')
        .select('id,business_id,provider,transaction_ref,amount_minor,occurred_at,payer_msisdn,payer_name,account_reference,status,unallocated_minor,match_confidence,conflict_flags')
        .order('occurred_at', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      const { data } = await query;
      const allRows = (data as PaymentTransaction[]) || [];

      let pendingMinor = 0;
      let pendingCount = 0;
      let approvedMinor = 0;
      let approvedCount = 0;

      for (const row of allRows) {
        if (row.status === 'pending') {
          pendingMinor += Number(row.amount_minor || 0);
          pendingCount += 1;
        } else if (row.status === 'approved') {
          approvedMinor += Number(row.amount_minor || 0);
          approvedCount += 1;
        }
      }

      setSummaryTotals({ pendingMinor, pendingCount, approvedMinor, approvedCount });

      if (filterStatus === 'all') {
        setPayments(allRows);
      } else {
        setPayments(allRows.filter((r) => r.status === filterStatus));
      }
    } catch {
      setPayments([]);
    }
  }

  useEffect(() => {
    loadPayments();

    function handleNewPayment() {
      loadPayments();
    }
    window.addEventListener('hems:payment-received', handleNewPayment);
    return () => window.removeEventListener('hems:payment-received', handleNewPayment);
  }, [activeBusinessId, isMasterView, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, activeBusinessId, isMasterView]);

  const filteredPayments = payments.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.transaction_ref?.toLowerCase().includes(q) ||
      item.payer_name?.toLowerCase().includes(q) ||
      item.payer_msisdn?.toLowerCase().includes(q) ||
      item.account_reference?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPayments = showAll
    ? filteredPayments
    : filteredPayments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Clean Enterprise Page Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
          Payments
        </h1>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReaderModalOpen(true)}
            className="h-9 px-3 text-xs"
          >
            <Smartphone className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            SMS Reader
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="hidden md:inline-flex h-9 px-3 text-xs"
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Import CSV
          </Button>

          {process.env.NODE_ENV !== 'production' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsSimulateModalOpen(true)}
              className="hidden lg:inline-flex h-9 px-3 text-xs"
            >
              <Play className="w-3.5 h-3.5 mr-1 text-slate-600" />
              Simulate
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsPasteAlertModalOpen(true)}
            className="h-9 px-3 text-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Paste SMS
          </Button>
        </div>
      </div>

      {/* Enterprise KPI Strip: 1 Deep Forest Hero Card + 2 Clean White Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#AEF359]" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Approved Receipts
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#AEF359]/25 border border-[#AEF359]/70 text-slate-900 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={summaryTotals.approvedMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {summaryTotals.approvedCount} payments credited
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Needs Review
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={summaryTotals.pendingMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {summaryTotals.pendingCount} awaiting approval
          </p>
        </Card>

        <Card className="col-span-2 sm:col-span-1 bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Showing View
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {filteredPayments.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium capitalize">
            {filterStatus === 'pending' ? 'Pending review queue' : `${filterStatus} transactions`}
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
            placeholder="Search by M-Pesa Ref, payer name, phone, or #Account..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80 shrink-0">
          {(
            [
              { id: 'pending', label: `Needs Review (${summaryTotals.pendingCount})` },
              { id: 'approved', label: `Approved (${summaryTotals.approvedCount})` },
              { id: 'all', label: 'All' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredPayments.length === 0 ? (
        <Card className="bg-white border-slate-200/90 shadow-2xs text-center py-12 px-4">
          <CreditCard className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-700">
            {filterStatus === 'pending'
              ? 'No payments waiting for review'
              : 'No matching payments found'}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Incoming M-Pesa and Bank SMS messages forwarded from your phone appear here automatically.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile Native Card List (< md) — Clean White Surface */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {paginatedPayments.map((item) => {
              const isPending = item.status === 'pending';
              const hasConflict = isPending && (item.conflict_flags?.length || 0) > 0;

              return (
                <Card
                  key={item.id}
                  className="p-3.5 bg-white border-slate-200/90 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded">
                          {item.transaction_ref}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          A/C: <strong className="font-semibold text-slate-700">{item.account_reference || item.bill_ref_number || 'None'}</strong>
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 mt-1.5 [overflow-wrap:anywhere]">
                        {item.payer_name || 'Customer'}
                      </h3>

                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                        <span className="font-mono whitespace-nowrap tabular-nums">{fmt_phone(item.payer_msisdn || item.payer_phone)}</span>
                        <span>•</span>
                        <span>{fmt_date(item.occurred_at || item.received_at, true)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <MoneyDisplay
                        minorUnits={item.amount_minor}
                        size="md"
                        variant="neutral"
                      />
                      <div className="mt-1">
                        {hasConflict ? (
                          <Badge variant="danger" size="sm" dot>
                            Reconcile
                          </Badge>
                        ) : isPending ? (
                          <Badge variant="warning" size="sm" dot>
                            Pending
                          </Badge>
                        ) : item.status === 'approved' ? (
                          <Badge variant="success" size="sm" dot>
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            {item.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.match_confidence !== undefined && item.match_confidence > 0 && (
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {item.match_confidence >= 100
                          ? '100% Exact Account Match'
                          : `${Math.round(item.match_confidence)}% Customer Match Suggestion`}
                      </span>
                    </div>
                  )}

                  {isPending && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePaymentForApproval(item)}
                        className="min-h-9 px-3 rounded-lg bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] text-xs transition-colors shadow-2xs"
                      >
                        {hasConflict ? 'Reconcile' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePaymentForRejection(item)}
                        className="min-h-9 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-slate-200/90 shadow-2xs p-0">
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-3 px-4 whitespace-nowrap">Receipt / Ref</th>
                    <th className="py-3 px-4 min-w-[180px]">Payer</th>
                    <th className="py-3 px-4 whitespace-nowrap">Account No</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Amount</th>
                    <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {paginatedPayments.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                        <span className="font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded text-xs">
                          {item.transaction_ref}
                        </span>
                        <div className="mt-1 text-[11px] text-slate-500 font-sans font-normal whitespace-nowrap tabular-nums">
                          {fmt_date(item.occurred_at || item.received_at, true)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[180px]">
                        <div className="font-semibold text-slate-900 whitespace-normal">
                          {item.payer_name || 'Customer'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap tabular-nums">
                          {fmt_phone(item.payer_msisdn || item.payer_phone)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono tabular-nums whitespace-nowrap px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold text-xs">
                            {item.account_reference || item.bill_ref_number || 'None'}
                          </span>
                          {item.match_confidence !== undefined && item.match_confidence > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              {item.match_confidence >= 100 ? 'Exact match' : 'Suggested match'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <MoneyDisplay
                          minorUnits={item.amount_minor}
                          size="sm"
                          variant="neutral"
                        />
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {item.status === 'pending' && (item.conflict_flags?.length || 0) > 0 ? (
                          <Badge variant="danger" size="sm" dot>
                            Reconcile first
                          </Badge>
                        ) : item.status === 'pending' ? (
                          <Badge variant="warning" size="sm" dot>
                            Pending
                          </Badge>
                        ) : item.status === 'approved' ? (
                          <Badge variant="success" size="sm" dot>
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm" dot>
                            {item.status}
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {item.status === 'pending' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActivePaymentForApproval(item)}
                              className="h-8 px-3 rounded-lg bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] text-xs transition-colors shadow-2xs"
                            >
                              {(item.conflict_flags?.length || 0) > 0 ? 'Reconcile' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActivePaymentForRejection(item)}
                              className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs font-semibold transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-medium capitalize">{item.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationBar
            currentPage={safePage}
            totalItems={filteredPayments.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            isShowingAll={showAll}
            onToggleShowAll={() => setShowAll((prev) => !prev)}
            itemLabel="payments"
          />
        </>
      )}

      <ApprovePaymentModal
        isOpen={Boolean(activePaymentForApproval)}
        payment={activePaymentForApproval}
        onClose={() => setActivePaymentForApproval(null)}
        onSuccess={loadPayments}
      />

      <RejectPaymentModal
        isOpen={Boolean(activePaymentForRejection)}
        payment={activePaymentForRejection}
        onClose={() => setActivePaymentForRejection(null)}
        onSuccess={loadPayments}
      />

      <SimulatePaymentModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSuccess={loadPayments}
      />

      <ImportStatementModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadPayments}
      />

      <PasteAlertModal
        isOpen={isPasteAlertModalOpen}
        onClose={() => setIsPasteAlertModalOpen(false)}
        onSuccess={loadPayments}
      />

      <SmsReaderSetupModal
        isOpen={isReaderModalOpen}
        onClose={() => setIsReaderModalOpen(false)}
      />
    </div>
  );
}
