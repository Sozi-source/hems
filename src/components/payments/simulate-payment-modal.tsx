'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, ArrowRight, Building2, UserCheck, Zap } from 'lucide-react';

interface SimulatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomerOption {
  id: string;
  customer_no: string;
  full_name: string;
  phone: string | null;
}

export function SimulatePaymentModal({
  isOpen,
  onClose,
  onSuccess,
}: SimulatePaymentModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [payerName, setPayerName] = useState('John Doe');
  const [payerPhone, setPayerPhone] = useState('254712345678');
  const [accountRef, setAccountRef] = useState('');
  const [amount, setAmount] = useState('1500');
  const [receiptRef, setReceiptRef] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate random M-Pesa receipt ref
  const generateReceipt = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = 'RK';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setReceiptRef(generateReceipt());
      if (!isMasterView && activeBusinessId) {
        setBusinessId(activeBusinessId);
      } else if (businesses.length > 0) {
        setBusinessId(businesses[0].id || businesses[0].code);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  // Load customers for chosen business
  useEffect(() => {
    async function fetchCustomers() {
      const targetBiz = businessId || activeBusinessId;
      if (!targetBiz) return;

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('customers')
          .select('id, customer_no, full_name, phone')
          .eq('business_id', targetBiz)
          .order('full_name');

        if (data) {
          setCustomers(data as CustomerOption[]);
          if (data.length > 0) {
            setSelectedCustomerId(data[0].id);
            setPayerName(data[0].full_name);
            setPayerPhone(data[0].phone || '254712345678');
            setAccountRef(data[0].customer_no);
          }
        }
      } catch {
        setCustomers([]);
      }
    }

    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen, businessId, activeBusinessId]);

  const handleCustomerChange = (custUserId: string) => {
    setSelectedCustomerId(custUserId);
    const found = customers.find((c) => c.id === custUserId);
    if (found) {
      setPayerName(found.full_name);
      setPayerPhone(found.phone || '254712345678');
      setAccountRef(found.customer_no);
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const minor = parse_kes(amount);
    if (minor <= 0n) {
      setError('Amount must be positive');
      return;
    }

    setIsLoading(true);

    try {
      if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Amount is outside the supported range');
      }

      const res = await fetch('/api/payments/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId,
          customerId: selectedCustomerId,
          transactionRef: receiptRef.trim().toUpperCase(),
          amountMinor: Number(minor),
          payerName: payerName.trim(),
          payerPhone: payerPhone.trim(),
          accountReference: accountRef.trim(),
        }),
      });

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Simulation failed');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to simulate payment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Simulate M-Pesa Payment" maxWidth="md">
      <form onSubmit={handleSimulate} className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          Simulate an incoming Daraja C2B webhook payload for testing validation, reconciliation, and ledger credit.
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Card 1: Context & Customer Association */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
          {isMasterView && businesses.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Receiving Business Ledger
              </label>
              <select
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
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

          {customers.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                Select Existing Customer (Quick Fill)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white text-slate-900">
                    {c.customer_no} — {c.full_name} ({c.phone || 'No phone'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Card 2: Transaction Payload Parameters */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Payload Attributes
          </span>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Payer Name"
              type="text"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              className="bg-white h-9 text-xs"
              required
            />

            <Input
              label="Payer Phone"
              type="text"
              value={payerPhone}
              onChange={(e) => setPayerPhone(e.target.value)}
              className="bg-white h-9 text-xs font-mono"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount (KSh)"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-white h-9 text-xs font-semibold"
              required
            />

            <Input
              label="Account / BillRef"
              type="text"
              value={accountRef}
              onChange={(e) => setAccountRef(e.target.value)}
              className="bg-white h-9 text-xs"
            />
          </div>

          <Input
            label="Simulated Receipt Reference"
            type="text"
            value={receiptRef}
            onChange={(e) => setReceiptRef(e.target.value)}
            className="bg-white h-9 text-xs font-mono uppercase"
            required
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            <Zap className="w-3.5 h-3.5 mr-1" />
            Simulate Ingest
          </Button>
        </div>
      </form>
    </Modal>
  );
}
