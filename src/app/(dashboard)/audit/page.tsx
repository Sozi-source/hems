'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  History,
  Filter,
  User,
  Shield,
  Clock,
  Layers,
  ChevronRight,
  Eye,
  RefreshCw,
  Search,
  CheckCircle,
  FileText,
} from 'lucide-react';

interface AuditItem {
  id: number;
  occurred_at: string;
  business_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  table_name: string;
  record_id: string;
  summary: string;
  old_data: any;
  new_data: any;
  client_ip: string | null;
}

interface ActorOption {
  id: string;
  name: string;
  email: string | null;
}

const TABLE_LABELS: Record<string, string> = {
  customers: 'Customer',
  obligations: 'Debt / Invoice',
  payment_transactions: 'Payment',
  business_members: 'Team & Rights',
  sms_templates: 'SMS Template',
  payment_channels: 'Paybill Channel',
  reminder_schedules: 'Reminder Schedule',
  obligation_entries: 'Ledger Entry',
};

export default function AuditPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedActor, setSelectedActor] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const limit = 40;

  // Inspect Modal
  const [inspectItem, setInspectItem] = useState<AuditItem | null>(null);

  async function loadAuditLogs() {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeBusinessId && !isMasterView) {
        params.set('businessId', activeBusinessId);
      }
      if (selectedActor) {
        params.set('actorId', selectedActor);
      }
      if (selectedTable) {
        params.set('tableName', selectedTable);
      }
      if (selectedAction) {
        params.set('action', selectedAction);
      }
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch audit trail');
      }

      setLogs(json.logs || []);
      setTotalCount(json.totalCount || 0);
      if (json.actors && json.actors.length > 0) {
        setActors(json.actors);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading audit logs');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
  }, [activeBusinessId, selectedActor, selectedTable, selectedAction]);

  useEffect(() => {
    loadAuditLogs();
  }, [activeBusinessId, isMasterView, selectedActor, selectedTable, selectedAction, page]);

  function formatTime(isoStr: string) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-GB', {
        timeZone: 'Africa/Nairobi',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  }

  function getActionBadge(action: string) {
    switch (action.toUpperCase()) {
      case 'INSERT':
        return <Badge variant="success" size="sm">CREATED</Badge>;
      case 'UPDATE':
        return <Badge variant="info" size="sm">UPDATED</Badge>;
      case 'DELETE':
        return <Badge variant="danger" size="sm">DELETED</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{action}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
            Employee Activity & Audit Trail
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable log of all user actions across customers, debts, payments, and staff permissions.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadAuditLogs} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card className="bg-white border-slate-200 shadow-xs p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filter By:</span>
          </div>

          {/* Actor / Employee Filter */}
          <div className="min-w-[180px]">
            <select
              aria-label="Filter by employee"
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Employees & System</option>
              {actors.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.name || act.email}
                </option>
              ))}
            </select>
          </div>

          {/* Entity / Table Filter */}
          <div className="min-w-[160px]">
            <select
              aria-label="Filter by entity type"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Entities</option>
              <option value="customers">Customers</option>
              <option value="obligations">Debts & Invoices</option>
              <option value="payment_transactions">Payments</option>
              <option value="business_members">Team & Rights</option>
              <option value="sms_templates">SMS Templates</option>
              <option value="payment_channels">Payment Channels</option>
            </select>
          </div>

          {/* Action Filter */}
          <div className="min-w-[130px]">
            <select
              aria-label="Filter by action"
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="">All Actions</option>
              <option value="INSERT">Created (Insert)</option>
              <option value="UPDATE">Updated</option>
              <option value="DELETE">Deleted</option>
            </select>
          </div>

          {(selectedActor || selectedTable || selectedAction) && (
            <button
              type="button"
              onClick={() => {
                setSelectedActor('');
                setSelectedTable('');
                setSelectedAction('');
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold underline px-1"
            >
              Clear Filters
            </button>
          )}

          <div className="ml-auto text-[11px] text-slate-400 font-mono">
            {totalCount.toLocaleString()} total logged events
          </div>
        </div>
      </Card>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Activity Log Feed */}
      <Card className="bg-white border-slate-200 shadow-sm p-0 overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-700" />
            <CardTitle className="text-sm font-bold text-slate-800">Activity Log Feed</CardTitle>
          </div>
          <Badge variant="neutral" size="sm">
            Showing {logs.length} of {totalCount}
          </Badge>
        </CardHeader>

        {logs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <History className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">No activity logged for this filter</div>
            <div className="text-xs text-slate-400 mt-1">Try resetting the filters or switching business views.</div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Employee / Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4 min-w-[280px]">Activity Description</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.map((item) => {
                  const entityLabel = TABLE_LABELS[item.table_name] || item.table_name;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {formatTime(item.occurred_at)}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.actor_name}</span>
                        </div>
                        {item.actor_email && (
                          <div className="text-[10px] text-slate-400 font-mono pl-5">{item.actor_email}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {getActionBadge(item.action)}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {entityLabel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-800 font-medium leading-relaxed">
                        {item.summary}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setInspectItem(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Diff
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > limit && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page + 1} of {Math.ceil(totalCount / limit)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * limit >= totalCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Inspect Item Diff Modal */}
      <Modal
        isOpen={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title="Audit Record Details"
        description={inspectItem ? `ID #${inspectItem.id} · ${inspectItem.table_name} · ${formatTime(inspectItem.occurred_at)}` : ''}
        maxWidth="2xl"
      >
        {inspectItem && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px]">
              <div>
                <span className="text-slate-400 block">Actor:</span>
                <span className="font-semibold text-slate-800">{inspectItem.actor_name} ({inspectItem.actor_email || 'System'})</span>
              </div>
              <div>
                <span className="text-slate-400 block">Client IP:</span>
                <span className="font-semibold text-slate-800">{inspectItem.client_ip || 'Internal / Proxy'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Entity:</span>
                <span className="font-semibold text-slate-800">{inspectItem.table_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Record ID:</span>
                <span className="font-semibold text-slate-800 truncate block">{inspectItem.record_id}</span>
              </div>
            </div>

            <div className="space-y-3">
              {inspectItem.new_data && (
                <div>
                  <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Applied State (new_data):</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed">
                    {JSON.stringify(inspectItem.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {inspectItem.old_data && (
                <div>
                  <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>Previous State (old_data):</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-100 text-slate-800 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed border border-slate-200">
                    {JSON.stringify(inspectItem.old_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button type="button" variant="outline" size="sm" onClick={() => setInspectItem(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
