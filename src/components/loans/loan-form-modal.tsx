'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { useBusiness } from '@/context/business-context';
import {
  calculateMonthlyInstalmentMinor,
  InterestMethod,
  LoanStatus,
  LoanType,
} from '@/lib/loans/amortization';

interface LoanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialLoan?: any | null;
  prefill?: {
    amount?: string;
    annualRatePct?: string;
    periodMonths?: string;
    method?: InterestMethod;
  } | null;
}

export function LoanFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialLoan,
  prefill,
}: LoanFormModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const isEditing = Boolean(initialLoan);

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  const [businessId, setBusinessId] = useState('');
  const [loanType, setLoanType] = useState<LoanType>('bank_loan');
  const [lenderName, setLenderName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [dateTaken, setDateTaken] = useState(todayIso);
  const [interestRatePct, setInterestRatePct] = useState('14');
  const [interestMethod, setInterestMethod] = useState<InterestMethod>('reducing_balance');
  const [termMonths, setTermMonths] = useState('12');
  const [repaymentDay, setRepaymentDay] = useState('20');
  const [manualOverride, setManualOverride] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [loanStatus, setLoanStatus] = useState<LoanStatus>('active');
  const [paybill, setPaybill] = useState('');
  const [till, setTill] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');

    if (initialLoan) {
      setBusinessId(initialLoan.business_id);
      setLoanType(initialLoan.loan_type || 'bank_loan');
      setLenderName(initialLoan.lender_name || '');
      setPrincipalAmount(String(Number(initialLoan.principal_minor || 0) / 100));
      setDateTaken(initialLoan.date_taken || initialLoan.first_due_date || todayIso);
      setInterestRatePct(String(initialLoan.interest_rate_pct ?? '0'));
      setInterestMethod(initialLoan.interest_method || 'reducing_balance');
      setTermMonths(String(initialLoan.term_months || 12));
      setRepaymentDay(String(initialLoan.repayment_day || 1));
      setManualOverride(Boolean(initialLoan.instalment_overridden));
      setOverrideAmount(
        initialLoan.instalment_overridden && initialLoan.monthly_instalment_minor
          ? String(Number(initialLoan.monthly_instalment_minor) / 100)
          : ''
      );
      setLoanStatus(initialLoan.loan_status || 'active');
      const pd = initialLoan.payment_details || {};
      setPaybill(pd.paybill || '');
      setTill(pd.till || '');
      setAccountNumber(pd.account_number || '');
      setBankAccount(pd.bank_account || '');
      setReference(pd.reference || '');
      setNotes(initialLoan.notes || '');
      return;
    }

    const defaultBiz = !isMasterView && activeBusinessId
      ? activeBusinessId
      : businesses[0]?.id || '';
    setBusinessId(defaultBiz);
    setLoanType('bank_loan');
    setLenderName('');
    setPrincipalAmount(prefill?.amount || '');
    setDateTaken(todayIso);
    setInterestRatePct(prefill?.annualRatePct || '14');
    setInterestMethod(prefill?.method || 'reducing_balance');
    setTermMonths(prefill?.periodMonths || '12');
    setRepaymentDay(String(parseInt(todayIso.slice(8, 10), 10) || 20));
    setManualOverride(false);
    setOverrideAmount('');
    setLoanStatus('active');
    setPaybill('');
    setTill('');
    setAccountNumber('');
    setBankAccount('');
    setReference('');
    setNotes('');
  }, [isOpen, initialLoan, prefill, activeBusinessId, isMasterView, businesses, todayIso]);

  const autoMonthlyInstalmentMinor = useMemo(() => {
    const p = Math.round(Number(principalAmount || 0) * 100);
    const r = Number(interestRatePct || 0);
    const m = Number(termMonths || 0);
    if (p <= 0 || m <= 0 || r < 0) return 0;
    return calculateMonthlyInstalmentMinor(p, r, m, interestMethod);
  }, [principalAmount, interestRatePct, termMonths, interestMethod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const paymentDetails = {
        paybill: paybill.trim() || undefined,
        till: till.trim() || undefined,
        account_number: accountNumber.trim() || undefined,
        bank_account: bankAccount.trim() || undefined,
        reference: reference.trim() || undefined,
      };

      const url = isEditing ? `/api/loans/${initialLoan.obligation_id}` : '/api/loans';
      const method = isEditing ? 'PATCH' : 'POST';

      const payload = isEditing
        ? {
            lenderName,
            loanType,
            interestRatePct: Number(interestRatePct),
            termMonths: Number(termMonths),
            repaymentDay: Number(repaymentDay),
            monthlyInstalmentOverride: manualOverride ? overrideAmount : null,
            loanStatus,
            paymentDetails,
            notes,
          }
        : {
            businessId,
            loanType,
            lenderName,
            principalAmount: Number(principalAmount),
            dateTaken,
            interestRatePct: Number(interestRatePct),
            interestMethod,
            termMonths: Number(termMonths),
            repaymentDay: Number(repaymentDay),
            monthlyInstalmentOverride: manualOverride ? overrideAmount : null,
            paymentDetails,
            notes,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to save loan.');
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Network error while saving loan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Business Loan Terms' : 'Register Business Loan'}
      description={
        isEditing
          ? 'Updating terms recalculates only future unpaid instalments. Recorded payments are preserved.'
          : 'Add a loan taken by a business from a bank, asset financier, or mobile lender.'
      }
      maxWidth="2xl"
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
              Business
            </label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              disabled={isEditing}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-100"
              required
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Loan Type
            </label>
            <select
              value={loanType}
              onChange={(e) => setLoanType(e.target.value as LoanType)}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white"
            >
              <option value="bank_loan">Bank loan</option>
              <option value="asset_financing">Asset financing</option>
              <option value="mobile_loan">Mobile loan</option>
              <option value="other">Other business borrowing</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Bank / Lender Name
            </label>
            <input
              type="text"
              value={lenderName}
              onChange={(e) => setLenderName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Original Loan Amount (KSh)
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              disabled={isEditing}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900 disabled:bg-slate-100"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Date Taken
            </label>
            <input
              type="date"
              value={dateTaken}
              onChange={(e) => setDateTaken(e.target.value)}
              disabled={isEditing}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900 disabled:bg-slate-100"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Interest Rate (% p.a.)
            </label>
            <input
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={interestRatePct}
              onChange={(e) => setInterestRatePct(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Interest Method
            </label>
            <select
              value={interestMethod}
              onChange={(e) => setInterestMethod(e.target.value as InterestMethod)}
              disabled={isEditing}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 bg-white disabled:bg-slate-100"
            >
              <option value="reducing_balance">Reducing balance</option>
              <option value="flat">Flat rate</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Repayment Period (Months)
            </label>
            <input
              type="number"
              min="1"
              max="600"
              step="1"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Repayment Due Day of Month (1–31)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              step="1"
              value={repaymentDay}
              onChange={(e) => setRepaymentDay(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900"
              required
            />
          </div>
        </div>

        {/* Monthly Instalment Preview & Override */}
        <div className="p-3.5 rounded-lg bg-[#F6F8F7] border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-700">
                Calculated Monthly Instalment
              </div>
              <div className="text-base font-bold text-[#185D2D]">
                <MoneyDisplay minorUnits={autoMonthlyInstalmentMinor} />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={manualOverride}
                onChange={(e) => setManualOverride(e.target.checked)}
                className="accent-[#185D2D] w-4 h-4"
              />
              <span>Override monthly instalment</span>
            </label>
          </div>

          {manualOverride && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Manual Monthly Instalment (KSh)
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                required
              />
            </div>
          )}
        </div>

        {/* Account / Payment Details */}
        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs font-semibold text-slate-700 mb-2.5">
            Account / Payment Details (shown in reminders)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Paybill / Till No.
              </label>
              <input
                type="text"
                value={paybill}
                onChange={(e) => setPaybill(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Account / Loan No.
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Bank Account / Reference
              </label>
              <input
                type="text"
                value={bankAccount || reference}
                onChange={(e) => {
                  setBankAccount(e.target.value);
                  setReference(e.target.value);
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>
        </div>

        {isEditing && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Loan Status
            </label>
            <select
              value={loanStatus}
              onChange={(e) => setLoanStatus(e.target.value as LoanStatus)}
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="active">Active</option>
              <option value="fully_paid">Fully paid</option>
              <option value="defaulted">Defaulted</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-300 text-sm text-slate-900"
          />
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={saving}>
            {isEditing ? 'Save Changes' : 'Create Loan & Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
