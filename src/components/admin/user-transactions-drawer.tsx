'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Search,
  Filter,
  ShieldCheck,
  Receipt,
  Calendar,
  User,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmt_date, fmt_kes } from '@/lib/format';

export interface MonitoredTransaction {
  id: string;
  transactionRef: string;
  provider: string;
  providerLabel: string;
  amountMinor: number;
  payerName: string;
  payerMsisdn: string;
  accountReference: string;
  status: string;
  action: string;
  decisionNote?: string | null;
  businessName: string;
  timestamp: string;
}

interface UserTransactionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail?: string | null;
  userPhone?: string | null;
  userRole?: string;
}

export function UserTransactionsDrawer({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  userPhone,
  userRole = 'cashier',
}: UserTransactionsDrawerProps) {
  const [transactions, setTransactions] = useState<MonitoredTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;

    async function fetchUserTransactions() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/users/${userId}/transactions`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load user transactions.');
        }
        const data = await res.json();
        setTransactions(data.transactions || []);
      } catch (err: any) {
        setError(err.message || 'Error fetching user ledger.');
      } finally {
        setLoading(false);
      }
    }

    fetchUserTransactions();
  }, [isOpen, userId]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedRef(text);
    setTimeout(() => setCopiedRef(null), 1800);
  }

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tx.transactionRef.toLowerCase().includes(q) ||
        tx.payerName.toLowerCase().includes(q) ||
        tx.payerMsisdn.includes(q) ||
        tx.accountReference.toLowerCase().includes(q) ||
        (tx.decisionNote && tx.decisionNote.toLowerCase().includes(q));

      const matchesProvider =
        providerFilter === 'all' ||
        tx.providerLabel.toLowerCase().includes(providerFilter.toLowerCase()) ||
        tx.provider.toLowerCase().includes(providerFilter.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        tx.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesProvider && matchesStatus;
    });
  }, [transactions, searchQuery, providerFilter, statusFilter]);

  const totalVolumeMinor = useMemo(
    () =>
      transactions.reduce(
        (sum, tx) => (tx.status === 'approved' ? sum + tx.amountMinor : sum),
        0
      ),
    [transactions]
  );
  const totalApproved = useMemo(
    () => transactions.filter((t) => t.status === 'approved').length,
    [transactions]
  );
  const totalRejected = useMemo(
    () => transactions.filter((t) => t.status === 'rejected').length,
    [transactions]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity overscroll-contain"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl border-l border-slate-200/90 animate-in slide-in-from-right duration-200">
        {/* Clean, Airy Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60 uppercase tracking-wide">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Transaction Audit Ledger
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium capitalize">
                  {userRole}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {userName}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {userEmail && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <User className="w-3 h-3 text-slate-400" />
                    {userEmail}
                  </span>
                )}
                {userPhone && (
                  <span className="font-mono text-slate-500">
                    {userPhone}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Minimal 3-Card Metrics Strip (Responsive) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
            <div className="bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Volume Approved
              </div>
              <div className="text-sm sm:text-base font-semibold text-slate-900 font-mono mt-0.5">
                {fmt_kes(totalVolumeMinor)}
              </div>
            </div>

            <div className="bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Approved
              </div>
              <div className="text-sm sm:text-base font-semibold text-emerald-700 font-mono mt-0.5">
                {totalApproved} txs
              </div>
            </div>

            <div className="bg-slate-50/60 p-2.5 sm:p-3 rounded-xl border border-slate-200/80">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Flagged / Rejected
              </div>
              <div className="text-sm sm:text-base font-semibold text-rose-700 font-mono mt-0.5">
                {totalRejected} txs
              </div>
            </div>
          </div>
        </div>

        {/* Minimal Filters & Search */}
        <div className="p-3 sm:p-4 border-b border-slate-100 space-y-2.5 shrink-0 bg-slate-50/30">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3 h-3 text-slate-400" />
              <span>Channel:</span>
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="all">All Channels</option>
              <option value="equity">Equity Bank</option>
              <option value="ncba">NCBA Bank</option>
              <option value="absa">Absa Bank</option>
              <option value="mpesa">Safaricom M-Pesa</option>
            </select>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2">
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
            </select>

            <span className="ml-auto text-[11px] text-slate-400">
              {filtered.length} of {transactions.length}
            </span>
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
              <p className="text-xs font-medium">Auditing transactions...</p>
            </div>
          ) : error ? (
            <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 bg-slate-50/50 rounded-xl border border-slate-100 p-6 space-y-2">
              <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="text-xs font-semibold text-slate-700">No transactions found</h3>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                {searchQuery || providerFilter !== 'all' || statusFilter !== 'all'
                  ? 'No transactions match your search filter.'
                  : `${userName} has not performed payment approvals or ingested transactions yet.`}
              </p>
            </div>
          ) : (
            filtered.map((tx) => {
              const isApproved = tx.status === 'approved';
              const isRejected = tx.status === 'rejected';

              return (
                <div
                  key={`${tx.id}-${tx.transactionRef}`}
                  className="bg-white rounded-xl border border-slate-200/70 hover:border-slate-300/80 transition-all p-3.5 space-y-2.5"
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(tx.transactionRef)}
                          className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-xs font-semibold border border-slate-200 transition-colors"
                          title="Click to copy receipt"
                        >
                          <span>{tx.transactionRef}</span>
                          {copiedRef === tx.transactionRef ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                          )}
                        </button>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                              : isRejected
                              ? 'bg-rose-50 text-rose-800 border border-rose-200/60'
                              : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Action: <span className="font-medium text-slate-800">{tx.action}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm sm:text-base font-semibold text-slate-900 font-mono">
                        {fmt_kes(tx.amountMinor)}
                      </div>
                      <span className="inline-block mt-0.5 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                        {tx.providerLabel}
                      </span>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-medium">
                        Payer / Customer
                      </div>
                      <div className="font-medium text-slate-800 truncate">
                        {tx.payerName || 'Anonymous'}
                      </div>
                      <div className="font-mono text-slate-500 text-[11px]">
                        {tx.payerMsisdn || '—'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-medium">
                        Account / Ref
                      </div>
                      <div className="font-mono text-slate-800 truncate">
                        {tx.accountReference || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {tx.businessName}
                      </div>
                    </div>
                  </div>

                  {/* Decision Note if present */}
                  {tx.decisionNote && (
                    <div className="text-xs bg-amber-50/50 border border-amber-200/60 text-amber-900 p-2 rounded-lg">
                      <span className="font-medium">Note: </span>
                      {tx.decisionNote}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {fmt_date(tx.timestamp, true)}
                    </span>
                    <span>ID: {tx.id.slice(0, 8)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Minimal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Audit-logged transactions
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
