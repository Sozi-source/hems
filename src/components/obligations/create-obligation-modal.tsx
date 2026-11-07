'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes, fmt_kes, fmt_phone, fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Plus, Search, CalendarClock, Clock, Calendar } from 'lucide-react';

interface PreselectedCustomer {
  id: string;
  business_id?: string;
  customer_no?: string | null;
  full_name: string;
  nickname?: string | null;
  phone?: string | null;
  outstanding_minor?: number;
}

interface CreateObligationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedCustomer?: PreselectedCustomer | null;
}

interface CustomerOption {
  id: string;
  customer_no: string;
  full_name: string;
  nickname?: string | null;
  phone?: string | null;
}

interface SupplierOption {
  id: string;
  supplier_no: string | null;
  name: string;
  phone: string | null;
  payment_terms_days: number;
}

interface CustomerDebtSummary {
  count: number;
  totalBalanceMinor: number;
  earliestDueDate: string | null;
  latestDueDate: string | null;
  isOverdue: boolean;
  daysDiff: number;
}

function getPresetDate(daysToAdd: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysToAdd);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEndOfMonthDate(): string {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const year = lastDay.getFullYear();
  const month = String(lastDay.getMonth() + 1).padStart(2, '0');
  const day = String(lastDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysDiffFromToday(dateStr: string): number | null {
  if (!dateStr) return null;
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(`${todayStr}T00:00:00Z`);
    const target = new Date(`${dateStr}T00:00:00Z`);
    if (isNaN(target.getTime())) return null;
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function CreateObligationModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedCustomer,
}: CreateObligationModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [kind, setKind] = useState<'customer_debt' | 'bill' | 'supplier_debt'>('customer_debt');
  const [customerId, setCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('14');
  const [customerDebtSummary, setCustomerDebtSummary] = useState<CustomerDebtSummary | null>(null);
  const [syncExistingDebts, setSyncExistingDebts] = useState<boolean>(false);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCustomerId = preselectedCustomer?.id || customerId;
  const targetBiz = businessId || activeBusinessId;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount('');
      setReference('');
      setDescription('');
      setPayeeName('');
      setCustomerSearch('');
      setSyncExistingDebts(false);

      // Default to +14 days
      setDueDate(getPresetDate(14));
      setSelectedPreset('14');

      if (preselectedCustomer) {
        setKind('customer_debt');
        setCustomerId(preselectedCustomer.id);
        if (preselectedCustomer.business_id) {
          setBusinessId(preselectedCustomer.business_id);
        }
      } else {
        setCustomerId('');
        setSupplierId('');
        if (!isMasterView && activeBusinessId) {
          setBusinessId(activeBusinessId);
        } else if (businesses.length > 0) {
          setBusinessId(businesses[0].id || businesses[0].code);
        }
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses, preselectedCustomer]);

  // Load customers for the chosen business if no customer pre-selected
  useEffect(() => {
    async function loadBizCustomers() {
      const currentBiz = businessId || activeBusinessId;
      if (!currentBiz || preselectedCustomer) {
        return;
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('customers')
          .select('id, customer_no, full_name, nickname, phone')
          .eq('business_id', currentBiz)
          .eq('is_active', true)
          .order('full_name');

        if (data) {
          setCustomers(data as CustomerOption[]);
          if (data.length > 0 && !customerId) {
            setCustomerId(data[0].id);
          }
        }
      } catch {
        setCustomers([]);
      }
    }

    if (isOpen && kind === 'customer_debt' && !preselectedCustomer) {
      loadBizCustomers();
    }
  }, [isOpen, businessId, activeBusinessId, kind, preselectedCustomer, customerId]);

  // Load existing active debt summary for the selected customer
  useEffect(() => {
    async function loadDebtSummary() {
      if (!isOpen || kind !== 'customer_debt' || !targetBiz || !effectiveCustomerId) {
        setCustomerDebtSummary(null);
        return;
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('obligations')
          .select('id, balance_minor, due_date, issue_date, status')
          .eq('business_id', targetBiz)
          .eq('customer_id', effectiveCustomerId)
          .in('status', ['open', 'partially_paid'])
          .gt('balance_minor', 0)
          .in('kind', ['customer_debt', 'loan']);

        if (!data || data.length === 0) {
          setCustomerDebtSummary(null);
          return;
        }

        let totalBal = 0;
        const validDueDates: string[] = [];
        data.forEach((d) => {
          totalBal += Number(d.balance_minor || 0);
          const anchor = d.due_date || d.issue_date;
          if (anchor) validDueDates.push(anchor);
        });

        validDueDates.sort();
        const earliest = validDueDates[0] || null;
        const latest = validDueDates[validDueDates.length - 1] || null;

        const todayStr = new Date().toISOString().split('T')[0];
        const todayDate = new Date(`${todayStr}T00:00:00Z`);
        let isOverdue = false;
        let daysDiff = 0;

        if (earliest) {
          const earliestDate = new Date(`${earliest}T00:00:00Z`);
          const diff = Math.round((todayDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diff > 0) {
            isOverdue = true;
            daysDiff = diff;
          } else {
            daysDiff = diff;
          }
        }

        setCustomerDebtSummary({
          count: data.length,
          totalBalanceMinor: totalBal,
          earliestDueDate: earliest,
          latestDueDate: latest,
          isOverdue,
          daysDiff,
        });
      } catch {
        setCustomerDebtSummary(null);
      }
    }

    loadDebtSummary();
  }, [isOpen, kind, targetBiz, effectiveCustomerId]);

  // Load suppliers for chosen business when kind === 'supplier_debt'
  useEffect(() => {
    async function loadBizSuppliers() {
      const currentBiz = businessId || activeBusinessId;
      if (!currentBiz) return;

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('suppliers')
          .select('id, supplier_no, name, phone, payment_terms_days')
          .eq('business_id', currentBiz)
          .eq('is_active', true)
          .order('name');

        if (data) {
          setSuppliers(data as SupplierOption[]);
          if (data.length > 0 && !supplierId) {
            setSupplierId(data[0].id);
            setPayeeName(data[0].name);
            if (data[0].payment_terms_days > 0) {
              setDueDate(getPresetDate(data[0].payment_terms_days));
              setSelectedPreset(String(data[0].payment_terms_days));
            }
          }
        }
      } catch {
        setSuppliers([]);
      }
    }

    if (isOpen && kind === 'supplier_debt') {
      loadBizSuppliers();
    }
  }, [isOpen, businessId, activeBusinessId, kind, supplierId]);

  // Filtered customer list for the search dropdown
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.customer_no?.toLowerCase().includes(q) ||
        c.nickname?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [customers, customerSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetBiz) {
      setError('Please select a business');
      return;
    }

    const minorUnits = parse_kes(amount);
    if (minorUnits <= 0n) {
      setError('Please enter a positive amount');
      return;
    }

    if (kind === 'customer_debt' && !effectiveCustomerId) {
      setError('Please select a customer (or add one first)');
      return;
    }

    const effectivePayee = kind === 'supplier_debt'
      ? (suppliers.find((s) => s.id === supplierId)?.name || payeeName.trim())
      : payeeName.trim();

    if (kind !== 'customer_debt' && !effectivePayee) {
      setError('Payee or supplier name is required');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      // 1. Create the new obligation
      const { error: rpcError } = await supabase.rpc('create_obligation', {
        p_business: targetBiz,
        p_kind: kind,
        p_amount_minor: minorUnits.toString(),
        p_customer: kind === 'customer_debt' ? effectiveCustomerId : null,
        p_supplier: kind === 'supplier_debt' ? (supplierId || null) : null,
        p_staff: null,
        p_category: null,
        p_payee: kind !== 'customer_debt' ? effectivePayee : null,
        p_description: description.trim() || null,
        p_reference: reference.trim() || null,
        p_issue_date: today,
        p_due_date: dueDate || null,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to create record');
      }

      // 2. If requested, synchronize all existing open debts to this adjusted due date
      if (
        kind === 'customer_debt' &&
        syncExistingDebts &&
        customerDebtSummary &&
        customerDebtSummary.count > 0 &&
        dueDate
      ) {
        try {
          await fetch('/api/obligations/due-date', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessId: targetBiz,
              customerId: effectiveCustomerId,
              dueDate,
              syncAllCustomerDebts: true,
            }),
          });
        } catch (syncErr) {
          console.error('Failed to sync existing open debts to adjusted due date:', syncErr);
        }
      }

      // 3. Trigger SMS queue worker in background to deliver instant credit sale SMS
      if (kind === 'customer_debt') {
        fetch('/api/sms/dispatch', { method: 'POST' }).catch(() => {});
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create invoice / debt record');
    } finally {
      setIsLoading(false);
    }
  };

  const diffDays = getDaysDiffFromToday(dueDate);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        preselectedCustomer
          ? `Issue Goods on Credit — ${preselectedCustomer.full_name}`
          : 'Record New Invoice / Debt'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Business Selector (only if not fixed by preselectedCustomer) */}
        {isMasterView && businesses.length > 0 && !preselectedCustomer && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Business
            </label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-colors"
              required
            >
              {businesses.map((b) => (
                <option key={b.id || b.code} value={b.id || b.code} className="bg-white text-slate-900">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Kind selector (Customer Debt vs Supplier Debt vs Bill) */}
        {!preselectedCustomer && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Obligation Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'customer_debt', label: 'Credit Sale (Customer)' },
                { id: 'supplier_debt', label: 'Supplier Debt' },
                { id: 'bill', label: 'General Bill / Expense' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKind(tab.id as 'customer_debt' | 'bill' | 'supplier_debt')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                    kind === tab.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic party selector based on kind */}
        {preselectedCustomer ? (
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Billing Customer
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {preselectedCustomer.full_name} ({preselectedCustomer.customer_no})
                </span>
                {preselectedCustomer.phone && (
                  <span className="text-[11px] text-slate-500 font-mono block">
                    {fmt_phone(preselectedCustomer.phone)}
                  </span>
                )}
              </div>
              {preselectedCustomer.outstanding_minor !== undefined && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Current Debt
                  </span>
                  <span className="text-xs font-bold text-amber-700 font-mono">
                    {fmt_kes(preselectedCustomer.outstanding_minor)}
                  </span>
                </div>
              )}
            </div>

            {customerDebtSummary && customerDebtSummary.count > 0 && (
              <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  {customerDebtSummary.count} active debt{customerDebtSummary.count === 1 ? '' : 's'} ({fmt_kes(customerDebtSummary.totalBalanceMinor)})
                </span>
                <span className={`font-semibold ${customerDebtSummary.isOverdue ? 'text-rose-600' : 'text-slate-700'}`}>
                  Due: {fmt_date(customerDebtSummary.earliestDueDate)} {customerDebtSummary.isOverdue ? `(${customerDebtSummary.daysDiff}d overdue)` : `(in ${-customerDebtSummary.daysDiff}d)`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <>
            {kind === 'customer_debt' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Customer *
                </label>
                {customers.length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    No customers found for this business. Please add a customer first.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {customers.length > 4 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                    )}
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-colors"
                      required
                    >
                      {filteredCustomers.length === 0 ? (
                        <option value="" disabled>No customer matches search</option>
                      ) : (
                        filteredCustomers.map((c) => (
                          <option key={c.id} value={c.id} className="bg-white text-slate-900">
                            {c.customer_no} — {c.full_name} {c.nickname ? `(${c.nickname})` : ''} {c.phone ? `• ${fmt_phone(c.phone)}` : ''}
                          </option>
                        ))
                      )}
                    </select>

                    {customerDebtSummary && customerDebtSummary.count > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>
                            Has <strong>{customerDebtSummary.count}</strong> open debt{customerDebtSummary.count === 1 ? '' : 's'} (<strong>{fmt_kes(customerDebtSummary.totalBalanceMinor)}</strong>)
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-amber-800">
                          Due: {fmt_date(customerDebtSummary.earliestDueDate)} {customerDebtSummary.isOverdue ? `(${customerDebtSummary.daysDiff}d overdue)` : `(in ${-customerDebtSummary.daysDiff}d)`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : kind === 'supplier_debt' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Supplier / Vendor *
                </label>
                {suppliers.length === 0 ? (
                  <div className="space-y-2">
                    <Input
                      label="Supplier Name"
                      type="text"
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <select
                    value={supplierId}
                    onChange={(e) => {
                      setSupplierId(e.target.value);
                      const s = suppliers.find((x) => x.id === e.target.value);
                      if (s) {
                        setPayeeName(s.name);
                        if (s.payment_terms_days > 0) {
                          setDueDate(getPresetDate(s.payment_terms_days));
                          setSelectedPreset(String(s.payment_terms_days));
                        }
                      }
                    }}
                    className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-colors"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id} className="bg-white text-slate-900">
                        {s.supplier_no ? `${s.supplier_no} — ` : ''}{s.name} {s.phone ? `• ${fmt_phone(s.phone)}` : ''} ({s.payment_terms_days === 0 ? 'Cash' : `${s.payment_terms_days}d credit`})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <Input
                label="Payee Name"
                type="text"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                required
              />
            )}
          </>
        )}

        {/* Amount */}
        <Input
          label="Amount (KSh)"
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />

        {/* Flexible Adjusted Due Date Controls */}
        <div className="space-y-2 rounded-xl border border-slate-200/90 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
              Adjusted Payment Due Date *
            </label>
            {diffDays !== null && (
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  diffDays < 0
                    ? 'bg-rose-100 text-rose-700'
                    : diffDays === 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {diffDays < 0
                  ? `${Math.abs(diffDays)}d overdue`
                  : diffDays === 0
                  ? 'Due today'
                  : `In ${diffDays} day${diffDays === 1 ? '' : 's'}`}
              </span>
            )}
          </div>

          {/* Quick preset pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {customerDebtSummary?.earliestDueDate && (
              <button
                type="button"
                onClick={() => {
                  setDueDate(customerDebtSummary.earliestDueDate!);
                  setSelectedPreset('existing');
                }}
                className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  selectedPreset === 'existing'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Align Existing ({fmt_date(customerDebtSummary.earliestDueDate)})
              </button>
            )}

            {[
              { id: '7', label: '+7 Days', days: 7 },
              { id: '14', label: '+14 Days', days: 14 },
              { id: '21', label: '+21 Days', days: 21 },
              { id: '30', label: '+30 Days', days: 30 },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setDueDate(getPresetDate(p.days));
                  setSelectedPreset(p.id);
                }}
                className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                  selectedPreset === p.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setDueDate(getEndOfMonthDate());
                setSelectedPreset('month_end');
              }}
              className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                selectedPreset === 'month_end'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              End of Month
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Input
              label="Selected Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setSelectedPreset('custom');
              }}
              required
            />

            <Input
              label="Invoice / Ref (Optional)"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* Synchronize existing customer open debts option */}
          {kind === 'customer_debt' && customerDebtSummary && customerDebtSummary.count > 0 && (
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 cursor-pointer transition-colors mt-2">
              <input
                type="checkbox"
                checked={syncExistingDebts}
                onChange={(e) => setSyncExistingDebts(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
              />
              <div className="flex-1">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-emerald-600" />
                  Synchronize all {customerDebtSummary.count} open debts to this adjusted due date
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Aligns previous debts to {fmt_date(dueDate)} so the customer has a single common due date for their total balance ({fmt_kes(customerDebtSummary.totalBalanceMinor)} + new debt).
                </span>
              </div>
            </label>
          )}
        </div>

        <Input
          label="Goods Description / Notes"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* SMS notice for customer debt */}
        {kind === 'customer_debt' && (
          <p className="text-[11px] text-slate-400">
            An SMS confirmation with updated balance and payment details will be sent automatically.
          </p>
        )}

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-slate-200 bg-white pt-3 pb-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Record Invoice
          </Button>
        </div>
      </form>
    </Modal>
  );
}
