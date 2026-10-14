'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fmt_kes, parse_kes } from '@/lib/format';
import { useBusiness } from '@/context/business-context';
import { parsePaymentAlert, ParsedPaymentAlert } from '@/lib/reconciliation/sms-parser';
import { MessageSquare, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Paste Payment Alert (SMS / Message)"
      maxWidth="md"
    >
      <p className="text-xs text-slate-600 mb-4 leading-normal">
        Paste any M-Pesa, Equity Bank, or ABSA SMS notification to auto-extract details and reconcile.
      </p>
      <form onSubmit={handleRecordPayment} className="space-y-4 text-sm">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector */}
        {businesses.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Business
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="w-full px-3 py-2 border border-[#DCE5DF] rounded-fintech text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F7A3D]"
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
            {/* Raw Text Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paste SMS / Bank Alert Text
              </label>
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="e.g. QA12BC34DE Confirmed. Ksh1,500.00 received from JOHN DOE... OR Dear Customer, KES 5,000.00 credited from MPESA REF..."
                className="w-full px-3 py-2 border border-[#DCE5DF] rounded-fintech text-xs font-mono bg-[#F8FAF9] focus:outline-none focus:ring-2 focus:ring-[#1F7A3D]"
              />
            </div>

            {/* Auto-detected Badge */}
            {parsed && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Detected:</span>
                <Badge variant="success">
                  {parsed.detectedFormat === 'mpesa_c2b'
                    ? 'Safaricom M-Pesa'
                    : parsed.detectedFormat === 'equity_credit'
                    ? 'Equity Bank Alert'
                    : parsed.detectedFormat === 'absa_credit'
                    ? 'ABSA Bank Alert'
                    : 'Standard Bank Alert'}
                </Badge>
              </div>
            )}

            {/* Extracted Fields (Editable) */}
            <div className="grid grid-cols-2 gap-3 bg-[#F1F5F2] p-3 rounded-fintech border border-[#DCE5DF]">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Transaction Ref Code *
                </label>
                <Input
                  value={customRef}
                  onChange={(e) => setCustomRef(e.target.value.toUpperCase())}
                  placeholder="e.g. QA12BC34DE"
                  className="bg-white font-mono uppercase text-xs h-8"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Amount (KES) *
                </label>
                <Input
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="e.g. 1500.00"
                  className="bg-white font-semibold text-xs h-8 text-[#1F7A3D]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Customer / BillRef
                </label>
                <Input
                  value={customAccountRef}
                  onChange={(e) => setCustomAccountRef(e.target.value)}
                  placeholder="e.g. CUST001 or CD0001"
                  className="bg-white text-xs h-8"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Payer Name
                </label>
                <Input
                  value={customPayerName}
                  onChange={(e) => setCustomPayerName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="bg-white text-xs h-8"
                />
              </div>
            </div>
          </>
        ) : (
          /* Success Screen */
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-fintech text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span>Payment Logged Successfully</span>
            </div>
            <p className="text-xs text-emerald-700">
              Transaction <strong>{customRef}</strong> of{' '}
              <strong>KSh {customAmount}</strong> has been saved.
            </p>
            {successInfo.ruleName && successInfo.ruleName !== 'unmatched' && (
              <div className="mt-2 p-2 bg-white rounded border border-emerald-300 text-xs">
                <span className="font-semibold text-emerald-800">Automated Match:</span>{' '}
                <span className="capitalize">{successInfo.ruleName.replace(/_/g, ' ')}</span>{' '}
                ({successInfo.confidence}% confidence)
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#DCE5DF]">
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
              <ArrowRight className="w-4 h-4 mr-1" />
              Save Payment
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
