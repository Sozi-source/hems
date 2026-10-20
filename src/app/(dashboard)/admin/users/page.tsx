'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmt_date, fmt_kes } from '@/lib/format';
import {
  ShieldCheck,
  UserCheck,
  Search,
  RefreshCw,
  Eye,
  Receipt,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserX,
} from 'lucide-react';
import { UserTransactionsDrawer } from '@/components/admin/user-transactions-drawer';

interface UserMembership {
  businessId: string;
  businessCode: string;
  businessName: string;
  role: string;
  isActive: boolean;
  joinedAt?: string;
}

interface MonitoredUser {
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isCurrentUser: boolean;
  memberships: UserMembership[];
  metrics: {
    approvedCount: number;
    approvedVolumeMinor: number;
    rejectedCount: number;
    stkCount: number;
    totalAuditEvents: number;
    lastActiveAt: string | null;
  };
}

export default function AdminUsersPage() {
  const { activeBusinessId, isMasterView, activeBusiness } = useBusiness();
  const [users, setUsers] = useState<MonitoredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Selected user for transaction inspection drawer
  const [selectedUser, setSelectedUser] = useState<MonitoredUser | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const url =
        !isMasterView && activeBusinessId
          ? `/api/admin/users?businessId=${activeBusinessId}`
          : '/api/admin/users';

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load user accounts.');
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching user accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [activeBusinessId, isMasterView]);

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.displayName.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      u.memberships.some((m) => m.businessName.toLowerCase().includes(q));

    const matchesRole =
      roleFilter === 'all' ||
      u.memberships.some((m) => m.role.toLowerCase() === roleFilter.toLowerCase());

    return matchesSearch && matchesRole;
  });

  // Aggregate stats across all monitored users
  const totalVolumeMinor = users.reduce((sum, u) => sum + u.metrics.approvedVolumeMinor, 0);
  const totalApprovals = users.reduce((sum, u) => sum + u.metrics.approvedCount, 0);
  const totalRejected = users.reduce((sum, u) => sum + u.metrics.rejectedCount, 0);

  function getRoleBadge(role: string) {
    switch (role) {
      case 'owner':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 uppercase tracking-wider">
            Owner
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 uppercase tracking-wider">
            Admin
          </span>
        );
      case 'accountant':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 uppercase tracking-wider">
            Accountant
          </span>
        );
      case 'cashier':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
            Cashier
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
            {role}
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-700" />
            User Monitoring & Audit
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Supervise team accounts and inspect their real underlying transactions, approvals, and decisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} isLoading={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Institutional Fintech Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-slate-200/90 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Monitored Accounts
            </span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {users.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {isMasterView ? 'Across all businesses' : `In ${activeBusiness?.name || 'current business'}`}
          </div>
        </Card>

        <Card className="bg-white border-slate-200/90 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Monitored Volume
            </span>
            <Receipt className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {fmt_kes(totalVolumeMinor)}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">
            Approved by staff members
          </div>
        </Card>

        <Card className="bg-white border-slate-200/90 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Reconciled Approvals
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {totalApprovals}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Payment transactions verified
          </div>
        </Card>

        <Card className="bg-white border-slate-200/90 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Flagged / Rejected
            </span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2 font-mono">
            {totalRejected}
          </div>
          <div className="text-[11px] text-rose-700 font-medium mt-1">
            Questionable or blocked payments
          </div>
        </Card>
      </div>

      {/* Directory Table Card */}
      <Card className="bg-white border-slate-200/90 shadow-sm p-0 overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by user name, email, phone, or business..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="owner">Owners</option>
              <option value="admin">Admins</option>
              <option value="accountant">Accountants</option>
              <option value="cashier">Cashiers</option>
            </select>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="m-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Table Content */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading user directory and audit logs...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <UserX className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No matching user accounts</h3>
            <p className="text-xs text-slate-500">
              No users found matching your search filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">User / Account</th>
                  <th className="py-3 px-4">Role & Business</th>
                  <th className="py-3 px-4 text-center">Decisions Handled</th>
                  <th className="py-3 px-4 text-right">Volume Processed</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map((u) => {
                  const initial = u.displayName.slice(0, 2).toUpperCase();
                  const primaryRole = u.memberships[0]?.role || 'cashier';

                  return (
                    <tr key={u.userId} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Account Details */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                            {initial}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{u.displayName}</span>
                              {u.isCurrentUser && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono whitespace-nowrap tabular-nums">
                              {u.email || u.phone || `ID: ${u.userId.slice(0, 8)}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Business & Role Badges */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {u.memberships.map((m) => (
                              <div key={`${m.businessId}-${m.role}`} className="flex items-center gap-1">
                                {getRoleBadge(m.role)}
                                <span className="text-[11px] text-slate-600 font-medium">
                                  {m.businessName}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Decisions Handled */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-2 font-mono">
                          <span className="text-emerald-700 font-semibold" title="Approved payments">
                            +{u.metrics.approvedCount}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="text-rose-600 font-semibold" title="Rejected payments">
                            -{u.metrics.rejectedCount}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {u.metrics.totalAuditEvents} audit entries
                        </div>
                      </td>

                      {/* Volume Processed */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-slate-900">
                          {fmt_kes(u.metrics.approvedVolumeMinor)}
                        </div>
                        {u.metrics.stkCount > 0 && (
                          <div className="text-[10px] text-slate-500 font-medium">
                            {u.metrics.stkCount} STK prompts
                          </div>
                        )}
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {u.metrics.lastActiveAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {fmt_date(u.metrics.lastActiveAt, true)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Inspect Real Transactions Button */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUser(u)}
                          className="text-xs font-semibold border-slate-300 hover:bg-slate-100 text-slate-800"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                          Inspect Real Transactions
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Real Transaction Inspector Drawer */}
      {selectedUser && (
        <UserTransactionsDrawer
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          userId={selectedUser.userId}
          userName={selectedUser.displayName}
          userEmail={selectedUser.email}
          userPhone={selectedUser.phone}
          userRole={selectedUser.memberships[0]?.role}
        />
      )}
    </div>
  );
}
