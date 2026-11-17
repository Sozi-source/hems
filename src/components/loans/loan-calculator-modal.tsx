'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import {
  calculateLoanPreview,
  CalculatorFrequency,
  InterestMethod,
} from '@/lib/loans/amortization';
import { fmt_date } from '@/lib/format';
import { Calculator, ArrowRight } from 'lucide-react';

interface LoanCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseInNewLoan?: (prefill: {
    amount: string;
    annualRatePct: string;
    periodMonths: string;
    method: InterestMethod;
  }) => void;
}

export function LoanCalculatorModal({
  isOpen,
  onClose,
  onUseInNewLoan,
}: LoanCalculatorModalProps) {
  const [amount, setAmount] = useState('500000');
  const [method, setMethod] = useState<InterestMethod>('reducing_balance');
  const [frequency, setFrequency] = useState<CalculatorFrequency>('yearly');
  const [periodMonths, setPeriodMonths] = useState('12');
  const [interestRate, setInterestRate] = useState('14');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calculateLoanPreview> | null>(null);

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const amt = Number(amount);
    const months = Number(periodMonths);
    const rate = Number(interestRate);

    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid loan amount greater than zero.');
      return;
    }
    if (!Number.isInteger(months) || months <= 0 || months > 600) {
      setError('Enter a whole number of months between 1 and 600.');
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 500) {
      setError('Enter a valid interest rate.');
      return;
    }

    const preview = calculateLoanPreview({
      amountMinor: Math.round(amt * 100),
      annualRatePct: rate,
      periodMonths: months,
      method,
      frequency,
    });
    setResult(preview);
  }

  const effectiveAnnualRate =
    frequency === 'yearly' ? interestRate : String(Number(interestRate || 0) * 12);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-[#185D2D]" />
          <span>Loan Calculator</span>
        </div>
      }
      description="Estimate monthly instalments, total interest, and amortization schedule before committing."
      maxWidth="2xl"
    >
      <form onSubmit={handleCalculate} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A] font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Amount (KSh)
          </label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#185D2D]/20 focus:border-[#185D2D]"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Calculation Method
            </span>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="calcMethod"
                  checked={method === 'reducing_balance'}
                  onChange={() => setMethod('reducing_balance')}
                  className="accent-[#185D2D] w-4 h-4"
                />
                <span>Reducing</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="calcMethod"
                  checked={method === 'flat'}
                  onChange={() => setMethod('flat')}
                  className="accent-[#185D2D] w-4 h-4"
                />
                <span>Flat</span>
              </label>
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Rate Frequency
            </span>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="calcFreq"
                  checked={frequency === 'monthly'}
                  onChange={() => setFrequency('monthly')}
                  className="accent-[#185D2D] w-4 h-4"
                />
                <span>Monthly</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="calcFreq"
                  checked={frequency === 'yearly'}
                  onChange={() => setFrequency('yearly')}
                  className="accent-[#185D2D] w-4 h-4"
                />
                <span>Yearly</span>
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Period (In Months)
            </label>
            <input
              type="number"
              min="1"
              max="600"
              step="1"
              value={periodMonths}
              onChange={(e) => setPeriodMonths(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#185D2D]/20 focus:border-[#185D2D]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Interest Rate (% {frequency === 'monthly' ? 'per month' : 'p.a.'})
            </label>
            <input
              type="number"
              min="0"
              max="500"
              step="0.01"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#185D2D]/20 focus:border-[#185D2D]"
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" className="w-full h-11">
          Calculate
        </Button>
      </form>

      {result && (
        <div className="mt-5 pt-5 border-t border-slate-200 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Monthly Instalment</div>
              <div className="text-lg font-bold text-[#14231A] mt-0.5">
                <MoneyDisplay minorUnits={result.monthly_instalment_minor} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Interest</div>
              <div className="text-lg font-bold text-amber-700 mt-0.5">
                <MoneyDisplay minorUnits={result.total_interest_minor} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Total Payable</div>
              <div className="text-lg font-bold text-[#185D2D] mt-0.5">
                <MoneyDisplay minorUnits={result.total_payable_minor} />
              </div>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3 font-semibold">#</th>
                  <th className="py-2 px-3 font-semibold">Due Date</th>
                  <th className="py-2 px-3 font-semibold text-right">Opening</th>
                  <th className="py-2 px-3 font-semibold text-right">Interest</th>
                  <th className="py-2 px-3 font-semibold text-right">Principal</th>
                  <th className="py-2 px-3 font-semibold text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((r) => (
                  <tr key={r.instalment_no} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 font-medium text-slate-700">{r.instalment_no}</td>
                    <td className="py-2 px-3 text-slate-600">{fmt_date(r.due_date)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <MoneyDisplay minorUnits={r.opening_balance_minor} showCents={false} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-amber-700">
                      <MoneyDisplay minorUnits={r.interest_minor} showCents={false} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                      <MoneyDisplay minorUnits={r.principal_minor} showCents={false} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      <MoneyDisplay minorUnits={r.closing_balance_minor} showCents={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onUseInNewLoan && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onUseInNewLoan({
                    amount,
                    annualRatePct: effectiveAnnualRate,
                    periodMonths,
                    method,
                  });
                  onClose();
                }}
              >
                <span>Register as Business Loan</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
