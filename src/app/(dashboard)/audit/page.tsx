'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { History, ShieldCheck } from 'lucide-react';

interface AuditRecord {
  id: string;
  business_id: string;
  action: string;
  table_name: string;
  actor_id?: string;
  actor_label?: string;
  record_id?: string;
  new_data?: any;
  occurred_at: string;
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
        .order('occurred_at', { ascending: false })
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-slate-800" />
          Activity Log
        </h1>
      </div>

      <Card className="bg-white border-slate-200/90 shadow-sm p-0 overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-12 px-4">
            <History className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              No activity recorded yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Record Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {fmt_date(log.occurred_at, true)}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold uppercase">
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {log.table_name}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      {log.actor_label || 'User'}
                    </td>

                    <td className="py-3.5 px-4 max-w-sm font-mono text-[11px] text-slate-600 truncate">
                      {log.record_id || '—'}
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
