'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { History, Lock } from 'lucide-react';

interface AuditRecord {
  id: string;
  business_id: string;
  action: string;
  table_name: string;
  actor_id?: string;
  actor_email?: string;
  record_id?: string;
  changes?: any;
  created_at: string;
}

export default function AuditPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function loadLogs() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      const { data } = await query;
      setLogs((data as AuditRecord[]) || []);
    } catch {
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, [activeBusinessId, isMasterView]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-indigo-400" />
          Activity Log
        </h1>
      </div>

      <Card>
        {logs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <History className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300">
              No activity recorded yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {fmt_date(log.created_at, true)}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {log.table_name}
                    </td>

                    <td className="py-3.5 px-4 text-slate-200">
                      {log.actor_email || log.actor_id || 'System'}
                    </td>

                    <td className="py-3.5 px-4 max-w-sm font-mono text-[11px] text-slate-300 truncate">
                      {typeof log.changes === 'object'
                        ? JSON.stringify(log.changes)
                        : String(log.changes || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
