'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { parse_kes, fmt_kes } from '@/lib/format';
import { useBusiness } from '@/context/business-context';
import { parsePaymentAlert, ParsedPaymentAlert } from '@/lib/reconciliation/sms-parser';
import { CheckCircle2, AlertCircle, ArrowRight, Building2, Sparkles } from 'lucide-react';

interface PasteAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PasteAlertModal({
  isOpen,
  onClose,
  onSuccess,
}: PasteAlertModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [targetBusinessId, setTargetBusinessId] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedPaymentAlert | null>(null);

  // Editable overrides
  const [customRef, setCustomRef] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customAccountRef, setCustomAccountRef] = useState('');
  const [customPayerName, setCustomPayerName] = useState('');
  const [customPayerPhone, setCustomPayerPhone] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    paymentId: string;
    outcome: string;
    ruleName?: string;
    confidence?: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRawText('');
      setParsed(null);
      setError(null);
      setSuccessInfo(null);
      setCustomRef('');
      setCustomAmount('');
      setCustomAccountRef('');
      setCustomPayerName('');
      setCustomPayerPhone('');

      if (!isMasterView && activeBusinessId) {
        setTargetBusinessId(activeBusinessId);
      } else if (businesses.length > 0) {
        setTargetBusinessId(businesses[0].id);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  // Reactive parsing when text changes
  const handleTextChange = (text: string) => {
    setRawText(text);
    setError(null);
    setSuccessInfo(null);

    const result = parsePaymentAlert(text);
    setParsed(result);

    if (result) {
      setCustomRef(result.transactionRef);
      setCustomAmount((result.amountMinor / 100).toFixed(2));
      setCustomAccountRef(result.accountReference || '');
      setCustomPayerName(result.payerName || '');
      setCustomPayerPhone(result.payerPhone || '');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBusinessId) {
      setError('Please select a business');
      return;
    }

    const ref = customRef.trim().toUpperCase();
    const minor = parse_kes(customAmount);

    if (!ref) {
      setError('A valid transaction reference code is required');
      return;
    }
    if (minor <= 0n) {
      setError('Amount must be greater than zero');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/sms-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBusinessId,
          rawText: rawText || `Manual entry Ref: ${ref}`,
          overrides: {
            transactionRef: ref,
            amountMinor: Number(minor),
            accountReference: customAccountRef.trim() || undefined,
            payerName: customPayerName.trim() || undefined,
            payerPhone: customPayerPhone.trim() || undefined,
            provider: parsed?.provider || 'bank',
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to record payment');
      }

      setSuccessInfo({
        paymentId: data.paymentId,
        outcome: data.outcome,
        ruleName: data.match?.ruleName,
        confidence: data.match?.confidence,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error saving payment');
    } finally {
      setIsLoading(false);
    }
  };

  const detectedLabel = parsed
    ? parsed.detectedFormat === 'mpesa_c2b'
      ? 'Safaricom M-Pesa'
      : parsed.detectedFormat === 'equity_credit'
      ? 'Equity Bank'
      : parsed.detectedFormat === 'ncba_credit'
      ? 'NCBA Bank'
      : parsed.detectedFormat === 'absa_credit'
      ? 'ABSA Bank'
      : 'Standard Bank Alert'
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Paste Payment Notification"
      maxWidth="md"
    >
      <form onSubmit={handleRecordPayment} className="space-y-4 text-sm">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          Paste any SMS alert received from M-Pesa, Equity Bank, or ABSA. Details are parsed and verified instantly.
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector (if multi-entity) */}
        {businesses.length > 1 && !successInfo && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-1.5 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Target Business Ledger
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!successInfo ? (
          <>
            {/* Card 1: Alert Text Input */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Raw SMS / Message Text
                </label>
                {detectedLabel && (
                  <Badge variant="neutral" dot className="bg-slate-100 text-slate-800 border-slate-200 text-[11px]">
                    {detectedLabel}
                  </Badge>
                )}
              </div>
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors placeholder:text-slate-400"
              />
            </div>

            {/* Card 2: Extracted Values Card */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                Extracted Transaction Attributes
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Receipt Ref *
                  </label>
                  <Input
                    value={customRef}
                    onChange={(e) => setCustomRef(e.target.value.toUpperCase())}
                    className="bg-white font-mono uppercase text-xs h-9"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Amount (KES) *
                  </label>
                  <Input
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="bg-white font-semibold text-xs h-9 text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Customer / BillRef
                  </label>
                  <Input
                    value={customAccountRef}
                    onChange={(e) => setCustomAccountRef(e.target.value)}
                    className="bg-white text-xs h-9"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Payer Name
                  </label>
                  <Input
                    value={customPayerName}
                    onChange={(e) => setCustomPayerName(e.target.value)}
                    className="bg-white text-xs h-9"
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Success Card */
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Payment Recorded Successfully
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Transaction <strong className="font-mono text-slate-800">{customRef}</strong> of{' '}
                <strong className="text-slate-900">{fmt_kes(Number(parse_kes(customAmount)))}</strong> was committed to the ledger.
              </p>
            </div>

            {successInfo.ruleName && successInfo.ruleName !== 'unmatched' && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                  Auto-matched via {successInfo.ruleName.replace(/_/g, ' ')}
                </span>
                <Badge variant="neutral" dot className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[11px]">
                  {successInfo.confidence}% Score
                </Badge>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            {successInfo ? 'Close' : 'Cancel'}
          </Button>

          {!successInfo && (
            <Button
              variant="primary"
              size="sm"
              type="submit"
              isLoading={isLoading}
              disabled={!customRef || !customAmount}
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              Save Payment
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
