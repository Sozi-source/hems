'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmt_phone, parse_kes, fmt_kes } from '@/lib/format';
import { Smartphone, CheckCircle2 } from 'lucide-react';

interface StkPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  amountMinor: number;
  accountReference: string;
  onSuccess?: () => void;
}

export function StkPromptModal({
  isOpen,
  onClose,
  businessId,
  customerId,
  customerName,
  customerPhone,
  amountMinor,
  accountReference,
  onSuccess,
}: StkPromptModalProps) {
  const [phone, setPhone] = useState(customerPhone || '');
  const [amount, setAmount] = useState((amountMinor / 100).toFixed(2));
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setStatusMessage(null);
      setCheckoutRequestId(null);
      setPhone(customerPhone || '');
      setAmount(amountMinor > 0 ? (amountMinor / 100).toFixed(2) : '');
    }
  }, [isOpen, customerPhone, amountMinor]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    const minor = parse_kes(amount);
    if (minor <= 0n) {
      setError('Amount must be greater than zero');
      return;
    }

    if (!phone.trim()) {
      setError('Customer phone number is required');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/daraja/stk/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          customerId,
          phone: phone.trim(),
          amountMinor: Number(minor),
          accountReference: accountReference || 'HEMS',
          description: 'Invoice Settlement',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send prompt');
      }

      setStatusMessage(data.customerMessage || 'Daraja accepted the request. The customer still needs to receive and respond to the prompt.');
      setCheckoutRequestId(typeof data.checkoutRequestId === 'string' ? data.checkoutRequestId : null);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate STK push');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Prompt M-Pesa PIN" maxWidth="sm">
      <form onSubmit={handleSendPrompt} className="space-y-4">
        {error && (
          <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
            {error}
          </div>
        )}

        {statusMessage ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-900">
              Request Accepted
            </div>
            <p className="text-xs text-slate-600 max-w-xs mx-auto">
              {statusMessage}
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              This confirms Daraja accepted the request; it does not confirm delivery to the phone. Check the customer’s M-Pesa line and request status before retrying.
            </p>
            {checkoutRequestId && (
              <p className="text-[11px] text-slate-500 break-all">
                Checkout request: <span className="font-mono">{checkoutRequestId}</span>
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onClose}
              className="mt-2"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="p-3 rounded-fintech bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">{customerName}</div>
              <div className="text-slate-500 font-mono">Account: {accountReference}</div>
            </div>

            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
              required
            />

            <Input
              label="Amount to Prompt (KSh)"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
                <Smartphone className="w-3.5 h-3.5 mr-1" />
                Send PIN Prompt
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
