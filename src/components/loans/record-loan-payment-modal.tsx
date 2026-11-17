'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { allocateLoanPayment } from '@/lib/loans/payment-allocation';

interface RecordLoanPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  loan: any | null;
  instalments: any[];
}

export function RecordLoanPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  loan,
  instalments,
}: RecordLoanPaymentModalProps) {
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const nextUnpaid = instalments.find((r) => r.status !== 'paid');
  const defaultAmount = nextUnpaid
    ? String(
        Math.max(
          0,
          Number(nextUnpaid.instalment_minor) - Number(nextUnpaid.paid_minor || 0)
        ) / 100
      )
    : '';

  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState('bank_transfer');
  const [referenceNo, setReferenceNo] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [verifyNow, setVerifyNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setPaymentDate(todayIso);
    setAmount(defaultAmount);
    setMethod('bank_transfer');
    setReferenceNo('');
    setAttachmentUrl('');
    setNotes('');
    setVerifyNow(true);
  }, [isOpen, defaultAmount, todayIso]);

  const splitPreview = useMemo(() => {
    const amtMinor = Math.round(Number(amount || 0) * 100);
    if (!Number.isFinite(amtMinor) || amtMinor <= 0 || instalments.length === 0) {
      return null;
    }
    try {
      return allocateLoanPayment(
        instalments.map((r) => ({
          id: r.id,
          instalment_no: r.instalment_no,
          interest_minor: Number(r.interest_minor),
          principal_minor: Number(r.principal_minor),
          paid_interest_minor: Number(r.paid_interest_minor || 0),
          paid_principal_minor: Number(r.paid_principal_minor || 0),
        })),
        amtMinor
      );
    } catch {
      return null;
    }
  }, [amount, instalments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loan) return;
    setError('');
    setSaving(true);

    try {
      const res = await fetch(`/api/loans/${loan.obligation_id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate,
          amount: Number(amount),
          method,
          referenceNo,
          attachmentUrl,
          notes,
          verifyNow,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to record payment.');
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Network error while recording payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Loan Payment"
      description={loan ? `${loan.lender_name} · ${loan.businesses?.name || loan.business_name || ''}` : ''}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A] font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Amount Paid (KSh)
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm"
              required
            />
          </div>
        </div>

        {splitPreview && (
          <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 font-medium">Allocated to Interest:</span>
              <div className="font-bold text-amber-700 mt-0.5">
                <MoneyDisplay minorUnits={splitPreview.total_interest_minor} />
              </div>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Allocated to Principal:</span>
              <div className="font-bold text-emerald-700 mt-0.5">
                <MoneyDisplay minorUnits={splitPreview.total_principal_minor} />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reference / Receipt No.
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Receipt / Attachment Link (optional)
          </label>
          <input
            type="url"
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={verifyNow}
            onChange={(e) => setVerifyNow(e.target.checked)}
            className="accent-[#185D2D] w-4 h-4 mt-0.5"
          />
          <div className="text-xs">
            <div className="font-semibold text-slate-800">Mark payment as Verified now</div>
            <div className="text-slate-500">
              Reminders for covered instalments stop only once payment is both recorded and verified.
            </div>
          </div>
        </label>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={saving}>
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
