'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useBusiness } from '@/context/business-context';
import { parse_kes, fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Search, UserCheck } from 'lucide-react';

export interface PreselectedCustomer {
  id: string;
  business_id?: string;
  customer_no: string;
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
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state whenever modal opens or customer changes
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

    if (kind !== 'customer_debt' && !payeeName.trim()) {
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
        p_supplier: null,
        p_staff: null,
        p_category: null,
        p_payee: kind !== 'customer_debt' ? payeeName.trim() : null,
        p_description: description.trim() || null,
        p_reference: reference.trim() || null,
        p_issue_date: today,
        p_due_date: dueDate || null,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to create record');
      }

      // Trigger instant background SMS dispatch for this debt
      fetch('/api/sms/dispatch', { method: 'POST' }).catch(() => {});

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record entry';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle = preselectedCustomer
    ? `Add Goods on Credit — ${preselectedCustomer.full_name}`
    : 'New Debt or Bill';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Preselected Customer Summary */}
        {preselectedCustomer ? (
          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-semibold text-slate-900 text-sm truncate">
                  {preselectedCustomer.full_name}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  ({preselectedCustomer.customer_no})
                </span>
                {preselectedCustomer.nickname && (
                  <span className="text-xs text-slate-400">
                    · {preselectedCustomer.nickname}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {preselectedCustomer.phone ? fmt_phone(preselectedCustomer.phone) : 'No phone recorded'}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                Current Debt
              </span>
              <span className="text-sm font-bold font-mono text-slate-900">
                KES {(((preselectedCustomer.outstanding_minor || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Business Selector (only if not preselected) */}
            {isMasterView && businesses.length > 0 && (
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

            {/* Kind / Type selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'customer_debt', label: 'Customer Debt' },
                  { id: 'bill', label: 'Bill / Expense' },
                  { id: 'supplier_debt', label: 'Supplier Debt' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setKind(tab.id as 'customer_debt' | 'bill' | 'supplier_debt')}
                    className={`py-2 px-2 text-center text-xs font-semibold rounded-fintech transition-all border ${
                      kind === tab.id
                        ? 'bg-[#0F172A] text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Party Selection with Search */}
            {kind === 'customer_debt' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Customer
                  </label>
                  {customers.length > 5 && (
                    <span className="text-[11px] text-slate-500">
                      {filteredCustomers.length} of {customers.length}
                    </span>
                  )}
                </div>

                {customers.length === 0 ? (
                  <div className="text-xs text-amber-800 p-2.5 rounded bg-amber-50 border border-amber-200 font-medium">
                    No customers found for this business. Please add a customer first.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {customers.length > 4 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search customer by name, account #, phone..."
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
            ) : (
              <Input
                label="Payee / Supplier Name"
                type="text"
                placeholder={kind === 'bill' ? 'e.g. Kenya Power, Landlord' : 'e.g. Acme Plastics Ltd'}
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
          placeholder="0.00"
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
            placeholder="Auto-assigned if empty"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>

        <Input
          label="Goods Description / Notes"
          type="text"
          placeholder="e.g. 50 Cartons school shoes delivered on credit"
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
            disabled={kind === 'customer_debt' && !preselectedCustomer && customers.length === 0}
          >
            {kind === 'customer_debt' ? 'Record Debt & Send SMS' : 'Create Record'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
