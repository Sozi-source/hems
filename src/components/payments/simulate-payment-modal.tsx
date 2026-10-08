'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

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
      } else if (businesses.length > 0 && businesses[0].id) {
        setBusinessId(businesses[0].id);
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
      const wholeKes = (Number(minor) / 100).toFixed(2);
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      // Construct official Daraja C2B confirmation payload
      const payload = {
        TransactionType: 'Pay Bill',
        TransID: receiptRef.trim().toUpperCase(),
        TransTime: timeStr,
        TransAmount: wholeKes,
        BusinessShortCode: process.env.DARAJA_SHORTCODE || '174379',
        BillRefNumber: accountRef.trim(),
        InvoiceNumber: '',
        OrgAccountBalance: '',
        ThirdPartyTransID: '',
        MSISDN: payerPhone.trim(),
        FirstName: payerName.split(' ')[0] || 'Customer',
        MiddleName: '',
        LastName: payerName.split(' ').slice(1).join(' ') || '',
        business_id: businessId || null,
      };

      const res = await fetch('/api/daraja/c2b/confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();

      if (resData.ResultCode !== 0) {
        throw new Error(resData.ResultDesc || 'Simulation failed');
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
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Business Selector */}
        {isMasterView && businesses.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Receiving Business
            </label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
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

        {/* Customer Quick Fill */}
        {customers.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Select Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="flex h-10 w-full rounded-fintech border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id} className="bg-white text-slate-900">
                  {c.customer_no} — {c.full_name} ({c.phone || 'No phone'})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Payer Name"
            type="text"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            required
          />

          <Input
            label="Payer Phone"
            type="text"
            value={payerPhone}
            onChange={(e) => setPayerPhone(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount (KSh)"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <Input
            label="Account Number (BillRef)"
            type="text"
            placeholder="e.g. C0001"
            value={accountRef}
            onChange={(e) => setAccountRef(e.target.value)}
          />
        </div>

        <Input
          label="Receipt Reference"
          type="text"
          value={receiptRef}
          onChange={(e) => setReceiptRef(e.target.value)}
          required
        />

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            Simulate Ingest
          </Button>
        </div>
      </form>
    </Modal>
  );
}
