'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaymentTransaction } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

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
          <div className="p-3 rounded-fintech bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="p-3 rounded-fintech bg-surface-elevated border border-surface-border text-xs text-slate-300">
          <div className="font-mono font-bold text-slate-100 mb-1">
            {payment.transaction_ref}
          </div>
          <div>From: {payment.payer_name || 'Customer'}</div>
        </div>

        <Input
          label="Reason for Rejection"
          type="text"
          placeholder="e.g. Erroneous payment, reversed by sender"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          autoFocus
        />

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-surface-border/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" isLoading={isLoading}>
            Confirm Rejection
          </Button>
        </div>
      </form>
    </Modal>
  );
}
