'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBusiness } from '@/context/business-context';
import { BellRing } from 'lucide-react';

interface LoanRemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoanRemindersModal({ isOpen, onClose }: LoanRemindersModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [selectedBizId, setSelectedBizId] = useState('');
  const [reminderTime, setReminderTime] = useState('08:00');
  const [phonesText, setPhonesText] = useState('');
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);

  const [logs, setLogs] = useState<any[]>([]);
  const [cronRuns, setCronRuns] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const defaultBiz = !isMasterView && activeBusinessId ? activeBusinessId : businesses[0]?.id || '';
    setSelectedBizId(defaultBiz);
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  async function loadData(bizId: string) {
    if (!bizId) return;
    const res = await fetch(`/api/loans/reminders?businessId=${bizId}`);
    const json = await res.json();
    if (!res.ok) return;

    const setting = (json.settings || [])[0];
    if (setting) {
      setReminderTime(setting.reminder_time || '08:00');
      setPhonesText((setting.recipient_phones || []).join(', '));
      setInAppEnabled(Boolean(setting.in_app_enabled));
      setPushEnabled(Boolean(setting.push_enabled));
      setSmsEnabled(Boolean(setting.sms_enabled));
    } else {
      setReminderTime('08:00');
      setPhonesText('');
      setInAppEnabled(true);
      setPushEnabled(true);
      setSmsEnabled(true);
    }
    setLogs(json.logs || []);
    setCronRuns(json.cronRuns || []);
  }

  useEffect(() => {
    if (isOpen && selectedBizId) {
      loadData(selectedBizId);
    }
  }, [isOpen, selectedBizId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/loans/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBizId,
          reminderTime,
          recipientPhones: phonesText,
          inAppEnabled,
          pushEnabled,
          smsEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to save settings.');
        return;
      }
      setNotice('Loan reminder settings saved.');
      loadData(selectedBizId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-[#185D2D]" />
          <span>Loan Reminders & Automation Logs</span>
        </div>
      }
      description="Configure daily 8:00 AM (Africa/Nairobi) owner alerts and inspect server-side cron runs."
      maxWidth="3xl"
    >
      <div className="space-y-5">
        <form onSubmit={handleSave} className="space-y-4 p-4 rounded-lg bg-[#F6F8F7] border border-slate-200">
          {error && (
            <div className="p-2.5 rounded bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A]">{error}</div>
          )}
          {notice && (
            <div className="p-2.5 rounded bg-[#E8F5EB] border border-[#BBDCC4] text-xs text-[#185D2D]">{notice}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business</label>
              <select
                value={selectedBizId}
                onChange={(e) => setSelectedBizId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Daily Reminder Time (Africa/Nairobi)
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recipient Phone Number(s) for SMS (comma-separated, e.g. 254712345678)
            </label>
            <input
              type="text"
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={inAppEnabled} onChange={(e) => setInAppEnabled(e.target.checked)} className="accent-[#185D2D] w-4 h-4" />
              <span>In-App Notifications</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} className="accent-[#185D2D] w-4 h-4" />
              <span>Push Notifications</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} className="accent-[#185D2D] w-4 h-4" />
              <span>SMS Alerts</span>
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>
              Save Settings
            </Button>
          </div>
        </form>

        {/* Cron Job Runs */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Recent Server Automation Runs
          </h4>
          {cronRuns.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No automated runs recorded yet.
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Run Time</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                    <th className="py-2 px-3 font-semibold text-right">Sent</th>
                    <th className="py-2 px-3 font-semibold text-right">Failures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cronRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="py-2 px-3">{new Date(run.started_at).toLocaleString()}</td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{run.reminders_sent}</td>
                      <td className="py-2 px-3 text-right font-mono">{run.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reminder Logs */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Reminders Log ({logs.length})
          </h4>
          {logs.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              No loan reminders dispatched yet.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Date</th>
                    <th className="py-2 px-3 font-semibold">Channel</th>
                    <th className="py-2 px-3 font-semibold">Recipient</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 px-3">{log.reminder_date}</td>
                      <td className="py-2 px-3 uppercase font-semibold">{log.channel}</td>
                      <td className="py-2 px-3">{log.recipient}</td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={log.status === 'sent' ? 'success' : log.status === 'failed' ? 'danger' : 'neutral'}
                          size="sm"
                        >
                          {log.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
