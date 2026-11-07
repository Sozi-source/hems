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
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  UserX,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';

export interface EmployeePermissions {
  cash_payments: boolean;
  credit_sales: boolean;
  manage_customers: boolean;
  view_balances: boolean;
  approve_payments: boolean;
  manage_expenses: boolean;
  system_settings: boolean;
}

interface TeamMember {
  business_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer';
  is_active: boolean;
  created_at: string;
  email: string | null;
  full_name: string | null;
  permissions?: EmployeePermissions | null;
}

const ROLE_DETAILS = {
  cashier: {
    label: 'Cashier',
    badgeVariant: 'success' as const,
    description: 'Credit sales, customers & cash',
  },
  accountant: {
    label: 'Accountant',
    badgeVariant: 'warning' as const,
    description: 'Payment approvals, debts & expenses',
  },
  admin: {
    label: 'Admin',
    badgeVariant: 'info' as const,
    description: 'Settings, channels & audit logs',
  },
  owner: {
    label: 'Owner',
    badgeVariant: 'purple' as const,
    description: 'Full business control & access',
  },
  viewer: {
    label: 'Viewer',
    badgeVariant: 'neutral' as const,
    description: 'Read-only access to records',
  },
};

const DEFAULT_PERMISSIONS: Record<'cashier' | 'accountant' | 'admin' | 'viewer', EmployeePermissions> = {
  cashier: {
    cash_payments: true,
    credit_sales: true,
    manage_customers: true,
    view_balances: true,
    approve_payments: false,
    manage_expenses: false,
    system_settings: false,
  },
  accountant: {
    cash_payments: true,
    credit_sales: true,
    manage_customers: true,
    view_balances: true,
    approve_payments: true,
    manage_expenses: true,
    system_settings: false,
  },
  admin: {
    cash_payments: true,
    credit_sales: true,
    manage_customers: true,
    view_balances: true,
    approve_payments: true,
    manage_expenses: true,
    system_settings: true,
  },
  viewer: {
    cash_payments: false,
    credit_sales: false,
    manage_customers: false,
    view_balances: true,
    approve_payments: false,
    manage_expenses: false,
    system_settings: false,
  },
};

const PERMISSION_ITEMS: { key: keyof EmployeePermissions; label: string; desc: string }[] = [
  {
    key: 'cash_payments',
    label: 'Counter Cash Payments',
    desc: 'Record cash debt payments received at counter',
  },
  {
    key: 'credit_sales',
    label: 'Credit Sales & Debts',
    desc: 'Record goods on credit and create customer debts',
  },
  {
    key: 'manage_customers',
    label: 'Add & Manage Customers',
    desc: 'Add new customers and update contact details',
  },
  {
    key: 'view_balances',
    label: 'View Balances & Statements',
    desc: 'Look up customer debt balances and payment history',
  },
  {
    key: 'approve_payments',
    label: 'Approve Electronic Payments',
    desc: 'Approve or reject incoming Paybill / bank payments',
  },
  {
    key: 'manage_expenses',
    label: 'Supplier Payables & Expenses',
    desc: 'Record expenses and manage supplier debt payables',
  },
  {
    key: 'system_settings',
    label: 'Settings & Audit Trail',
    desc: 'Configure payment channels, SMS templates, and audit logs',
  },
];

