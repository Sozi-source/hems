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
  Smartphone,
  MessageSquareOff,
  BookOpen,
  Search,
  Phone,
  Wallet,
  UserCheck,
} from 'lucide-react';
import { AddCustomerModal } from '@/components/customers/add-customer-modal';
import { ImportPhonebookModal } from '@/components/customers/import-phonebook-modal';
import { StkPromptModal } from '@/components/payments/stk-prompt-modal';
import { PaginationBar } from '@/components/ui/pagination-bar';

const PAGE_SIZE = 15;

interface CustomerItem {
  id: string;
  business_id: string;
  customer_no: string;
  full_name: string;
  nickname?: string | null;
  phone: string | null;
  outstanding_minor?: number;
  open_debts?: number;
  sms_blocked_at?: string | null;
  sms_block_reason?: string | null;
}

export default function CustomersPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [stkTarget, setStkTarget] = useState<CustomerItem | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'all' | 'owing' | 'settled'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  async function loadCustomers() {
    try {
      const supabase = createClient();

      // Fetch customer metadata (nicknames, notes, and SMS block flags) from customers table
      let metaQuery = supabase
        .from('customers')
        .select('id, notes, sms_blocked_at, sms_block_reason');
      
      // Attempt to include nickname column if it exists in DB
      try {
        metaQuery = supabase
          .from('customers')
          .select('id, nickname, notes, sms_blocked_at, sms_block_reason');
      } catch {
        // Fallback to select without nickname if column query fails
      }

      if (!isMasterView && activeBusinessId) {
        metaQuery = metaQuery.eq('business_id', activeBusinessId);
      }
      
      const { data: custRows } = await metaQuery;
      const custMetaById = new Map<string, { nickname: string | null; sms_blocked_at: string | null; sms_block_reason: string | null }>(
        (custRows || []).map((row: any) => {
          let nick = row.nickname || null;
          if (!nick && row.notes) {
            const m = row.notes.match(/Nickname:\s*([^\r\n]+)/i);
            if (m) nick = m[1].trim();
          }
          return [row.id, {
            nickname: nick,
            sms_blocked_at: row.sms_blocked_at ?? null,
            sms_block_reason: row.sms_block_reason ?? null,
          }];
        })
      );

      const withMeta = <T extends { id: string }>(items: T[]) =>
        items.map((item) => ({
          ...item,
          nickname: custMetaById.get(item.id)?.nickname ?? null,
          sms_blocked_at: custMetaById.get(item.id)?.sms_blocked_at ?? null,
          sms_block_reason: custMetaById.get(item.id)?.sms_block_reason ?? null,
        }));

      let query = supabase
        .from('v_customer_balances')
        .select('customer_id, business_id, customer_no, full_name, phone, outstanding_minor, open_debts')
        .order('customer_no');

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      const { data, error } = await query;

      if (!error && data) {
        setCustomers(
          withMeta(
            data.map((c: any) => ({
              id: c.customer_id as string,
              business_id: c.business_id,
              customer_no: c.customer_no,
              full_name: c.full_name,
              phone: c.phone,
              outstanding_minor: Number(c.outstanding_minor || 0),
              open_debts: Number(c.open_debts || 0),
            }))
          )
        );
      } else {
        let fallbackQuery = supabase
          .from('customers')
          .select('id, business_id, customer_no, full_name, phone')
          .order('customer_no');

        if (!isMasterView && activeBusinessId) {
          fallbackQuery = fallbackQuery.eq('business_id', activeBusinessId);
        }

        const { data: fallbackData } = await fallbackQuery;
        setCustomers(withMeta((fallbackData as CustomerItem[]) || []));
      }
    } catch {
      setCustomers([]);
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
      const { error } = await supabase.rpc('clear_customer_sms_block', { p_customer_id: cust.id });
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
  }, [searchQuery, debtFilter, activeBusinessId, isMasterView]);

  const totalDebtMinor = customers.reduce((sum, c) => sum + (c.outstanding_minor || 0), 0);
  const owingCustomersCount = customers.filter((c) => (c.outstanding_minor || 0) > 0).length;
  const settledCustomersCount = customers.length - owingCustomersCount;

  const filteredCustomers = customers.filter((cust) => {
    const hasDebt = (cust.outstanding_minor || 0) > 0;
    if (debtFilter === 'owing' && !hasDebt) return false;
    if (debtFilter === 'settled' && hasDebt) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      cust.full_name?.toLowerCase().includes(q) ||
      cust.nickname?.toLowerCase().includes(q) ||
      cust.customer_no?.toLowerCase().includes(q) ||
      cust.phone?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedCustomers = showAll
    ? filteredCustomers
    : filteredCustomers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Clean Enterprise Page Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
          Customers
        </h1>

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

      {/* Enterprise KPI Strip: 1 Deep Forest Hero Card + 2 Clean White Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="col-span-2 sm:col-span-1 bg-[#123520] border-[#1E4D30] text-white p-3.5 sm:p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-emerald-100/80">
              Total Owed by Customers
            </span>
            <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 text-emerald-200 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={totalDebtMinor} size="lg" variant="inverse" />
          <p className="mt-1 text-[11px] text-emerald-100/75 font-medium">
            Across {owingCustomersCount} active credit accounts
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              With Open Debt
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {owingCustomersCount}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Ready for M-Pesa prompt
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Directory
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/80 border border-slate-200/70 text-slate-500 flex items-center justify-center">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {customers.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {settledCustomersCount} fully settled
          </p>
        </Card>
      </div>

      {/* Search & Neutral Segmented Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, nickname, phone, or #Account..."
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80 shrink-0">
          {(
            [
              { id: 'all', label: `All (${customers.length})` },
              { id: 'owing', label: `Owes Debt (${owingCustomersCount})` },
              { id: 'settled', label: `Settled (${settledCustomersCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDebtFilter(tab.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
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

      {actionError && (
        <div role="alert" className="rounded-md border border-[#F4C5CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#8F1D2A]">
          {actionError}
        </div>
      )}

      {filteredCustomers.length === 0 ? (
        <Card className="bg-white border-slate-200/90 shadow-2xs text-center py-12 px-4">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <div className="text-sm font-semibold text-slate-700">
            {customers.length === 0 ? 'No customers added yet' : 'No matching customers found'}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {customers.length === 0
              ? 'Add individual customers or import directly from your phonebook contacts (.vcf or .csv).'
              : 'Try clearing your search or switching the debt filter tab above.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile Native Card List (< md) — Clean White Surface */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {paginatedCustomers.map((cust) => {
              const hasDebt = (cust.outstanding_minor || 0) > 0;
              const bizName = businesses.find((b) => b.id === cust.business_id)?.name;

              return (
                <Card
                  key={cust.id}
                  className="p-3.5 bg-white border-slate-200/90 shadow-2xs"
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
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 mt-1.5 leading-snug [overflow-wrap:anywhere]">
                        {cust.full_name}
                      </h3>
                      {cust.nickname && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Alias: <strong className="font-medium text-slate-700">{cust.nickname}</strong>
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Balance
                      </span>
                      <MoneyDisplay
                        minorUnits={cust.outstanding_minor || 0}
                        size="md"
                        variant="neutral"
                      />
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                      {cust.phone ? (
                        <a
                          href={`tel:${cust.phone}`}
                          className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-medium bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200"
                        >
                          <Phone className="w-3 h-3 text-slate-500" />
                          {fmt_phone(cust.phone)}
                        </a>
                      ) : (
                        <span className="text-slate-400">No phone</span>
                      )}

                      {cust.sms_blocked_at && (
                        <button
                          type="button"
                          onClick={() => clearSmsBlock(cust)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-700"
                        >
                          <MessageSquareOff className="w-3 h-3" />
                          Unblock SMS
                        </button>
                      )}
                    </div>

                    {hasDebt ? (
                      <button
                        type="button"
                        onClick={() => setStkTarget(cust)}
                        className="min-h-8 px-3 rounded-lg bg-[#123520] hover:bg-[#1A4A2D] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        Prompt M-Pesa
                      </button>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        Settled
                      </Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table (md and up) */}
          <Card className="hidden md:block bg-white border-slate-200/90 shadow-2xs p-0">
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="sticky left-0 z-10 bg-slate-50 py-3 px-4">Account No</th>
                    {isMasterView && <th className="py-3 px-4">Business</th>}
                    <th className="py-3 px-4">Customer Name & Nickname</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">SMS Status</th>
                    <th className="py-3 px-4 text-right">Current Debt</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {paginatedCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-1 rounded text-xs">
                          {cust.customer_no}
                        </span>
                      </td>

                      {isMasterView && (
                        <td className="py-3.5 px-4 text-slate-600">
                          {businesses.find((business) => business.id === cust.business_id)?.name || '—'}
                        </td>
                      )}

                      <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-normal">
                        <div className="flex flex-col">
                          <span className="text-slate-900 font-semibold">{cust.full_name}</span>
                          {cust.nickname && (
                            <span className="text-[11px] font-normal text-slate-500 mt-0.5">
                              Alias: <strong className="font-medium text-slate-700">{cust.nickname}</strong>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {fmt_phone(cust.phone)}
                      </td>

                      <td className="py-3.5 px-4">
                        {cust.sms_blocked_at ? (
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant="danger"
                              size="sm"
                              dot
                              title={cust.sms_block_reason || 'Blocked by SMS provider'}
                            >
                              SMS blocked
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-8 px-2 text-[11px] text-slate-700"
                              isLoading={unblockingId === cust.id}
                              onClick={() => clearSmsBlock(cust)}
                              title="Owner or admin only"
                            >
                              <MessageSquareOff className="w-3 h-3 mr-1" />
                              Clear block
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <MoneyDisplay
                          minorUnits={cust.outstanding_minor || 0}
                          size="sm"
                          variant="neutral"
                        />
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {(cust.outstanding_minor || 0) > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-slate-700"
                            onClick={() => setStkTarget(cust)}
                            title="Prompt customer via M-Pesa"
                          >
                            <Smartphone className="w-3.5 h-3.5 mr-1 text-slate-500" />
                            Prompt M-Pesa
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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

      {stkTarget && (
        <StkPromptModal
          isOpen={Boolean(stkTarget)}
          onClose={() => setStkTarget(null)}
          businessId={stkTarget.business_id}
          customerId={stkTarget.id}
          customerName={stkTarget.full_name}
          customerPhone={stkTarget.phone || ''}
          amountMinor={stkTarget.outstanding_minor || 0}
          accountReference={stkTarget.customer_no}
          onSuccess={loadCustomers}
        />
      )}
    </div>
  );
}
