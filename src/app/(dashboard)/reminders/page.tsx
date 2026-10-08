'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmt_phone, fmt_date } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { BellRing, Send, RefreshCw } from 'lucide-react';

interface SmsRecord {
  id: string;
  recipient_phone: string;
  recipient_name?: string;
  template_code: string;
  message: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  created_at: string;
}

export default function RemindersPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [messages, setMessages] = useState<SmsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function loadMessages() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from('sms_outbox')
        .select('*')
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Reminders & SMS
        </h1>

        <Button variant="outline" size="sm" onClick={loadMessages} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      <Card>
        {messages.length === 0 ? (
          <div className="text-center py-12 px-4">
            <BellRing className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300">
              No SMS messages yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Message</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-xs">
                {messages.map((sms) => (
                  <tr key={sms.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-200">
                      {fmt_phone(sms.recipient_phone)}
                    </td>

                    <td className="py-3.5 px-4">
                      <Badge variant="purple" size="sm">
                        {sms.template_code}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-4 max-w-md text-slate-300 font-mono text-[11px] leading-relaxed">
                      {sms.message}
                    </td>

                    <td className="py-3.5 px-4 text-slate-400">
                      {fmt_date(sms.created_at, true)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <Badge
                        variant={sms.status === 'delivered' ? 'success' : sms.status === 'sent' ? 'info' : 'warning'}
                        size="sm"
                        dot
                      >
                        {sms.status}
                      </Badge>
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