function computeEffectiveRole(perms: EmployeePermissions, baseRole: 'cashier' | 'accountant' | 'admin' | 'viewer'): 'cashier' | 'accountant' | 'admin' | 'viewer' {
  if (perms.system_settings) return 'admin';
  if (perms.approve_payments || perms.manage_expenses) return 'accountant';
  if (perms.cash_payments || perms.credit_sales || perms.manage_customers) return 'cashier';
  return 'viewer';
}

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
  const [addPermissions, setAddPermissions] = useState<EmployeePermissions>(DEFAULT_PERMISSIONS.cashier);
  const [addPassword, setAddPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Permissions Modal State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer'>('cashier');
  const [editPermissions, setEditPermissions] = useState<EmployeePermissions>(DEFAULT_PERMISSIONS.cashier);
  const [isUpdating, setIsUpdating] = useState(false);

  function openPermissionsModal(m: TeamMember) {
    setEditingMember(m);
    const baseRole = (m.role === 'owner' ? 'admin' : m.role) as 'cashier' | 'accountant' | 'admin' | 'viewer';
    setEditRole(m.role);
    const perms = m.permissions
      ? { ...DEFAULT_PERMISSIONS[baseRole], ...m.permissions }
      : DEFAULT_PERMISSIONS[baseRole];
    setEditPermissions(perms);
  }

  function selectEditRole(newRole: 'cashier' | 'accountant' | 'admin' | 'viewer') {
    setEditRole(newRole);
    setEditPermissions(DEFAULT_PERMISSIONS[newRole]);
  }

  function toggleEditPermission(key: keyof EmployeePermissions) {
    setEditPermissions((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      const effective = computeEffectiveRole(updated, editRole as any);
      setEditRole(effective);
      return updated;
    });
  }

  function selectAddRole(newRole: 'cashier' | 'accountant' | 'admin' | 'viewer') {
    setAddRole(newRole);
    setAddPermissions(DEFAULT_PERMISSIONS[newRole]);
  }

  function toggleAddPermission(key: keyof EmployeePermissions) {
    setAddPermissions((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      const effective = computeEffectiveRole(updated, addRole);
      setAddRole(effective);
      return updated;
    });
  }

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
      setError('Please select a specific business to add team members.');
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
          permissions: addPermissions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not add employee.');
      }
      setNotice(`${addName || addEmail} added as ${ROLE_DETAILS[addRole]?.label || addRole}.`);
      setIsAddOpen(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddRole('cashier');
      setAddPermissions(DEFAULT_PERMISSIONS.cashier);
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
          permissions: editPermissions,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update permissions.');
      }
      setNotice(`Updated permissions for ${editingMember.full_name || editingMember.email}.`);
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
        throw new Error(json.error || 'Failed to update employee status.');
      }
      setNotice(`${member.full_name || member.email} is now ${newStatus ? 'Active' : 'Suspended'}.`);
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRemoveMember(member: TeamMember) {
    if (!confirm(`Are you sure you want to remove ${member.full_name || member.email}?`)) {
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
      setNotice(`Removed ${member.full_name || member.email}.`);
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
            Team & Rights
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage team members and role permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadTeam} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAddRole('cashier');
              setAddPermissions(DEFAULT_PERMISSIONS.cashier);
              setIsAddOpen(true);
            }}
            className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Add Employee
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
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5">{activeCount}</div>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Cashiers</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5">{cashierCount}</div>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Accountants & Admins</span>
            <KeyRound className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1.5">{accountantCount}</div>
        </Card>
      </div>

      {/* Members Table */}
      <Card className="bg-white border-slate-200 shadow-sm p-0 overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-700" />
            <CardTitle className="text-sm font-bold text-slate-800">Team Members</CardTitle>
          </div>
          <Badge variant="neutral" size="sm">{members.length} Total</Badge>
        </CardHeader>

        {members.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">No employees added yet</div>
            <div className="text-xs text-slate-400 mt-1">
              Click &quot;Add Employee&quot; to invite a team member.
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[650px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date Added</th>
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
                            onClick={() => openPermissionsModal(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                            Permissions
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
        title="Add Employee"
        maxWidth="md"
      >
        <form onSubmit={handleAddMember} className="space-y-3.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Password <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="password"
              minLength={8}
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          {/* Role Pill Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Role
            </label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
              {(['cashier', 'accountant', 'admin', 'viewer'] as const).map((rKey) => {
                const isSelected = addRole === rKey;
                return (
                  <button
                    type="button"
                    key={rKey}
                    onClick={() => selectAddRole(rKey)}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                      isSelected
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {rKey}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Rights Toggles */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                Granted Rights
              </label>
              <Badge variant={ROLE_DETAILS[addRole]?.badgeVariant || 'neutral'} size="sm">
                {ROLE_DETAILS[addRole]?.label || addRole}
              </Badge>
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
              {PERMISSION_ITEMS.map((item) => {
                const isGranted = Boolean(addPermissions[item.key]);
                return (
                  <div
                    key={item.key}
                    onClick={() => toggleAddPermission(item.key)}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                      isGranted
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="pr-2 select-none">
                      <div className="text-xs font-semibold text-slate-800">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-snug">
                        {item.desc}
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isGranted}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAddPermission(item.key);
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isGranted ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          isGranted ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isSubmitting}
              className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648]"
            >
              Add Employee
            </Button>
          </div>
        </form>
      </Modal>

      {/* Employee Permissions Modal */}
      <Modal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Permissions: ${editingMember?.full_name || editingMember?.email}`}
        maxWidth="md"
      >
        <form onSubmit={handleUpdateRole} className="space-y-4 pt-1">
          {/* Employee Type / Role Pill Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Employee Role
            </label>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
              {(['cashier', 'accountant', 'admin', 'viewer'] as const).map((rKey) => {
                const isSelected = editRole === rKey;
                return (
                  <button
                    type="button"
                    key={rKey}
                    onClick={() => selectEditRole(rKey)}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                      isSelected
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {rKey}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Rights Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Granted Rights
              </label>
              <Badge variant={ROLE_DETAILS[editRole]?.badgeVariant || 'neutral'} size="sm">
                {ROLE_DETAILS[editRole]?.label || editRole}
              </Badge>
            </div>

            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
              {PERMISSION_ITEMS.map((item) => {
                const isGranted = Boolean(editPermissions[item.key]);
                return (
                  <div
                    key={item.key}
                    onClick={() => toggleEditPermission(item.key)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isGranted
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="pr-3 select-none">
                      <div className="text-xs font-semibold text-slate-800">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-snug">
                        {item.desc}
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isGranted}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEditPermission(item.key);
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isGranted ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                          isGranted ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isUpdating}
              className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648]"
            >
              Save Permissions
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
