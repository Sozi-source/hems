'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { AlertCircle, UserPlus, Building2 } from 'lucide-react';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCustomerModal({ isOpen, onClose, onSuccess }: AddCustomerModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFullName('');
      setNickname('');
      setPhone('');
      setCreditLimit('');
      if (!isMasterView && activeBusinessId) {
        setBusinessId(activeBusinessId);
      } else if (businesses.length > 0) {
        setBusinessId(businesses[0].id || businesses[0].code);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetBiz = businessId || activeBusinessId;
    if (!targetBiz) {
      setError('Please select a business');
      return;
    }

    const cleanName = fullName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 120) {
      setError('Enter a customer name between 2 and 120 characters.');
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phone.trim() && !(
      /^0[17]\d{8}$/.test(phoneDigits) ||
      /^254[17]\d{8}$/.test(phoneDigits) ||
      /^[17]\d{8}$/.test(phoneDigits)
    )) {
      setError('Enter a valid Kenyan phone number, such as 0712345678 or 254712345678.');
      return;
    }

    setIsLoading(true);

    try {
      const cleanLimit = creditLimit.trim();
      if (cleanLimit && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleanLimit)) {
        throw new Error('Enter a valid credit limit, such as 1000 or 1,000.00.');
      }
      const parsedLimit = cleanLimit ? parse_kes(cleanLimit) : 0n;
      if (parsedLimit < 0n || parsedLimit > 9223372036854775807n) {
        throw new Error('Credit limit must be between KSh 0 and KSh 92,233,720,368,547,758.07.');
      }

      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBiz,
          fullName: cleanName,
          nickname: nickname.trim() || undefined,
          phone: phone.trim() || undefined,
          creditLimitMinor: cleanLimit ? parsedLimit.toString() : undefined,
        }),
      });

      let resData: any = {};
      const responseText = await res.text();
      try {
        resData = JSON.parse(responseText);
      } catch {
        if (!res.ok) {
          throw new Error('Server error. Please try again.');
        }
      }

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to create customer');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add customer');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Customer" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector */}
        {isMasterView && businesses.length > 0 && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-1.5 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Target Business Ledger
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

        {/* Card 1: Identity & Nickname */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
          <Input
            label="Official Full Name *"
            type="text"
            placeholder="e.g. Wanjiku Kamau or Norah Chelangat"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Phonebook Nickname / Alias (Optional)"
            type="text"
            placeholder="e.g. Mama Brian, Kipkorir Mulot, Fundi John"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <p className="text-[11px] text-slate-500 leading-normal -mt-1.5">
            How they are saved in your phone. Incoming payment alerts with this nickname or phone will auto-match this customer.
          </p>
        </div>

        {/* Card 2: Contact & Credit Settings */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <Input
            label="Phone Number"
            type="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-white font-mono text-xs"
          />

          <Input
            label="Credit Limit (Optional, KSh)"
            type="text"
            placeholder="0.00"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            className="bg-white text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Save Customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
