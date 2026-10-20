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
  RefreshCw,
  CreditCard,
  Play,
  UploadCloud,
  MessageSquare,
  Smartphone,
  Search,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
} from 'lucide-react';
import { ApprovePaymentModal } from '@/components/payments/approve-payment-modal';
import { RejectPaymentModal } from '@/components/payments/reject-payment-modal';
import { SimulatePaymentModal } from '@/components/payments/simulate-payment-modal';
import { ImportStatementModal } from '@/components/payments/import-statement-modal';
import { PasteAlertModal } from '@/components/payments/paste-alert-modal';
import { SmsReaderSetupModal } from '@/components/payments/sms-reader-setup-modal';

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
  const [isLoading, setIsLoading] = useState(false);

  const [activePaymentForApproval, setActivePaymentForApproval] = useState<PaymentTransaction | null>(null);
  const [activePaymentForRejection, setActivePaymentForRejection] = useState<PaymentTransaction | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPasteAlertModalOpen, setIsPasteAlertModalOpen] = useState(false);
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false);

  async function loadPayments() {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Ergonomic Mobile Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#1F7A3D]">
            SMS & M-Pesa Reconciliation
          </p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
            Payments
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1 sm:flex-none justify-center"
            onClick={() => setIsPasteAlertModalOpen(true)}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Paste SMS Alert
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none justify-center"
            onClick={() => setIsReaderModalOpen(true)}
          >
            <Smartphone className="w-3.5 h-3.5 mr-1.5 text-[#1F7A3D]" />
            SMS Reader
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="hidden sm:inline-flex"
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1 text-[#1F7A3D]" />
            Import CSV
          </Button>

          {process.env.NODE_ENV !== 'production' && (
            <Button variant="secondary" size="sm" onClick={() => setIsSimulateModalOpen(true)}>
              <Play className="w-3.5 h-3.5 mr-1 text-[#1F7A3D]" />
              Simulate
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            isLoading={isLoading}
            aria-label="Refresh payments"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Solid-Color KPI Strip (Safaricom Green, Deep Cream/Amber, Slate Gray) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-[#144827] border-[#216B3B] text-white p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#B8E8C4]">
              Approved Receipts
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#1E6337] border border-[#2E824C] text-[#8DDBA0] flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={summaryTotals.approvedMinor} size="lg" variant="inverse" />
          <p className="mt-1 text-[10px] text-[#8DDBA0]/90 font-medium">
            {summaryTotals.approvedCount} payments credited
          </p>
        </Card>

        <Card className="bg-[#F3EDE0] border-[#DFD2B6] text-[#1F241D] p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#5A4D35]">
              Needs Review
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#E6DCC6] border border-[#D3C4A3] text-[#4A3B1C] flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={summaryTotals.pendingMinor} size="lg" variant="amber" />
          <p className="mt-1 text-[10px] text-[#6E5F43] font-medium">
            {summaryTotals.pendingCount} awaiting approval
          </p>
        </Card>

        <Card className="col-span-2 sm:col-span-1 bg-[#E7ECE9] border-[#CBD6CF] text-[#17231C] p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#425449]">
              Showing View
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#D7E0DB] border border-[#BFCBC4] text-[#26382E] flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-[#17231C]">
            {filteredPayments.length}
          </div>
          <p className="mt-1 text-[10px] text-[#526559] font-medium capitalize">
            {filterStatus === 'pending' ? 'Pending review queue' : `${filterStatus} transactions`}
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
            placeholder="Search by M-Pesa Ref, payer name, phone, or #Account..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-[#DCE5DF] text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1F7A3D]"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-[#EAEFEC] p-1 rounded-lg border border-[#CFD8D2] shrink-0">
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
                  ? 'bg-[#144827] text-white shadow-sm'
                  : 'text-[#3A4D41] hover:text-[#14231A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredPayments.length === 0 ? (
        <Card className="bg-white border-[#DCE5DF] shadow-sm text-center py-12 px-4">
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
          {/* Mobile Native Card List (< md) — Zero Horizontal Scrolling */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filteredPayments.map((item) => {
              const isPending = item.status === 'pending';
              const hasConflict = isPending && (item.conflict_flags?.length || 0) > 0;

              return (
                <Card
                  key={item.id}
                  className={`p-3.5 transition-all ${
                    isPending
                      ? 'bg-[#FDFBF6] border-[#DFD2B6] border-l-4 border-l-[#D97706]'
                      : 'bg-white border-[#DCE5DF] border-l-4 border-l-[#144827]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-[#8DDBA0] bg-[#144827] px-2 py-0.5 rounded">
                          {item.transaction_ref}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          A/C: {item.account_reference || item.bill_ref_number || 'None'}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-1.5 flex items-center gap-1.5 [overflow-wrap:anywhere]">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-[#1F7A3D] shrink-0" />
                        {item.payer_name || 'Customer'}
                      </h3>

                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-600 flex-wrap">
                        <span className="font-mono">{fmt_phone(item.payer_msisdn || item.payer_phone)}</span>
                        <span>•</span>
                        <span>{fmt_date(item.occurred_at || item.received_at, true)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <MoneyDisplay
                        minorUnits={item.amount_minor}
                        size="md"
                        variant={isPending ? 'amber' : 'positive'}
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8F5EB] text-[#144827] border border-[#BBDCC4]">
                        {item.match_confidence >= 100
                          ? '100% Exact Account Match'
                          : `${Math.round(item.match_confidence)}% Customer Match Suggestion`}
                      </span>
                    </div>
                  )}

                  {isPending && (
                    <div className="mt-3 pt-2.5 border-t border-[#E6DEC8] grid grid-cols-2 gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        className="min-h-10 text-xs font-semibold justify-center"
                        onClick={() => setActivePaymentForApproval(item)}
                      >
                        {hasConflict ? 'Reconcile & Approve' : 'Review & Approve'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-10 text-xs text-[#A21D2B] hover:bg-[#FDECEE] border-[#F4C5CB] font-semibold justify-center"
                        onClick={() => setActivePaymentForRejection(item)}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-[#DCE5DF] shadow-sm p-0">
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[820px] text-left border-collapse">
                <thead>
                  <tr className="bg-[#EAEFEC] border-b border-[#CFD8D2] text-[11px] font-bold text-[#2F4036] uppercase tracking-wide">
                    <th className="py-3 px-4">Receipt / Ref</th>
                    <th className="py-3 px-4">Payer</th>
                    <th className="py-3 px-4">Account No</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7EDE8] text-[13px]">
                  {filteredPayments.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F8FAF8] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                        <span className="font-mono font-bold text-[#8DDBA0] bg-[#144827] px-2 py-0.5 rounded text-xs">
                          {item.transaction_ref}
                        </span>
                        <div className="mt-1 text-[11px] text-slate-600 font-sans font-normal whitespace-nowrap tabular-nums">
                          {fmt_date(item.occurred_at || item.received_at, true)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 whitespace-normal">
                          {item.payer_name || 'Customer'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {fmt_phone(item.payer_msisdn || item.payer_phone)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono tabular-nums whitespace-nowrap px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                            {item.account_reference || item.bill_ref_number || 'None'}
                          </span>
                          {item.match_confidence !== undefined && item.match_confidence > 0 && (
                            item.match_confidence >= 100 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#1F7A3D] border border-emerald-200">
                                Exact reference suggestion
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#EDF3F7] text-[#29465A] border border-[#D1DFE8]">
                                Phone/Name match suggestion
                              </span>
                            )
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <MoneyDisplay
                          minorUnits={item.amount_minor}
                          size="sm"
                          variant={item.status === 'approved' ? 'positive' : 'amber'}
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
                          <Badge variant="danger" size="sm" dot>
                            {item.status}
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {item.status === 'pending' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="success"
                              size="sm"
                              className="min-h-10 px-3 text-xs font-semibold"
                              onClick={() => setActivePaymentForApproval(item)}
                            >
                              {(item.conflict_flags?.length || 0) > 0 ? 'Reconcile' : 'Review'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-10 px-3 text-xs text-[#A21D2B] hover:bg-[#FDECEE] border-[#F4C5CB] font-semibold"
                              onClick={() => setActivePaymentForRejection(item)}
                            >
                              Reject
                            </Button>
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
