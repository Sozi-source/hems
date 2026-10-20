'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Users,
  MessageSquareOff,
  BookOpen,
  Search,
  Phone,
  Wallet,
  UserCheck,
  History,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { AddCustomerModal } from '@/components/customers/add-customer-modal';
import { ImportPhonebookModal } from '@/components/customers/import-phonebook-modal';
import {
  CustomerHistoryModal,
  CustomerHistoryItem,
} from '@/components/customers/customer-history-modal';
import { PaginationBar } from '@/components/ui/pagination-bar';

const PAGE_SIZE = 15;

export interface CustomerItem extends CustomerHistoryItem {
  sms_blocked_at?: string | null;
  sms_block_reason?: string | null;
}

export default function CustomersPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const bizList = businesses || [];
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] =
    useState<CustomerItem | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Diverse Filtering and Searching State
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'all' | 'owing' | 'cleared' | 'cash_only'>('all');
  const [sortBy, setSortBy] = useState<'balance_desc' | 'borrowed_desc' | 'paid_desc' | 'name_asc' | 'account_asc'>('balance_desc');
  const [phoneFilter, setPhoneFilter] = useState<'all' | 'has_phone' | 'missing_phone'>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  async function loadCustomers() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // 1. Fetch raw customer profiles
      let custQuery = supabase
        .from('customers')
        .select('id, business_id, customer_no, full_name, phone, notes, sms_blocked_at, sms_block_reason, nickname, is_active')
        .eq('is_active', true)
        .order('customer_no');

      if (!isMasterView && activeBusinessId) {
        custQuery = custQuery.eq('business_id', activeBusinessId);
      }

      const { data: rawCustomers, error: custError } = await custQuery;
      if (custError) throw custError;
      const custList = rawCustomers || [];

      // 2. Fetch customer obligations (debts) to compute borrowed and balance
      let obQuery = supabase
        .from('v_obligation_overview')
        .select('customer_id, original_minor, balance_minor, paid_minor, status')
        .eq('kind', 'customer_debt');

      if (!isMasterView && activeBusinessId) {
        obQuery = obQuery.eq('business_id', activeBusinessId);
      }

      const { data: obList } = await obQuery;

      // 3. Fetch settled payments to attribute payments by phone / account reference
      let payQuery = supabase
        .from('payment_transactions')
        .select('id, payer_msisdn, account_reference, amount_minor, status')
        .in('status', ['approved', 'settled']);

      if (!isMasterView && activeBusinessId) {
        payQuery = payQuery.eq('business_id', activeBusinessId);
      }

      const { data: payList } = await payQuery;

      // Aggregate debt totals per customer
      const borrowedByCust = new Map<string, number>();
      const paidByCust = new Map<string, number>();
      const balanceByCust = new Map<string, number>();
      const openDebtsByCust = new Map<string, number>();

      for (const o of obList || []) {
        if (!o.customer_id) continue;
        borrowedByCust.set(
          o.customer_id,
          (borrowedByCust.get(o.customer_id) || 0) + Number(o.original_minor || 0)
        );
        balanceByCust.set(
          o.customer_id,
          (balanceByCust.get(o.customer_id) || 0) + Number(o.balance_minor || 0)
        );
        paidByCust.set(
          o.customer_id,
          (paidByCust.get(o.customer_id) || 0) + Number(o.paid_minor || 0)
        );
        if (o.status === 'open' || o.status === 'partially_paid') {
          openDebtsByCust.set(
            o.customer_id,
            (openDebtsByCust.get(o.customer_id) || 0) + 1
          );
        }
      }

      // Check payments matching customer phone or account_reference
      const custIdByPhone = new Map<string, string>();
      const custIdByAcc = new Map<string, string>();
      for (const c of custList) {
        if (c.phone) custIdByPhone.set(c.phone, c.id);
        if (c.customer_no) custIdByAcc.set(c.customer_no, c.id);
      }

      for (const p of payList || []) {
        const custId =
          (p.account_reference && custIdByAcc.get(p.account_reference)) ||
          (p.payer_msisdn && custIdByPhone.get(p.payer_msisdn));
        if (custId) {
          const currentPaid = paidByCust.get(custId) || 0;
          const directAmount = Number(p.amount_minor || 0);
          if (directAmount > currentPaid) {
            paidByCust.set(custId, directAmount);
          }
        }
      }

      // Map into CustomerItem records
      const fullItems: CustomerItem[] = custList.map((c: any) => {
        let nick = c.nickname || null;
        if (!nick && c.notes) {
          const m = c.notes.match(/Nickname:\s*([^\r\n]+)/i);
          if (m) nick = m[1].trim();
        }

        const borrowed = borrowedByCust.get(c.id) || 0;
        const balance = balanceByCust.get(c.id) || 0;
        const paid = paidByCust.get(c.id) || 0;
        const openDebts = openDebtsByCust.get(c.id) || 0;

        return {
          id: c.id,
          business_id: c.business_id,
          customer_no: c.customer_no,
          full_name: c.full_name,
          nickname: nick,
          phone: c.phone || null,
          total_borrowed_minor: borrowed,
          total_paid_minor: paid,
          outstanding_minor: balance,
          open_debts: openDebts,
          sms_blocked_at: c.sms_blocked_at ?? null,
          sms_block_reason: c.sms_block_reason ?? null,
          notes: c.notes ?? null,
        };
      });

      setCustomers(fullItems);
    } catch {
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [activeBusinessId, isMasterView]);

  async function clearSmsBlock(cust: CustomerItem) {
    const confirmed = window.confirm(
      `Clear the SMS block for ${cust.full_name}?\n\nSMS to this customer will be attempted again. ` +
        'If the number is still blocked by the provider (for example Safaricom DND), it will be flagged again on the next failed send.'
    );
    if (!confirmed) return;

    setActionError(null);
    setUnblockingId(cust.id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('clear_customer_sms_block', {
        p_customer_id: cust.id,
      });
      if (error) {
        setActionError(
          error.code === '42501'
            ? 'Only an owner or admin can clear an SMS block.'
            : error.message || 'Could not clear the SMS block.'
        );
        return;
      }
      await loadCustomers();
    } catch {
      setActionError('Could not clear the SMS block. Please try again.');
    } finally {
      setUnblockingId(null);
    }
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, debtFilter, sortBy, phoneFilter, activeBusinessId, isMasterView]);

  // Consolidated Global Totals
  const consolidatedBorrowedMinor = customers.reduce(
    (sum, c) => sum + (c.total_borrowed_minor || 0),
    0
  );
  const consolidatedPaidMinor = customers.reduce(
    (sum, c) => sum + (c.total_paid_minor || 0),
    0
  );
  const consolidatedBalanceMinor = customers.reduce(
    (sum, c) => sum + (c.outstanding_minor || 0),
    0
  );

  const owingCount = customers.filter((c) => (c.outstanding_minor || 0) > 0).length;
  const clearedCount = customers.filter(
    (c) => (c.outstanding_minor || 0) === 0 && (c.total_borrowed_minor || 0) > 0
  ).length;
  const cashOnlyCount = customers.filter(
    (c) => (c.total_borrowed_minor || 0) === 0
  ).length;
  const withPhoneCount = customers.filter((c) => Boolean(c.phone)).length;
  const missingPhoneCount = customers.length - withPhoneCount;

  // Diverse Filtering & Searching
  const filteredCustomers = customers
    .filter((cust) => {
      // 1. Debt Status Filter
      const bal = cust.outstanding_minor || 0;
      const borrowed = cust.total_borrowed_minor || 0;
      if (debtFilter === 'owing' && bal <= 0) return false;
      if (debtFilter === 'cleared' && (bal > 0 || borrowed === 0)) return false;
      if (debtFilter === 'cash_only' && borrowed > 0) return false;

      // 2. Phone Filter
      if (phoneFilter === 'has_phone' && !cust.phone) return false;
      if (phoneFilter === 'missing_phone' && cust.phone) return false;

      // 3. Search Query (Name, Nickname, Customer No, Phone)
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        cust.full_name?.toLowerCase().includes(q) ||
        cust.nickname?.toLowerCase().includes(q) ||
        cust.customer_no?.toLowerCase().includes(q) ||
        cust.phone?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'balance_desc') {
        return (b.outstanding_minor || 0) - (a.outstanding_minor || 0);
      }
      if (sortBy === 'borrowed_desc') {
        return (b.total_borrowed_minor || 0) - (a.total_borrowed_minor || 0);
      }
      if (sortBy === 'paid_desc') {
        return (b.total_paid_minor || 0) - (a.total_paid_minor || 0);
      }
      if (sortBy === 'name_asc') {
        return (a.full_name || '').localeCompare(b.full_name || '');
      }
      if (sortBy === 'account_asc') {
        return (a.customer_no || '').localeCompare(b.customer_no || '', undefined, { numeric: true });
      }
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCustomers = showAll
    ? filteredCustomers
    : filteredCustomers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
            Customers & Debtors Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
            Consolidated credit history, individual statements, and customer directory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportModalOpen(true)}
            className="h-9 px-3 text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            Import
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="h-9 px-3 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Consolidated Financial Summary Strip (4 KPI Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Outstanding Debt */}
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#AEF359]" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Outstanding Debt
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#AEF359]/25 border border-[#AEF359]/70 text-slate-900 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={consolidatedBalanceMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Across {owingCount} active credit debtors
          </p>
        </Card>

        {/* Card 2: Consolidated Borrowed */}
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Borrowed
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/60 text-amber-700 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={consolidatedBorrowedMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Lifetime credit goods issued
          </p>
        </Card>

        {/* Card 3: Consolidated Paid */}
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Paid
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={consolidatedPaidMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Verified payments collected
          </p>
        </Card>

        {/* Card 4: Total Customer Base */}
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Customer Directory
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {customers.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {clearedCount} cleared &bull; {cashOnlyCount} cash accounts
          </p>
        </Card>
      </div>

      {/* Diverse Search, Filters & Sorting Strip */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name, nickname, phone, or customer code..."
              className="w-full h-10 pl-9 pr-8 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80 shrink-0 overflow-x-auto">
            {(
              [
                { id: 'all', label: `All (${customers.length})` },
                { id: 'owing', label: `Owes Debt (${owingCount})` },
                { id: 'cleared', label: `Cleared (${clearedCount})` },
                { id: 'cash_only', label: `Cash (${cashOnlyCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDebtFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                  debtFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Row: Sort By & Phone Filter */}
        <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] text-slate-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent font-medium text-slate-800 text-xs focus:outline-none cursor-pointer"
              >
                <option value="balance_desc">Highest Debt Owed</option>
                <option value="borrowed_desc">Highest Total Borrowed</option>
                <option value="paid_desc">Highest Total Paid</option>
                <option value="name_asc">Name (A &rarr; Z)</option>
                <option value="account_asc">Account No (C0001 &rarr;)</option>
              </select>
            </div>

            {/* Phone Number Filter */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] text-slate-500">Phone:</span>
              <select
                value={phoneFilter}
                onChange={(e) => setPhoneFilter(e.target.value as any)}
                className="bg-transparent font-medium text-slate-800 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">All Contacts ({customers.length})</option>
                <option value="has_phone">With Phone ({withPhoneCount})</option>
                <option value="missing_phone">Needs Phone ({missingPhoneCount})</option>
              </select>
            </div>
          </div>

          <span className="text-[11px] text-slate-500 font-mono">
            Showing {filteredCustomers.length} of {customers.length} clients
          </span>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-[#F4C5CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#8F1D2A]"
        >
          {actionError}
        </div>
      )}

      {/* Customer List Content */}
      {isLoading ? (
        <Card className="bg-white border-slate-200/90 shadow-2xs text-center py-12 px-4">
          <div className="text-sm font-semibold text-slate-700">
            Loading customers ledger...
          </div>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <Card className="bg-white border-slate-200/90 shadow-2xs text-center py-12 px-4">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-700">
            {customers.length === 0
              ? 'No customers added yet'
              : 'No matching customer records found'}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {customers.length === 0
              ? 'Add individual customers or import directly from your phonebook contacts.'
              : 'Try clearing your search query or switching your filter criteria above.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile Native Card List (< md) */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {paginatedCustomers.map((cust) => {
              const bal = cust.outstanding_minor || 0;
              const borrowed = cust.total_borrowed_minor || 0;
              const paid = cust.total_paid_minor || 0;
              const hasDebt = bal > 0;
              const bizName = bizList.find((b) => b.id === cust.business_id)?.name;

              return (
                <Card
                  key={cust.id}
                  className="p-3.5 bg-white border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all cursor-pointer"
                  onClick={() => setSelectedCustomerForHistory(cust)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded">
                          {cust.customer_no}
                        </span>
                        {isMasterView && bizName && (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            {bizName}
                          </span>
                        )}
                        {cust.nickname && (
                          <span className="text-[10px] font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                            {cust.nickname}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">
                        {cust.full_name || 'Unnamed Client'}
                      </h3>
                      {cust.phone ? (
                        <span className="text-xs text-slate-500 font-mono mt-0.5 block whitespace-nowrap tabular-nums">
                          {fmt_phone(cust.phone)}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 italic mt-0.5 block">
                          Phone missing
                        </span>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Balance Owed
                      </span>
                      <MoneyDisplay
                        minorUnits={bal}
                        size="md"
                        variant="neutral"
                      />
                      {hasDebt ? (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 inline-block mt-0.5">
                          Owes Debt
                        </span>
                      ) : borrowed > 0 ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 inline-block mt-0.5">
                          Cleared
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                          Cash Client
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3 Consolidated Metrics Mini-Strip */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-medium text-slate-400 block">
                        Borrowed
                      </span>
                      <span className="font-mono font-semibold text-slate-800 text-[11px]">
                        KES {(borrowed / 100).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-slate-400 block">
                        Paid
                      </span>
                      <span className="font-mono font-semibold text-emerald-700 text-[11px]">
                        KES {(paid / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-medium text-slate-400 block">
                        Debts Count
                      </span>
                      <span className="font-mono font-semibold text-slate-700 text-[11px]">
                        {cust.open_debts || 0} open
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div
                    className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerForHistory(cust)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      <span>Ledger History</span>
                    </button>

                    <Badge variant={hasDebt ? 'warning' : 'neutral'} size="sm">
                      {hasDebt ? 'Owes Balance' : 'Settled'}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-slate-200/90 shadow-2xs p-0">
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[960px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="sticky left-0 z-10 bg-slate-50 py-3 px-4 whitespace-nowrap">Account No</th>
                    {isMasterView && <th className="py-3 px-4 whitespace-nowrap">Business</th>}
                    <th className="py-3 px-4 min-w-[190px]">Customer Name & Nickname</th>
                    <th className="py-3 px-4 whitespace-nowrap min-w-[155px]">Phone</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Total Borrowed</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Total Paid</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Balance Owed</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {paginatedCustomers.map((cust) => {
                    const bal = cust.outstanding_minor || 0;
                    const borrowed = cust.total_borrowed_minor || 0;
                    const paid = cust.total_paid_minor || 0;
                    const hasDebt = bal > 0;

                    return (
                      <tr
                        key={cust.id}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => setSelectedCustomerForHistory(cust)}
                      >
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-1 rounded text-xs">
                            {cust.customer_no}
                          </span>
                        </td>

                        {isMasterView && (
                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                            {bizList.find((business) => business.id === cust.business_id)?.name || '—'}
                          </td>
                        )}

                        <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-normal">
                          <div className="flex flex-col">
                            <span className="text-slate-900 font-semibold">{cust.full_name || 'Unnamed Client'}</span>
                            {cust.nickname && (
                              <span className="text-[11px] font-normal text-slate-500 mt-0.5">
                                Alias: <strong className="font-medium text-slate-700">{cust.nickname}</strong>
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap tabular-nums min-w-[155px]">
                          {cust.phone ? (
                            fmt_phone(cust.phone)
                          ) : (
                            <span className="text-xs text-amber-600 italic">No phone</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-800">
                          {borrowed > 0 ? `KES ${(borrowed / 100).toLocaleString()}` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-medium text-emerald-700">
                          {paid > 0 ? `KES ${(paid / 100).toLocaleString()}` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <MoneyDisplay
                            minorUnits={bal}
                            size="sm"
                            variant="neutral"
                          />
                        </td>

                        <td
                          className="py-3.5 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs text-slate-700"
                              onClick={() => setSelectedCustomerForHistory(cust)}
                              title="View complete customer ledger and statement"
                            >
                              <History className="w-3.5 h-3.5 mr-1 text-slate-500" />
                              Ledger
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationBar
            currentPage={safePage}
            totalItems={filteredCustomers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            isShowingAll={showAll}
            onToggleShowAll={() => setShowAll((prev) => !prev)}
            itemLabel="customers"
          />
        </>
      )}

      {/* Customer Historical Ledger Modal */}
      <CustomerHistoryModal
        isOpen={Boolean(selectedCustomerForHistory)}
        customer={selectedCustomerForHistory}
        onClose={() => setSelectedCustomerForHistory(null)}
      />

      <AddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadCustomers}
      />

      <ImportPhonebookModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={loadCustomers}
      />
    </div>
  );
}
