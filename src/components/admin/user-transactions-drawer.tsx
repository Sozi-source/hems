'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Search,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  Receipt,
  Building2,
  Calendar,
  User,
  CreditCard,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    setTimeout(() => setCopiedRef(null), 2000);
  }

  if (!isOpen) return null;

  // Filter transactions
  const filtered = transactions.filter((tx) => {
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

  const totalVolumeMinor = transactions.reduce(
    (sum, tx) => (tx.status === 'approved' ? sum + tx.amountMinor : sum),
    0
  );
  const totalApproved = transactions.filter((t) => t.status === 'approved').length;
  const totalRejected = transactions.filter((t) => t.status === 'rejected').length;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm transition-opacity"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin Transaction Audit
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold uppercase">
                  {userRole}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {userName}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {userEmail && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {userEmail}
                  </span>
                )}
                {userPhone && (
                  <span className="font-mono text-slate-600">
                    {userPhone}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-sm">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Volume Approved
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {fmt_kes(totalVolumeMinor)}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-sm">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Approved
              </div>
              <div className="text-sm font-bold text-emerald-700 mt-0.5">
                {totalApproved} txs
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-sm">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Flagged / Rejected
              </div>
              <div className="text-sm font-bold text-rose-700 mt-0.5">
                {totalRejected} txs
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-3.5 border-b border-slate-200 bg-white space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by receipt code (e.g. UJFA5AWCDW), customer, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Channel:</span>
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none"
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
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
            </select>

            <span className="ml-auto text-[11px] font-medium text-slate-500">
              Showing {filtered.length} of {transactions.length}
            </span>
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Auditing real user transactions...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200 p-6 space-y-2">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">No transactions found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || providerFilter !== 'all' || statusFilter !== 'all'
                  ? 'No real transactions match your filter criteria.'
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
                  className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 hover:border-slate-300 transition-all space-y-3"
                >
                  {/* Top Bar: Receipt Code & Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(tx.transactionRef)}
                          className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono text-xs font-bold border border-slate-300 transition-colors"
                          title="Click to copy receipt code"
                        >
                          <span>{tx.transactionRef}</span>
                          {copiedRef === tx.transactionRef ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                          )}
                        </button>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isRejected
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium">
                        Action: <span className="font-semibold text-slate-800">{tx.action}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-slate-950 font-mono tracking-tight">
                        {fmt_kes(tx.amountMinor)}
                      </div>
                      <span className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {tx.providerLabel}
                      </span>
                    </div>
                  </div>

                  {/* Customer Details & Account Reference */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">
                        Payer / Customer
                      </div>
                      <div className="font-semibold text-slate-900 truncate">
                        {tx.payerName}
                      </div>
                      <div className="font-mono text-slate-500 text-[11px]">
                        {tx.payerMsisdn}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">
                        Account / Ref
                      </div>
                      <div className="font-mono text-slate-800 truncate">
                        {tx.accountReference}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {tx.businessName}
                      </div>
                    </div>
                  </div>

                  {/* Decision Note or Audit trail info if present */}
                  {tx.decisionNote && (
                    <div className="text-xs bg-amber-50/60 border border-amber-200/70 text-amber-900 p-2 rounded-lg">
                      <span className="font-semibold">Note: </span>
                      {tx.decisionNote}
                    </div>
                  )}

                  {/* Footer: Date & Time */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {fmt_date(tx.timestamp, true)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {tx.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Real financial receipts recorded in tamper-proof audit log
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
