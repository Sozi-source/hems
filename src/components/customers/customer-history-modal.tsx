'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import {
  Phone,
  MessageCircle,
  Smartphone,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  User,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

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
  onPromptMpesa?: (customer: CustomerHistoryItem) => void;
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
  onPromptMpesa,
}: CustomerHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'debts' | 'payments'>('all');
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedStatement, setCopiedStatement] = useState(false);

  useEffect(() => {
    if (!isOpen || !customer) {
      setEvents([]);
      return;
    }

    async function loadLedger() {
      if (!customer) return;
      setIsLoading(true);
      try {
        const supabase = createClient();

        // 1. Fetch all debts / obligations for this customer
        const { data: obligations } = await supabase
          .from('v_obligation_overview')
          .select('id, reference_no, original_minor, balance_minor, paid_minor, status, issue_date, due_date, created_at, description')
          .eq('customer_id', customer.id)
          .eq('kind', 'customer_debt')
          .order('created_at', { ascending: false });

        // 2. Fetch all payments:
        // A. Direct payments matching account_reference or payer_msisdn
        let paymentsQuery = supabase
          .from('payment_transactions')
          .select('id, transaction_ref, amount_minor, occurred_at, provider, status, description, account_reference, payer_name')
          .eq('business_id', customer.business_id);

        if (customer.phone) {
          paymentsQuery = paymentsQuery.or(`account_reference.eq.${customer.customer_no},payer_msisdn.eq.${customer.phone}`);
        } else {
          paymentsQuery = paymentsQuery.eq('account_reference', customer.customer_no);
        }

        const { data: directPayments } = await paymentsQuery.order('occurred_at', { ascending: false });

        // 3. Build unified chronological ledger
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
            description: p.description || `Payment via ${p.provider || 'M-Pesa'} (${p.transaction_ref})`,
          });
        }

        // Sort latest first
        timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEvents(timeline);
      } catch {
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadLedger();
  }, [isOpen, customer]);

  if (!customer) return null;

  const totalBorrowed = customer.total_borrowed_minor || 0;
  const totalPaid = customer.total_paid_minor || 0;
  const balance = customer.outstanding_minor || 0;
  const hasDebt = balance > 0;

  const debtsOnly = events.filter((e) => e.type === 'debt');
  const paymentsOnly = events.filter((e) => e.type === 'payment');

  const displayedEvents =
    activeTab === 'debts'
      ? debtsOnly
      : activeTab === 'payments'
      ? paymentsOnly
      : events;

  // Generate WhatsApp Statement text
  const shareStatementText = () => {
    const lines = [
      `*CUSTOMER STATEMENT - HARON FASHION*`,
      `Client: ${customer.full_name} (${customer.customer_no})`,
      `Date: ${new Date().toLocaleDateString('en-GB')}`,
      `---------------------------------`,
      `Total Borrowed: KES ${(totalBorrowed / 100).toLocaleString()}`,
      `Total Paid:     KES ${(totalPaid / 100).toLocaleString()}`,
      `*OUTSTANDING BALANCE: KES ${(balance / 100).toLocaleString()}*`,
      `---------------------------------`,
    ];

    if (hasDebt) {
      lines.push(`Kindly remit via Paybill 247247 or Equity Bank A/C 650166.`);
      lines.push(`Thank you for your business!`);
    } else {
      lines.push(`Your account is fully settled. Thank you!`);
    }

    return lines.join('\n');
  };

  const copyStatement = () => {
    navigator.clipboard.writeText(shareStatementText());
    setCopiedStatement(true);
    setTimeout(() => setCopiedStatement(false), 2000);
  };

  const whatsappUrl = customer.phone
    ? `https://wa.me/${customer.phone.replace(/\+/g, '')}?text=${encodeURIComponent(shareStatementText())}`
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customer Historical Ledger"
      maxWidth="xl"
    >
      <div className="space-y-4 text-sm -mt-2">
        {/* Customer Header & Quick Contacts */}
        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#123520] text-white flex items-center justify-center font-bold text-sm shrink-0">
              {customer.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  {customer.full_name}
                </h3>
                <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                  {customer.customer_no}
                </span>
                {customer.nickname && (
                  <Badge variant="neutral" size="sm">
                    Alias: {customer.nickname}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 flex-wrap">
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-1 font-mono font-medium text-slate-700 hover:text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200"
                  >
                    <Phone className="w-3 h-3 text-slate-500" />
                    {fmt_phone(customer.phone)}
                  </a>
                ) : (
                  <span className="text-slate-400">No phone recorded</span>
                )}

                {customer.notes && (
                  <span className="text-slate-500 italic max-w-xs truncate">
                    {customer.notes}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons: WhatsApp & Prompt */}
          <div className="flex items-center gap-2 shrink-0">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                title="Send statement via WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>WhatsApp</span>
              </a>
            )}

            <button
              type="button"
              onClick={copyStatement}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              title="Copy statement summary"
            >
              {copiedStatement ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copiedStatement ? 'Copied' : 'Statement'}</span>
            </button>

            {hasDebt && onPromptMpesa && (
              <button
                type="button"
                onClick={() => onPromptMpesa(customer)}
                className="h-8 px-3 rounded-lg bg-[#123520] hover:bg-[#1A4A2D] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Prompt M-Pesa</span>
              </button>
            )}
          </div>
        </div>

        {/* Consolidated Financial Summary Strip for this Customer */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Borrowed
            </span>
            <div className="mt-1">
              <MoneyDisplay minorUnits={totalBorrowed} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {debtsOnly.length} credit obligations
            </span>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200/90 bg-white shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Paid
            </span>
            <div className="mt-1">
              <MoneyDisplay minorUnits={totalPaid} size="md" variant="neutral" />
            </div>
            <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
              {paymentsOnly.length} verified receipts
            </span>
          </div>

          <div className={`p-3 sm:p-3.5 rounded-xl border shadow-2xs ${
            hasDebt
              ? 'bg-[#123520] border-[#1E4D30] text-white'
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}>
            <span className={`text-[10px] font-semibold uppercase tracking-wider block ${
              hasDebt ? 'text-emerald-100/80' : 'text-slate-500'
            }`}>
              Current Balance Owed
            </span>
            <div className="mt-1">
              <MoneyDisplay
                minorUnits={balance}
                size="md"
                variant={hasDebt ? 'inverse' : 'neutral'}
              />
            </div>
            <span className={`text-[11px] font-medium mt-0.5 block ${
              hasDebt ? 'text-emerald-200' : 'text-slate-500'
            }`}>
              {hasDebt ? 'Outstanding debt' : 'Fully settled'}
            </span>
          </div>
        </div>

        {/* Segmented Filter Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pt-1">
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'all', label: `All History (${events.length})` },
                { id: 'debts', label: `Debts (${debtsOnly.length})` },
                { id: 'payments', label: `Payments (${paymentsOnly.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px px-1 ${
                  activeTab === tab.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            Chronological
          </span>
        </div>

        {/* Historical Records Timeline / List */}
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Loading customer history...
          </div>
        ) : displayedEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-50/60 rounded-xl border border-slate-200/80">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700">
              No {activeTab === 'debts' ? 'debt' : activeTab === 'payments' ? 'payment' : 'historical'} records found
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {activeTab === 'all'
                ? 'This client is currently a cash customer with no recorded debt or payment activity.'
                : `No recorded ${activeTab} on file.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {displayedEvents.map((evt) => {
              const isDebt = evt.type === 'debt';
              const isSettled = evt.status === 'settled' || evt.status === 'approved';

              return (
                <div
                  key={evt.id}
                  className={`p-3 rounded-lg border bg-white shadow-2xs transition-all ${
                    isDebt
                      ? 'border-l-4 border-l-amber-500 border-slate-200/80'
                      : 'border-l-4 border-l-emerald-600 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isDebt
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                        }`}
                      >
                        {isDebt ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs">
                            {isDebt ? 'Goods on Credit / Debt' : 'Payment Received'}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                            {evt.reference}
                          </span>
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

                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {evt.description}
                        </p>

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
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

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        {isDebt ? 'Borrowed' : 'Paid'}
                      </span>
                      <MoneyDisplay
                        minorUnits={evt.amountMinor}
                        size="sm"
                        variant="neutral"
                      />
                      {isDebt && evt.balanceMinor !== undefined && evt.balanceMinor > 0 && (
                        <span className="text-[10px] text-amber-700 font-mono block mt-0.5">
                          Rem: KSh {(evt.balanceMinor / 100).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
          <span className="text-slate-400 text-[11px]">
            Account Master Ref: <strong className="font-mono text-slate-700">{customer.customer_no}</strong>
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
