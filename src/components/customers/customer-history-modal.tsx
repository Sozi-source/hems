'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import {
  Phone,
  MessageCircle,
  Smartphone,
  Calendar,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  Search,
  X,
  CreditCard,
  CheckCircle2,
  Plus,
  Banknote,
} from 'lucide-react';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { PayDebtModal } from '@/components/payments/pay-debt-modal';
import { useBusiness } from '@/context/business-context';

export interface CustomerHistoryItem {
  id: string;
  business_id: string;
  customer_no: string;
  full_name: string;
  nickname?: string | null;
  phone: string | null;
  outstanding_minor?: number;
  total_borrowed_minor?: number;
  total_paid_minor?: number;
  open_debts?: number;
  notes?: string | null;
}

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerHistoryItem | null;
  onUpdated?: () => void;
}

interface LedgerEvent {
  id: string;
  type: 'debt' | 'payment';
  date: string;
  reference: string;
  amountMinor: number;
  balanceMinor?: number;
  status: string;
  description: string;
  provider?: string;
}

export function CustomerHistoryModal({
  isOpen,
  onClose,
  customer,
  onUpdated,
}: CustomerHistoryModalProps) {
  const { businesses } = useBusiness();
  const [activeTab, setActiveTab] = useState<'all' | 'debts' | 'payments'>('all');
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedStatement, setCopiedStatement] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [isPayDebtOpen, setIsPayDebtOpen] = useState(false);

  const loadLedger = useCallback(async () => {
    if (!customer) return;
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch all obligations for this customer
      const { data: obligations } = await supabase
        .from('v_obligation_overview')
        .select('id, reference_no, original_minor, balance_minor, paid_minor, status, issue_date, due_date, created_at, description')
        .eq('customer_id', customer.id)
        .eq('kind', 'customer_debt')
        .order('created_at', { ascending: false });

      // 2. Fetch all direct payments
      let paymentsQuery = supabase
        .from('payment_transactions')
        .select('id, transaction_ref, amount_minor, occurred_at, provider, status, description, account_reference, payer_name')
        .eq('business_id', customer.business_id);

      if (customer.phone) {
        paymentsQuery = paymentsQuery.or(
          `account_reference.eq.${customer.customer_no},payer_msisdn.eq.${customer.phone}`
        );
      } else {
        paymentsQuery = paymentsQuery.eq('account_reference', customer.customer_no);
      }

      const { data: directPayments } = await paymentsQuery.order('occurred_at', { ascending: false });

      // 3. Combine into unified ledger timeline
      const timeline: LedgerEvent[] = [];

      for (const o of obligations || []) {
        timeline.push({
          id: `debt-${o.id}`,
          type: 'debt',
          date: o.issue_date || o.created_at,
          reference: o.reference_no,
          amountMinor: Number(o.original_minor || 0),
          balanceMinor: Number(o.balance_minor || 0),
          status: o.status,
          description: o.description || `Credit Purchase (${o.reference_no})`,
        });
      }

      const seenRef = new Set<string>();
      for (const p of directPayments || []) {
        if (seenRef.has(p.transaction_ref)) continue;
        seenRef.add(p.transaction_ref);

        timeline.push({
          id: `pay-${p.id}`,
          type: 'payment',
          date: p.occurred_at,
          reference: p.transaction_ref,
          amountMinor: Number(p.amount_minor || 0),
          status: p.status,
          provider: p.provider,
          description: p.description || `Payment via ${p.provider || 'Bank/M-Pesa'}`,
        });
      }

      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(timeline);
    } catch {
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    if (!isOpen || !customer) {
      setEvents([]);
      setSearchQuery('');
      return;
    }

    loadLedger();
  }, [isOpen, customer, loadLedger]);

  const debtsOnly = useMemo(() => events.filter((e) => e.type === 'debt'), [events]);
  const paymentsOnly = useMemo(() => events.filter((e) => e.type === 'payment'), [events]);

  const filteredEvents = useMemo(() => {
    let list =
      activeTab === 'debts'
        ? debtsOnly
        : activeTab === 'payments'
        ? paymentsOnly
        : events;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.reference.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.status.toLowerCase().includes(q) ||
          (e.provider && e.provider.toLowerCase().includes(q))
      );
    }
    return list;
  }, [events, debtsOnly, paymentsOnly, activeTab, searchQuery]);

  if (!customer) return null;

  const totalBorrowed = customer.total_borrowed_minor || 0;
  const totalPaid = customer.total_paid_minor || 0;
  const balance = customer.outstanding_minor || 0;
  const hasDebt = balance > 0;

  const shareStatementText = () => {
    const biz = businesses.find((b) => b.id === customer.business_id);
    const isZenith =
      customer.business_id === 'e76624b0-7cbc-4a7f-a375-6e7ccd6b13d5' ||
      biz?.code === 'ZENITH_PLAST' ||
      biz?.code === 'DEV_ZENITH_PLAST' ||
      biz?.name.toLowerCase().includes('zenith');

    const businessTitle = isZenith ? 'ZENITH PLAST DISTRIBUTORS LTD' : 'HARON FASHION';

    const lines = [
      `*CUSTOMER STATEMENT - ${businessTitle}*`,
      `Client: ${customer.full_name} (${customer.customer_no})`,
      `Date: ${new Date().toLocaleDateString('en-GB')}`,
      `---------------------------------`,
      `Total Borrowed: KES ${(totalBorrowed / 100).toLocaleString()}`,
      `Total Paid:     KES ${(totalPaid / 100).toLocaleString()}`,
      `*OUTSTANDING BALANCE: KES ${(balance / 100).toLocaleString()}*`,
      `---------------------------------`,
    ];

    const contactTag = isZenith ? 'Zenith- 0711377496' : 'Haron fashio-0725499796';

    if (hasDebt) {
      if (isZenith) {
        lines.push(`Kindly remit via Absa Bank Paybill 303030, Account 1398# (Ref: ${customer.customer_no}).`);
      } else {
        lines.push(`Kindly remit via Equity Paybill 247247 Acc 650166 or NCBA Paybill 880100 Acc 650166 (Ref: ${customer.customer_no}).`);
      }
      lines.push(contactTag);
      lines.push(`Thank you for your business!`);
    } else {
      lines.push(`Your account is fully settled. Thank you!`);
      lines.push(contactTag);
    }

    return lines.join('\n');
  };

  const copyStatement = () => {
    navigator.clipboard.writeText(shareStatementText());
    setCopiedStatement(true);
    setTimeout(() => setCopiedStatement(false), 2000);
  };

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1800);
  };

  const whatsappUrl = customer?.phone
    ? `https://wa.me/${String(customer.phone).replace(/\D/g, '')}?text=${encodeURIComponent(shareStatementText())}`
    : null;

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
          {/* Customer Identity */}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center font-bold text-sm shrink-0 border border-slate-200/80">
              {(customer.full_name || 'Client').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {customer.full_name || 'Unnamed Client'}
                </h2>
                <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {customer.customer_no || ''}
                </span>
                {customer.nickname && (
                  <span className="text-xs text-slate-500 font-medium">
                    ({customer.nickname})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{fmt_phone(customer.phone)}</span>
                  </a>
                ) : (
                  <span className="text-slate-400">No phone recorded</span>
                )}

                {customer.notes && (
                  <span className="text-slate-400 truncate max-w-xs text-[11px]">
                    {customer.notes}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Row & Close Button */}
          <div className="flex items-center gap-2 self-end sm:self-start shrink-0 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setIsPayDebtOpen(true)}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs ${
                hasDebt
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title="Pay debt with paper cash"
            >
              <Banknote className={`w-3.5 h-3.5 ${hasDebt ? 'text-emerald-100' : 'text-slate-500'}`} />
              <span>{hasDebt ? 'Pay Debt' : 'Pay Cash'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddDebtOpen(true)}
              className="h-8 px-2.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Add new goods on debt for this client"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Add Debt</span>
            </button>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/50 text-slate-700 hover:text-emerald-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                title="Send statement via WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden xs:inline">WhatsApp</span>
              </a>
            )}

            <button
              type="button"
              onClick={copyStatement}
              className="h-8 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              title="Copy summary statement"
            >
              {copiedStatement ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{copiedStatement ? 'Copied' : 'Statement'}</span>
            </button>

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

        {/* Minimal 3-Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 sm:p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50">
            <span className="text-[11px] font-medium text-slate-500 block">
              Total Borrowed
            </span>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={totalBorrowed} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {debtsOnly.length} credit obligation{debtsOnly.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="p-3 sm:p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50">
            <span className="text-[11px] font-medium text-slate-500 block">
              Total Paid
            </span>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={totalPaid} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {paymentsOnly.length} payment receipt{paymentsOnly.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="p-3 sm:p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 block">
                Balance Owed
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  hasDebt
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {hasDebt ? 'Active Debt' : 'Settled'}
              </span>
            </div>
            <div className="mt-0.5">
              <MoneyDisplay minorUnits={balance} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {hasDebt ? 'Current outstanding' : 'Zero debt'}
            </span>
          </div>
        </div>

        {/* Minimal Tabs & Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          {/* Segmented Filter Pills */}
          <div className="inline-flex p-1 rounded-lg bg-slate-100/90 text-xs font-medium text-slate-600 gap-1 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Full Ledger ({events.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('debts')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'debts'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Debts ({debtsOnly.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'payments'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Payments ({paymentsOnly.length})
            </button>
          </div>

          {/* Quick Search */}
          {events.length > 3 && (
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chronological Ledger List */}
        {isLoading ? (
          <div className="py-14 text-center text-xs text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
            Loading customer history...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-slate-100">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">
              No {activeTab === 'debts' ? 'debt' : activeTab === 'payments' ? 'payment' : 'historical'} records found
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {searchQuery
                ? 'No activity matches your search.'
                : activeTab === 'all'
                ? 'This client is a cash customer with no recorded debt or payment transactions.'
                : `No recorded ${activeTab} on file.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredEvents.map((evt) => {
              const isDebt = evt.type === 'debt';
              const isSettled = evt.status === 'settled' || evt.status === 'approved';

              return (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Icon & Details */}
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isDebt
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                        }`}
                      >
                        {isDebt ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs">
                            {isDebt ? 'Goods on Credit' : 'Payment Received'}
                          </span>

                          <button
                            type="button"
                            onClick={() => copyRef(evt.reference)}
                            className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1 transition-colors group"
                            title="Click to copy reference"
                          >
                            <span>{evt.reference}</span>
                            {copiedRef === evt.reference ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-600" />
                            )}
                          </button>

                          <Badge
                            variant={
                              isSettled
                                ? 'success'
                                : evt.status === 'open' || evt.status === 'pending'
                                ? 'warning'
                                : 'neutral'
                            }
                            size="sm"
                            className="capitalize text-[10px]"
                          >
                            {evt.status}
                          </Badge>
                        </div>

                        <p className="text-[11px] text-slate-500 mt-0.5 truncate leading-normal">
                          {evt.description}
                        </p>

                        <div className="flex items-center gap-2.5 mt-1 text-[10px] text-slate-400 font-mono flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(evt.date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          {evt.provider && (
                            <span className="capitalize text-slate-500">
                              via {evt.provider}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amounts */}
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                        {isDebt ? 'Borrowed' : 'Received'}
                      </span>
                      <div className="text-xs sm:text-sm font-semibold font-mono text-slate-900">
                        {isDebt ? '' : '+ '}
                        KES {(evt.amountMinor / 100).toLocaleString()}
                      </div>
                      {isDebt && evt.balanceMinor !== undefined && evt.balanceMinor > 0 && (
                        <span className="text-[10px] text-amber-700 font-mono block mt-0.5">
                          Rem: KES {(evt.balanceMinor / 100).toLocaleString()}
                        </span>
                      )}
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
            Master Ref: <strong className="font-mono text-slate-600">{customer.customer_no}</strong>
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

      <CreateObligationModal
        isOpen={isAddDebtOpen}
        onClose={() => setIsAddDebtOpen(false)}
        onSuccess={() => {
          setIsAddDebtOpen(false);
          loadLedger();
          if (onUpdated) onUpdated();
        }}
        preselectedCustomer={customer}
      />

      <PayDebtModal
        isOpen={isPayDebtOpen}
        onClose={() => setIsPayDebtOpen(false)}
        onSuccess={() => {
          setIsPayDebtOpen(false);
          loadLedger();
          if (onUpdated) onUpdated();
        }}
        preselectedCustomer={customer}
      />
    </Modal>
  );
}
