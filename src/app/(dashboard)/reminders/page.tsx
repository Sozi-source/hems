'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmt_phone, fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { describeSmsStatus } from '@/lib/sms-status';
import { BellRing, RefreshCw, Send, CheckCircle2, AlertCircle, Clock, CheckCheck, XCircle } from 'lucide-react';

interface SmsRecord {
  id: string;
  to_phone: string;
  kind: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
}

export default function RemindersPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [messages, setMessages] = useState<SmsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  async function loadMessages() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from('sms_outbox')
        .select('id, to_phone, kind, body, status, error, created_at')
        .order('created_at', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      const { data } = await query;
      setMessages((data as SmsRecord[]) || []);
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, [activeBusinessId, isMasterView]);

  async function handleTriggerReminders() {
    setIsDispatching(true);
    setDispatchNotice(null);
    setDispatchError(null);
    try {
      const res = await fetch('/api/sms/dispatch', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to dispatch reminders');
      }
      setDispatchNotice('Reminder check completed. Overdue daily reminders and due soon messages evaluated.');
      await loadMessages();
    } catch (err: any) {
      setDispatchError(err.message || 'Failed to trigger reminders.');
    } finally {
      setIsDispatching(false);
    }
  }

  // Summary counts
  const totalCount = messages.length;
  const sentCount = messages.filter((m) => m.status === 'sent' || m.status === 'delivered').length;
  const queuedCount = messages.filter((m) => m.status === 'queued' || m.status === 'sending').length;
  const failedCount = messages.filter((m) => m.status === 'failed' || m.status === 'undelivered').length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
            Reminders & SMS Outbox
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated daily reminders for overdue debts and advance notices for upcoming due dates (strictly single-SMS &le; 160 chars).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadMessages} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleTriggerReminders}
            isLoading={isDispatching}
            className="bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] shadow-2xs"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Check & Dispatch Reminders
          </Button>
        </div>
      </div>

      {/* Notices */}
      {dispatchNotice && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{dispatchNotice}</span>
        </div>
      )}
      {dispatchError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{dispatchError}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Messages</span>
            <BellRing className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">{totalCount}</div>
        </Card>

        <Card className="bg-white border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-700">
            <span>Sent / Delivered</span>
            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{sentCount}</div>
        </Card>

        <Card className="bg-white border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-700">
            <span>In Queue</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1">{queuedCount}</div>
        </Card>

        <Card className="bg-white border-slate-200 p-3 shadow-xs">
          <div className="flex items-center justify-between text-xs text-rose-700">
            <span>Failed / Bounced</span>
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-700 mt-1">{failedCount}</div>
        </Card>
      </div>

      {/* Outbox Table */}
      <Card className="bg-white border-[#DCE5DF] shadow-sm p-0 overflow-hidden">
        {messages.length === 0 ? (
          <div className="text-center py-12 px-4">
            <BellRing className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              No SMS messages yet
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-card">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Message (Characters &le; 160)</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EDE8] text-[13px]">
                {messages.map((sms) => (
                  <tr key={sms.id} className="hover:bg-[#F8FAF8] transition-colors">
                    <td className="whitespace-nowrap tabular-nums py-3.5 px-4 font-mono font-semibold text-slate-900">
                      {fmt_phone(sms.to_phone)}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                        {sms.kind.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 min-w-[260px] max-w-[440px] whitespace-normal text-slate-700 font-sans text-xs leading-relaxed">
                      <div>{sms.body}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        Length: {sms.body.length} chars (Single SMS compliant)
                      </div>
                    </td>

                    <td className="whitespace-nowrap tabular-nums py-3.5 px-4 text-slate-600 text-xs">
                      {fmt_date(sms.created_at, true)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {(() => {
                        const view = describeSmsStatus(sms.status, sms.error);
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant={view.variant} size="sm" dot>
                              {view.label}
                            </Badge>
                            {view.note && (
                              <span className="max-w-[180px] text-[11px] leading-snug text-slate-600">
                                {view.note}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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
