'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { fmt_date } from '@/lib/format';
import { AlertTriangle, BellRing, CalendarClock, Calculator, Landmark, Plus, Search } from 'lucide-react';
import { LoanCalculatorModal } from '@/components/loans/loan-calculator-modal';
import { LoanFormModal } from '@/components/loans/loan-form-modal';
import { LoanDetailModal } from '@/components/loans/loan-detail-modal';
import { LoanRemindersModal } from '@/components/loans/loan-reminders-modal';
import { InterestMethod } from '@/lib/loans/amortization';

const PAGE_SIZE = 12;

export default function LoansPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [businessFilter, setBusinessFilter] = useState<string>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<any | null>(null);
  const [prefillData, setPrefillData] = useState<{
    amount?: string;
    annualRatePct?: string;
    periodMonths?: string;
    method?: InterestMethod;
  } | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  async function loadLoans() {
    setLoading(true);
    try {
      const targetBiz =
        businessFilter !== 'active'
          ? businessFilter
          : isMasterView || !activeBusinessId
            ? 'all'
            : activeBusinessId;

      const params = new URLSearchParams({
        businessId: targetBiz,
        status: statusFilter,
      });

      const res = await fetch(`/api/loans?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.loans) {
        setLoans(json.loans);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLoans();
  }, [activeBusinessId, isMasterView, businessFilter, statusFilter]);

  const filteredLoans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return loans;
    return loans.filter(
      (l) =>
        (l.lender_name || '').toLowerCase().includes(q) ||
        (l.business_name || '').toLowerCase().includes(q) ||
        (l.reference_no || '').toLowerCase().includes(q)
    );
  }, [loans, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / PAGE_SIZE));
  const paginatedLoans = filteredLoans.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const summary = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', {
      timeZone: 'Africa/Nairobi',
    });

    const dueWithin7Days: any[] = [];
    const overdueLoans: any[] = [];
    const upcomingMaturities: any[] = [];

    const totals = loans.reduce(
      (acc, l) => {
        if (l.loan_status === 'active') {
          acc.outstandingMinor += Number(l.outstanding_balance_minor || 0);
          acc.monthlyCommitmentsMinor += Number(l.monthly_instalment_minor || l.installment_minor || 0);

          if (l.overdue_count > 0) {
            overdueLoans.push(l);
          }
          if (
            l.next_instalment &&
            l.next_instalment.due_date >= todayStr &&
            l.next_instalment.due_date <= sevenDaysLater
          ) {
            dueWithin7Days.push(l);
          }
          if (l.maturity_date && l.maturity_date >= todayStr) {
            upcomingMaturities.push(l);
          }
        }
        acc.principalRepaidMinor += Number(l.total_principal_repaid_minor || 0);
        acc.interestPaidMinor += Number(l.total_interest_paid_minor || 0);
        return acc;
      },
      {
        outstandingMinor: 0,
        monthlyCommitmentsMinor: 0,
        principalRepaidMinor: 0,
        interestPaidMinor: 0,
      }
    );

    upcomingMaturities.sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));

    return {
      ...totals,
      dueWithin7Days,
      overdueLoans,
      upcomingMaturities: upcomingMaturities.slice(0, 5),
    };
  }, [loans]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#14231A] tracking-tight">
            Business Loans
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Track bank loans, asset financing, and repayment schedules across your businesses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setIsRemindersOpen(true)}>
            <BellRing className="w-4 h-4 mr-1.5" />
            Reminders & Logs
          </Button>
          <Button variant="secondary" onClick={() => setIsCalcOpen(true)}>
            <Calculator className="w-4 h-4 mr-1.5" />
            Loan Calculator
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setEditingLoan(null);
              setPrefillData(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Loan
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500">Outstanding Loans</div>
          <div className="text-xl font-bold text-[#14231A] mt-1">
            <MoneyDisplay minorUnits={summary.outstandingMinor} showCents={false} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500">Monthly Commitments</div>
          <div className="text-xl font-bold text-[#185D2D] mt-1">
            <MoneyDisplay minorUnits={summary.monthlyCommitmentsMinor} showCents={false} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500">Principal Repaid</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">
            <MoneyDisplay minorUnits={summary.principalRepaidMinor} showCents={false} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-slate-500">Interest Paid</div>
          <div className="text-xl font-bold text-amber-700 mt-1">
            <MoneyDisplay minorUnits={summary.interestPaidMinor} showCents={false} />
          </div>
        </Card>
      </div>

      {/* Attention Panels: Overdue, Due Within 7 Days, Upcoming Maturities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className={`p-4 ${summary.overdueLoans.length > 0 ? 'border-[#F4C5CB] bg-[#FDECEE]/40' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8F1D2A] uppercase">
              <AlertTriangle className="w-4 h-4" />
              <span>Overdue Instalments ({summary.overdueLoans.length})</span>
            </div>
          </div>
          {summary.overdueLoans.length === 0 ? (
            <p className="text-xs text-slate-500">No overdue loan instalments.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {summary.overdueLoans.slice(0, 4).map((l: any) => (
                <li
                  key={l.obligation_id}
                  onClick={() => setSelectedLoanId(l.obligation_id)}
                  className="flex items-center justify-between p-1.5 rounded bg-white/80 border border-[#F4C5CB] cursor-pointer hover:bg-white"
                >
                  <span className="font-semibold text-[#8F1D2A] truncate">{l.lender_name} ({l.business_name})</span>
                  <span className="font-mono font-semibold shrink-0 ml-2">
                    <MoneyDisplay minorUnits={l.next_instalment?.instalment_minor || l.monthly_instalment_minor} showCents={false} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase mb-2">
            <CalendarClock className="w-4 h-4" />
            <span>Due Within 7 Days ({summary.dueWithin7Days.length})</span>
          </div>
          {summary.dueWithin7Days.length === 0 ? (
            <p className="text-xs text-slate-500">No loan instalments due in the next 7 days.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {summary.dueWithin7Days.slice(0, 4).map((l: any) => (
                <li
                  key={l.obligation_id}
                  onClick={() => setSelectedLoanId(l.obligation_id)}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100"
                >
                  <span className="font-medium text-slate-800 truncate">{l.lender_name} · {fmt_date(l.next_instalment.due_date)}</span>
                  <span className="font-mono font-semibold shrink-0 ml-2">
                    <MoneyDisplay minorUnits={l.next_instalment.instalment_minor} showCents={false} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase mb-2">
            <Landmark className="w-4 h-4 text-[#185D2D]" />
            <span>Upcoming Maturities</span>
          </div>
          {summary.upcomingMaturities.length === 0 ? (
            <p className="text-xs text-slate-500">No active loan maturity dates.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {summary.upcomingMaturities.map((l: any) => (
                <li
                  key={l.obligation_id}
                  onClick={() => setSelectedLoanId(l.obligation_id)}
                  className="flex items-center justify-between p-1.5 rounded bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100"
                >
                  <span className="font-medium text-slate-800 truncate">{l.lender_name}</span>
                  <span className="text-slate-600 shrink-0 ml-2">{fmt_date(l.maturity_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3.5">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search loans"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by business"
              value={businessFilter}
              onChange={(e) => {
                setBusinessFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
            >
              <option value="active">Current Context</option>
              <option value="all">All Businesses</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by loan status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="fully_paid">Fully Paid</option>
              <option value="defaulted">Defaulted</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Loans Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading loans...</div>
        ) : paginatedLoans.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Landmark className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-700">No business loans recorded yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Register a bank loan, asset financing, or mobile loan to generate its reducing-balance amortization schedule and automated reminders.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingLoan(null);
                setPrefillData(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Loan
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Lender / Ref</th>
                    <th className="py-3 px-4 font-semibold">Business</th>
                    <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                    <th className="py-3 px-4 font-semibold text-right">Monthly</th>
                    <th className="py-3 px-4 font-semibold">Next Due</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLoans.map((loan) => (
                    <tr
                      key={loan.obligation_id}
                      onClick={() => setSelectedLoanId(loan.obligation_id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#14231A]">{loan.lender_name}</div>
                        <div className="text-xs text-slate-500">
                          {loan.reference_no} · {loan.interest_rate_pct}% p.a.
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{loan.business_name}</td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums">
                        <MoneyDisplay minorUnits={loan.outstanding_balance_minor} showCents={false} />
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                        <MoneyDisplay
                          minorUnits={loan.monthly_instalment_minor || loan.installment_minor}
                          showCents={false}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {loan.next_instalment ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {fmt_date(loan.next_instalment.due_date)}
                            </div>
                            {loan.overdue_count > 0 && (
                              <span className="text-[11px] font-semibold text-[#8F1D2A]">
                                {loan.overdue_count} overdue
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-medium">Cleared</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            loan.loan_status === 'fully_paid'
                              ? 'success'
                              : loan.loan_status === 'defaulted'
                                ? 'danger'
                                : 'info'
                          }
                          size="sm"
                          dot
                        >
                          {loan.loan_status === 'fully_paid'
                            ? 'Fully Paid'
                            : loan.loan_status === 'defaulted'
                              ? 'Defaulted'
                              : 'Active'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLoanId(loan.obligation_id);
                          }}
                        >
                          Details →
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-200">
                <PaginationBar
                  currentPage={currentPage}
                  totalItems={filteredLoans.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="loans"
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modals */}
      <LoanCalculatorModal
        isOpen={isCalcOpen}
        onClose={() => setIsCalcOpen(false)}
        onUseInNewLoan={(prefill) => {
          setEditingLoan(null);
          setPrefillData(prefill);
          setIsFormOpen(true);
        }}
      />

      <LoanFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={loadLoans}
        initialLoan={editingLoan}
        prefill={prefillData}
      />

      <LoanDetailModal
        isOpen={Boolean(selectedLoanId)}
        loanId={selectedLoanId}
        onClose={() => setSelectedLoanId(null)}
        onEdit={(loan) => {
          setSelectedLoanId(null);
          setEditingLoan(loan);
          setIsFormOpen(true);
        }}
        onUpdated={loadLoans}
      />

      <LoanRemindersModal
        isOpen={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
      />
    </div>
  );
}
