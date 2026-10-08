'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

interface CreateObligationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomerOption {
  id: string;
  customer_no: string;
  full_name: string;
}

export function CreateObligationModal({
  isOpen,
  onClose,
  onSuccess,
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set default business
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setAmount('');
      setReference('');
      setDescription('');
      setPayeeName('');
      setCustomerId('');

      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().split('T')[0]);

      if (!isMasterView && activeBusinessId) {
        setBusinessId(activeBusinessId);
      } else if (businesses.length > 0 && businesses[0].id) {
        setBusinessId(businesses[0].id);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  // Load customers for the chosen business
  useEffect(() => {
    async function loadBizCustomers() {
      const targetBiz = businessId || activeBusinessId;
      if (!targetBiz) {
        setCustomers([]);
        return;
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('customers')
          .select('id, customer_no, full_name')
          .eq('business_id', targetBiz)
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

    if (isOpen && kind === 'customer_debt') {
      loadBizCustomers();
    }
  }, [isOpen, businessId, activeBusinessId, kind]);

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

    if (kind === 'customer_debt' && !customerId) {
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

      const { data, error: rpcError } = await supabase.rpc('create_obligation', {
        p_business: targetBiz,
        p_kind: kind,
        p_amount_minor: Number(minorUnits),
        p_customer: kind === 'customer_debt' ? customerId : null,
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

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record entry');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Debt or Bill" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Business Selector */}
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
                <option key={b.id || b.code} value={b.id} className="bg-white text-slate-900">
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
                onClick={() => setKind(tab.id as any)}
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

        {/* Party Selection */}
        {kind === 'customer_debt' ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Customer
            </label>
            {customers.length === 0 ? (
              <div className="text-xs text-amber-800 p-2.5 rounded bg-amber-50 border border-amber-200 font-medium">
                No customers found for this business. Please add a customer first.
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-colors"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white text-slate-900">
                    {c.customer_no} — {c.full_name}
                  </option>
                ))}
              </select>
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
          label="Notes / Description (Optional)"
          type="text"
          placeholder="e.g. 50 Cartons delivered"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={kind === 'customer_debt' && customers.length === 0}
          >
            Create Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}
