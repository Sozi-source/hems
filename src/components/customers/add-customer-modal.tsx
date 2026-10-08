'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCustomerModal({ isOpen, onClose, onSuccess }: AddCustomerModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setFullName('');
      setPhone('');
      setCreditLimit('');
      if (!isMasterView && activeBusinessId) {
        setBusinessId(activeBusinessId);
      } else if (businesses.length > 0 && businesses[0].id) {
        setBusinessId(businesses[0].id);
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

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const insertPayload: Record<string, any> = {
        business_id: targetBiz,
        full_name: fullName.trim(),
      };

      if (phone.trim()) {
        insertPayload.phone = phone.trim();
      }

      if (creditLimit.trim()) {
        const parsedLimit = parse_kes(creditLimit);
        if (parsedLimit > 0n) {
          insertPayload.credit_limit_minor = Number(parsedLimit);
        }
      }

      const { error: insertError } = await supabase
        .from('customers')
        .insert(insertPayload);

      if (insertError) {
        if (insertError.message?.includes('Invalid Kenyan phone number')) {
          throw new Error('Please enter a valid Kenyan phone number (e.g. 0712345678)');
        }
        throw new Error(insertError.message || 'Failed to create customer');
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
          <div className="p-3 rounded-fintech bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Business Selector (shown if in Master view or multiple businesses) */}
        {isMasterView && businesses.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Business
            </label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="flex h-10 w-full rounded-fintech border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-colors"
              required
            >
              {businesses.map((b) => (
                <option key={b.id || b.code} value={b.id} className="bg-surface text-slate-100">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Input
          label="Full Name"
          type="text"
          placeholder="e.g. Wanjiku Kamau"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoFocus
        />

        <Input
          label="Phone Number"
          type="tel"
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint="Accepts 07..., 01..., or 254..."
        />

        <Input
          label="Credit Limit (Optional, KSh)"
          type="text"
          placeholder="0.00"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            Save Customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
