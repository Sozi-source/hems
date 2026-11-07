'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  UserX,
  Trash2,
} from 'lucide-react';

interface TeamMember {
  business_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer';
  is_active: boolean;
  created_at: string;
  email: string | null;
  full_name: string | null;
}

const ROLE_DETAILS = {
  cashier: {
    label: 'Cashier (Counter & Frontline)',
    badgeVariant: 'success' as const,
    description: 'Can add customers, record goods on credit (customer debts), record counter cash debt payments, and view customer balances.',
  },
  accountant: {
    label: 'Accountant',
    badgeVariant: 'warning' as const,
    description: 'Can approve/reject incoming electronic payments, record expenses, manage debts & supplier payables, and view ledger statements.',
  },
  admin: {
    label: 'Administrator',
    badgeVariant: 'info' as const,
    description: 'Can configure M-Pesa Paybill channels, edit SMS templates, review audit logs, and manage business records.',
  },
  owner: {
    label: 'Business Owner',
    badgeVariant: 'purple' as const,
    description: 'Full system ownership: can allocate and revoke employee rights, modify Paybills, and oversee company audit logs.',
  },
  viewer: {
    label: 'Viewer',
    badgeVariant: 'neutral' as const,
    description: 'Read-only access to customer balances, obligations, and transaction figures.',
  },
};

