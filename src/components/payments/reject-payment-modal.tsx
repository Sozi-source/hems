'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmt_kes } from '@/lib/format';
import { PaymentTransaction } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { AlertCircle, Ban } from 'lucide-react';

interface RejectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payment: PaymentTransaction | null;
}

export function RejectPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  payment,
}: RejectPaymentModalProps) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setReason('');
    }
  }, [isOpen]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError('Please provide a reason for rejecting this payment');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: rejectError } = await supabase.rpc('reject_payment', {
        p_payment_id: payment.id,
        p_reason: reason.trim(),
      });

      if (rejectError) {
        throw new Error(rejectError.message || 'Failed to reject payment');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to reject payment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reject Payment" maxWidth="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Payment Summary Card */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
            <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-xs">
              {payment.transaction_ref}
            </span>
            <span className="text-xs font-bold text-slate-900">
              {fmt_kes(payment.amount_minor)}
            </span>
          </div>
          <div className="text-xs text-slate-600 flex justify-between pt-0.5">
            <span className="text-slate-500">Payer:</span>
            <span className="font-medium text-slate-900">{payment.payer_name || 'Customer'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <Input
            label="Reason for Rejection *"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" isLoading={isLoading}>
            <Ban className="w-3.5 h-3.5 mr-1" />
            Confirm Rejection
          </Button>
        </div>
      </form>
    </Modal>
  );
}
