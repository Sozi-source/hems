'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parse_kes } from '@/lib/format';
import { Smartphone, CheckCircle2, AlertCircle } from 'lucide-react';

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
    <Modal isOpen={isOpen} onClose={onClose} title="Prompt M-Pesa PIN (STK Push)" maxWidth="sm">
      <form onSubmit={handleSendPrompt} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {statusMessage ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center space-y-3 shadow-xs">
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                STK Prompt Dispatched
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                {statusMessage}
              </p>
            </div>
            {checkoutRequestId && (
              <p className="text-[11px] text-slate-500 break-all font-mono bg-slate-50 p-2 rounded border border-slate-200">
                ID: {checkoutRequestId}
              </p>
            )}
            <div className="pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onClose}
                className="w-full"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Customer Summary Card */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Target Customer
              </span>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">{customerName}</span>
                <span className="text-slate-600 font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                  Ref: {accountReference}
                </span>
              </div>
            </div>

            {/* Input Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
              <Input
                label="Phone Number *"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712345678"
                className="h-9 text-xs font-mono"
                required
              />

              <Input
                label="Amount to Prompt (KSh) *"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 text-xs font-semibold"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
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
