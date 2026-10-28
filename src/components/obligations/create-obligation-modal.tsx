'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes, fmt_kes, fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Plus, Search } from 'lucide-react';

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
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount('');
      setReference('');
      setDescription('');
      setPayeeName('');
      setCustomerSearch('');

      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().split('T')[0]);

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
      const targetBiz = businessId || activeBusinessId;
      if (!targetBiz || preselectedCustomer) {
        return;
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('customers')
          .select('id, customer_no, full_name, nickname, phone')
          .eq('business_id', targetBiz)
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

  // Load suppliers for chosen business when kind === 'supplier_debt'
  useEffect(() => {
    async function loadBizSuppliers() {
      const targetBiz = businessId || activeBusinessId;
      if (!targetBiz) return;

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('suppliers')
          .select('id, supplier_no, name, phone, payment_terms_days')
          .eq('business_id', targetBiz)
          .eq('is_active', true)
          .order('name');

        if (data) {
          setSuppliers(data as SupplierOption[]);
          if (data.length > 0 && !supplierId) {
            setSupplierId(data[0].id);
            setPayeeName(data[0].name);
            if (data[0].payment_terms_days > 0) {
              const d = new Date();
              d.setDate(d.getDate() + data[0].payment_terms_days);
              setDueDate(d.toISOString().split('T')[0]);
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

    const targetBiz = businessId || activeBusinessId;
    if (!targetBiz) {
      setError('Please select a business');
      return;
    }

    const minorUnits = parse_kes(amount);
    if (minorUnits <= 0n) {
      setError('Please enter a positive amount');
      return;
    }

    const effectiveCustomerId = preselectedCustomer?.id || customerId;
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

      // If customer debt, automatically trigger SMS queue worker in background
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
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between">
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
                          const d = new Date();
                          d.setDate(d.getDate() + s.payment_terms_days);
                          setDueDate(d.toISOString().split('T')[0]);
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

        {/* Due Date & Reference */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          <Input
            label="Invoice / Ref (Optional)"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
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