export default function TeamPage() {
  const { activeBusinessId, activeBusiness, isMasterView, businesses } = useBusiness();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'cashier' | 'accountant' | 'admin' | 'viewer'>('cashier');
  const [addPassword, setAddPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Role Modal State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer'>('cashier');
  const [isUpdating, setIsUpdating] = useState(false);

  async function loadTeam() {
    setIsLoading(true);
    setError(null);
    try {
      const url = activeBusinessId && !isMasterView
        ? `/api/team?businessId=${activeBusinessId}`
        : '/api/team';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch team members');
      }
      setMembers(json.members || []);
      setIsOwner(json.isOwner ?? false);
    } catch (err: any) {
      setError(err.message || 'Error loading team data');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
  }, [activeBusinessId, isMasterView]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBusinessId && isMasterView) {
      setError('Please select a specific business from the switcher to add team members.');
      return;
    }
    const targetBizId = activeBusinessId || businesses[0]?.id;
    if (!targetBizId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBizId,
          fullName: addName.trim(),
          email: addEmail.trim(),
          role: addRole,
          password: addPassword.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not allocate rights.');
      }
      setNotice(`Employee rights allocated: ${addName || addEmail} added as ${addRole.toUpperCase()}.`);
      setIsAddOpen(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddRole('cashier');
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMember) return;

    setIsUpdating(true);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: editingMember.business_id,
          userId: editingMember.user_id,
          role: editRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update role.');
      }
      setNotice(`Updated rights for ${editingMember.full_name || editingMember.email} to ${editRole.toUpperCase()}.`);
      setEditingMember(null);
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleToggleStatus(member: TeamMember) {
    setError(null);
    try {
      const newStatus = !member.is_active;
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: member.business_id,
          userId: member.user_id,
          isActive: newStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to toggle employee status.');
      }
      setNotice(`${member.full_name || member.email} is now ${newStatus ? 'Active' : 'Suspended'}.`);
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    if (!confirm(`Are you sure you want to remove ${member.full_name || member.email} from this business?`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/team?businessId=${member.business_id}&userId=${member.user_id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to remove member.');
      }
      setNotice(`Removed ${member.full_name || member.email} from the business.`);
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Metrics
  const activeCount = members.filter((m) => m.is_active).length;
  const cashierCount = members.filter((m) => m.role === 'cashier' && m.is_active).length;
  const accountantCount = members.filter((m) => m.role === 'accountant' && m.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
            Team & Employee Rights
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Allocate access rights to employees so they can safely manage customers, credit debts, and cash payments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadTeam} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Allocate Employee Rights
          </Button>
        </div>
      </div>

      {/* Notices */}
      {notice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Staff</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{activeCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Across active businesses</div>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Cashiers (Add Customers & Debts)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{cashierCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Frontline counter operators</div>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Accountants & Admins</span>
            <KeyRound className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-2">{accountantCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Payment review & management</div>
        </Card>
      </div>

      {/* Permissions Breakdown Guide Card */}
      <Card className="bg-slate-50/70 border-slate-200 p-4">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-600" />
          Employee Rights Breakdown
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-semibold text-emerald-800 flex items-center gap-1.5 mb-1">
              <Badge variant="success" size="sm">Cashier</Badge>
              <span>Frontline Staff</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Allocates rights to add new customers, record goods taken on credit (customer debts), record counter cash repayments, and search customer records. Cannot approve electronic bank/Paybill payments or modify app configuration.
            </p>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
              <Badge variant="warning" size="sm">Accountant</Badge>
              <span>Financial Manager</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Full cashier capabilities plus approving/rejecting pending Paybill/bank payments, creating supplier debts, expenses, and managing credit terms.
            </p>
          </div>
        </div>
      </Card>

      {/* Members Table */}
      <Card className="bg-white border-slate-200 shadow-sm p-0 overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-700" />
            <CardTitle className="text-sm font-bold text-slate-800">Assigned Team Members</CardTitle>
          </div>
          <Badge variant="neutral" size="sm">{members.length} Total</Badge>
        </CardHeader>

        {members.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">No employees assigned yet</div>
            <div className="text-xs text-slate-400 mt-1">
              Click &quot;Allocate Employee Rights&quot; above to add your frontline staff.
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Assigned Rights / Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Granted Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {members.map((m) => {
                  const roleMeta = ROLE_DETAILS[m.role] || ROLE_DETAILS.viewer;
                  return (
                    <tr key={`${m.business_id}:${m.user_id}`} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{m.full_name || 'Staff Member'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{m.email || 'No email attached'}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={roleMeta.badgeVariant} size="sm">
                          {roleMeta.label}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        {m.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <UserX className="w-3 h-3 text-rose-600" />
                            Suspended
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {new Date(m.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMember(m);
                              setEditRole(m.role);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Change Rights
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(m)}
                            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                              m.is_active
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {m.is_active ? 'Suspend' : 'Activate'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m)}
                            title="Remove from business"
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Allocate Rights to Employee"
        description="Empower your employee to add customers, record credit sales, and settle payments."
        maxWidth="lg"
      >
        <form onSubmit={handleAddMember} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Work Email (Login ID)
            </label>
            <input
              type="email"
              required
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Login Password (Optional: Leave blank to auto-generate temporary password)
            </label>
            <input
              type="password"
              minLength={8}
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Allocated Rights
            </label>
            <div className="space-y-2">
              {(['cashier', 'accountant', 'admin', 'viewer'] as const).map((rKey) => {
                const meta = ROLE_DETAILS[rKey];
                const isSelected = addRole === rKey;
                return (
                  <label
                    key={rKey}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="allocatedRole"
                      value={rKey}
                      checked={isSelected}
                      onChange={() => setAddRole(rKey)}
                      className="mt-0.5 text-slate-900"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">{meta.label}</span>
                        <Badge variant={meta.badgeVariant} size="sm">{rKey.toUpperCase()}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {meta.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isSubmitting}
              className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648]"
            >
              Confirm Rights Allocation
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Change Rights: ${editingMember?.full_name || editingMember?.email}`}
        description="Adjust access permissions for this staff member."
        maxWidth="md"
      >
        <form onSubmit={handleUpdateRole} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select New Role
            </label>
            <div className="space-y-2">
              {(['cashier', 'accountant', 'admin', 'viewer'] as const).map((rKey) => {
                const meta = ROLE_DETAILS[rKey];
                const isSelected = editRole === rKey;
                return (
                  <label
                    key={rKey}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editRole"
                      value={rKey}
                      checked={isSelected}
                      onChange={() => setEditRole(rKey)}
                      className="mt-0.5 text-slate-900"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">{meta.label}</span>
                        <Badge variant={meta.badgeVariant} size="sm">{rKey.toUpperCase()}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {meta.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isUpdating}
              className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648]"
            >
              Save New Rights
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
