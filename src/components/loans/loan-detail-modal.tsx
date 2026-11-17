'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_date } from '@/lib/format';
import { Archive, Banknote, CheckCircle2, Edit3, Landmark, RotateCcw } from 'lucide-react';
import { RecordLoanPaymentModal } from './record-loan-payment-modal';

interface LoanDetailModalProps {
  isOpen: boolean;
  loanId: string | null;
  onClose: () => void;
  onEdit: (loan: any) => void;
  onUpdated: () => void;
}

const LOAN_TYPE_LABELS: Record<string, string> = {
  bank_loan: 'Bank Loan',
  asset_financing: 'Asset Financing',
  mobile_loan: 'Mobile Loan',
  other: 'Other Borrowing',
};

export function LoanDetailModal({
  isOpen,
  loanId,
  onClose,
  onEdit,
  onUpdated,
}: LoanDetailModalProps) {
  const [loan, setLoan] = useState<any | null>(null);
  const [instalments, setInstalments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [isRecordPayOpen, setIsRecordPayOpen] = useState(false);
  const [error, setError] = useState('');

  async function loadDetail() {
    if (!loanId) return;
    setLoading(true);
    setError('');
    try {
      const [detailRes, payRes] = await Promise.all([
        fetch(`/api/loans/${loanId}`),
        fetch(`/api/loans/${loanId}/payments`),
      ]);
      const json = await detailRes.json();
      if (!detailRes.ok) {
        setError(json.error || 'Failed to load loan details.');
        return;
      }
      setLoan(json.loan);
      setInstalments(json.instalments || []);
      if (payRes.ok) {
        const payJson = await payRes.json();
        setPayments(payJson.payments || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && loanId) {
      loadDetail();
    }
  }, [isOpen, loanId]);

  async function handleArchiveToggle() {
    if (!loan) return;
    setActionBusy(true);
    try {
      const action = loan.archived_at ? 'unarchive' : 'archive';
      const res = await fetch(`/api/loans/${loan.obligation_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePaymentAction(paymentId: string, action: 'verify' | 'reverse') {
    if (!loan) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/loans/${loan.obligation_id}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await loadDetail();
        onUpdated();
      }
    } finally {
      setActionBusy(false);
    }
  }

  const totalPrincipalRepaid = instalments.reduce((s, r) => s + Number(r.paid_principal_minor || 0), 0);
  const totalInterestPaid = instalments.reduce((s, r) => s + Number(r.paid_interest_minor || 0), 0);
  const totalScheduledInterest = instalments.reduce((s, r) => s + Number(r.interest_minor || 0), 0);
  const outstandingPrincipal = loan ? Math.max(0, Number(loan.principal_minor || 0) - totalPrincipalRepaid) : 0;
  const outstandingInterest = Math.max(0, totalScheduledInterest - totalInterestPaid);
  const nextInstalment = instalments.find((r) => !r.verified_at) || null;
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const pd = loan?.payment_details || {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-[#185D2D]" />
          <span>{loan ? `${loan.lender_name} (${loan.obligations?.reference_no || ''})` : 'Loan Details'}</span>
        </div>
      }
      description={loan ? `${loan.businesses?.name || ''} · ${LOAN_TYPE_LABELS[loan.loan_type] || loan.loan_type}` : ''}
      maxWidth="4xl"
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading loan schedule...</div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A]">
          {error}
        </div>
      ) : loan ? (
        <div className="space-y-5">
          {/* Top action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  loan.loan_status === 'fully_paid'
                    ? 'success'
                    : loan.loan_status === 'defaulted'
                      ? 'danger'
                      : 'info'
                }
                dot
              >
                {loan.loan_status === 'fully_paid'
                  ? 'Fully Paid'
                  : loan.loan_status === 'defaulted'
                    ? 'Defaulted'
                    : 'Active'}
              </Badge>
              {loan.archived_at && <Badge variant="neutral">Archived</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setIsRecordPayOpen(true)}>
                <Banknote className="w-3.5 h-3.5 mr-1.5" />
                Record Payment
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onEdit(loan)}>
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                Edit Terms
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleArchiveToggle}
                disabled={actionBusy}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                {loan.archived_at ? 'Restore' : 'Close / Archive'}
              </Button>
            </div>
          </div>

          {/* Computed Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Outstanding Principal</div>
              <div className="text-base font-bold text-[#14231A] mt-0.5">
                <MoneyDisplay minorUnits={outstandingPrincipal} showCents={false} />
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Interest left: <MoneyDisplay minorUnits={outstandingInterest} showCents={false} size="sm" />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Principal Repaid</div>
              <div className="text-base font-bold text-emerald-700 mt-0.5">
                <MoneyDisplay minorUnits={totalPrincipalRepaid} showCents={false} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Interest Paid</div>
              <div className="text-base font-bold text-amber-700 mt-0.5">
                <MoneyDisplay minorUnits={totalInterestPaid} showCents={false} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Next Due</div>
              <div className="text-sm font-bold text-[#14231A] mt-0.5">
                {nextInstalment ? fmt_date(nextInstalment.due_date) : 'Cleared'}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">Maturity Date</div>
              <div className="text-sm font-bold text-[#14231A] mt-0.5">
                {fmt_date(loan.maturity_date)}
              </div>
            </div>
          </div>

          {/* Terms & Payment Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="space-y-1">
              <div><span className="font-semibold text-slate-600">Original Amount:</span> <MoneyDisplay minorUnits={loan.principal_minor} /></div>
              <div><span className="font-semibold text-slate-600">Rate & Method:</span> {loan.interest_rate_pct}% p.a. ({loan.interest_method === 'flat' ? 'Flat' : 'Reducing balance'})</div>
              <div><span className="font-semibold text-slate-600">Term:</span> {loan.term_months} months · Due day {loan.repayment_day}</div>
            </div>
            <div className="space-y-1">
              <div><span className="font-semibold text-slate-600">Paybill / Till:</span> {pd.paybill || pd.till || '—'}</div>
              <div><span className="font-semibold text-slate-600">Account No.:</span> {pd.account_number || '—'}</div>
              <div><span className="font-semibold text-slate-600">Bank / Reference:</span> {pd.bank_account || pd.reference || '—'}</div>
            </div>
          </div>

          {/* Amortization Schedule */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Amortization Schedule ({instalments.length} instalments)
            </h4>
            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">#</th>
                    <th className="py-2 px-3 font-semibold">Due Date</th>
                    <th className="py-2 px-3 font-semibold text-right">Opening</th>
                    <th className="py-2 px-3 font-semibold text-right">Instalment</th>
                    <th className="py-2 px-3 font-semibold text-right">Interest</th>
                    <th className="py-2 px-3 font-semibold text-right">Principal</th>
                    <th className="py-2 px-3 font-semibold text-right">Closing</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {instalments.map((inst) => {
                    const isOverdue = !inst.verified_at && inst.due_date < todayStr;
                    return (
                      <tr
                        key={inst.id}
                        className={isOverdue ? 'bg-[#FDECEE]/50' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-2 px-3 font-medium">{inst.instalment_no}</td>
                        <td className="py-2 px-3">{fmt_date(inst.due_date)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          <MoneyDisplay minorUnits={inst.opening_balance_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">
                          <MoneyDisplay minorUnits={inst.instalment_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-amber-700">
                          <MoneyDisplay minorUnits={inst.interest_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                          <MoneyDisplay minorUnits={inst.principal_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          <MoneyDisplay minorUnits={inst.closing_balance_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3">
                          {inst.verified_at ? (
                            <Badge variant="success" size="sm">Verified</Badge>
                          ) : isOverdue ? (
                            <Badge variant="danger" size="sm">Overdue</Badge>
                          ) : inst.paid_minor > 0 ? (
                            <Badge variant="warning" size="sm">Partial</Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">Upcoming</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* Payment History */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Payment History ({payments.length})
            </h4>
            {payments.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                No loan payments recorded yet.
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Date</th>
                      <th className="py-2 px-3 font-semibold">Method / Ref</th>
                      <th className="py-2 px-3 font-semibold text-right">Amount</th>
                      <th className="py-2 px-3 font-semibold text-right">Interest</th>
                      <th className="py-2 px-3 font-semibold text-right">Principal</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id} className={p.reversed_at ? 'opacity-60 bg-slate-50' : ''}>
                        <td className="py-2 px-3">{fmt_date(p.payment_date)}</td>
                        <td className="py-2 px-3">
                          <span className="capitalize">{String(p.method || '').replace('_', ' ')}</span>
                          {p.reference_no ? ` · ${p.reference_no}` : ''}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums">
                          <MoneyDisplay minorUnits={p.amount_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-amber-700">
                          <MoneyDisplay minorUnits={p.interest_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                          <MoneyDisplay minorUnits={p.principal_minor} showCents={false} />
                        </td>
                        <td className="py-2 px-3">
                          {p.reversed_at ? (
                            <Badge variant="neutral" size="sm">Reversed</Badge>
                          ) : p.is_verified ? (
                            <Badge variant="success" size="sm">Verified</Badge>
                          ) : (
                            <Badge variant="warning" size="sm">Unverified</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right space-x-1">
                          {!p.reversed_at && !p.is_verified && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionBusy}
                              onClick={() => handlePaymentAction(p.id, 'verify')}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Verify
                            </Button>
                          )}
                          {!p.reversed_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={actionBusy}
                              onClick={() => handlePaymentAction(p.id, 'reverse')}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <RecordLoanPaymentModal
        isOpen={isRecordPayOpen}
        onClose={() => setIsRecordPayOpen(false)}
        onSuccess={() => {
          loadDetail();
          onUpdated();
        }}
        loan={loan}
        instalments={instalments}
      />
    </Modal>
  );
}
