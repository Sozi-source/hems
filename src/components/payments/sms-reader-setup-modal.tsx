'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Check, Copy, AlertCircle, Globe, Laptop, ShieldCheck, Activity } from 'lucide-react';

interface SmsReaderSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmsReaderSetupModal({ isOpen, onClose }: SmsReaderSetupModalProps) {
  const [copied, setCopied] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [domainMode, setDomainMode] = useState<'current' | 'production'>('production');

  const productionDomain = 'https://hems-gamma.vercel.app';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      setIsLocalhost(isLocal);
      // Default to production domain if on localhost so client phone gets a reachable public URL
      setDomainMode(isLocal ? 'production' : 'current');
    }
  }, [isOpen]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://hems-gamma.vercel.app';
  const activeBaseUrl = domainMode === 'production' ? productionDomain : origin;
  const webhookUrl = `${activeBaseUrl}/api/payments/sms-forwarder`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestPing = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch('/api/payments/sms-forwarder');
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('failed');
      }
    } catch {
      setTestStatus('failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Android SMS Forwarder Integration"
      maxWidth="lg"
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          Synchronize incoming customer SMS alerts from Equity Bank, ABSA Bank, and Safaricom M-Pesa directly into HEMS in real time.
        </p>

        {/* Card 1: Webhook Endpoint & Environment Switcher */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Target Webhook URL
            </span>
            <Badge variant="success" dot className="text-[11px]">
              Ready for Ingest
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-medium text-slate-800 select-all focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0">
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1 text-slate-500" />}
              {copied ? 'Copied' : 'Copy URL'}
            </Button>
          </div>

          {/* Dev Environment Notice (Restrained, Institutional) */}
          {isLocalhost && (
            <div className="pt-2.5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px]">Running on local dev. Android devices require a reachable public domain.</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDomainMode('production')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 border ${
                    domainMode === 'production'
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  Production
                </button>
                <button
                  type="button"
                  onClick={() => setDomainMode('current')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 border ${
                    domainMode === 'current'
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Laptop className="w-3 h-3" />
                  Localhost
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Configuration Instructions */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-700">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Phone Setup Instructions (MacroDroid / SMS Forwarder)
              </h4>
              <p className="text-[11px] text-slate-500">
                Configured once on the business phone holding the Paybill or Till SIM cards.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-600">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 border border-slate-200">
                1
              </span>
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-900">Set SMS Received Trigger</span>
                <p className="text-slate-500 leading-relaxed">
                  Trigger on incoming SMS. On Xiaomi/Redmi devices, ensure <strong className="text-slate-700">"Monitor inbox"</strong> is checked and content is set to <strong className="text-slate-700">"Any Content"</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 border border-slate-200">
                2
              </span>
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-900">Configure HTTP POST Action</span>
                <p className="text-slate-500 leading-relaxed">
                  Add action: <strong className="text-slate-700">HTTP Request (POST)</strong> and paste the webhook URL above. Set content-type to <strong className="text-slate-700">application/json</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 border border-slate-200">
                3
              </span>
              <div className="space-y-1.5 w-full">
                <span className="font-semibold text-slate-900">Set JSON Request Body</span>
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 font-mono text-[11px] text-slate-200">
                  <pre className="overflow-x-auto leading-relaxed">{`{
  "from": "[from]",
  "text": "[body]",
  "timestamp": "[timestamp]"
}`}</pre>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 border border-slate-200">
                4
              </span>
              <div className="space-y-1">
                <span className="font-semibold text-slate-900">Supported Senders</span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    MPESA
                  </span>
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    EQUITYBANK
                  </span>
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    NCBA
                  </span>
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    ABSABANK
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Server Health Check */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-700">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">Server Health Check</span>
              <span className="text-[11px] text-slate-500">Verify webhook endpoint responsiveness.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {testStatus === 'success' && (
              <Badge variant="success" dot className="text-[11px]">
                Endpoint 200 OK
              </Badge>
            )}
            {testStatus === 'failed' && (
              <Badge variant="danger" dot className="text-[11px]">
                Offline / Unreachable
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestPing}
              isLoading={testStatus === 'testing'}
            >
              Test Endpoint
            </Button>
          </div>
        </div>

        {/* Card 4: Idempotency & Security Guarantee */}
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3.5 flex items-start gap-2.5 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div className="leading-relaxed text-[11px]">
            <strong className="text-slate-800">Duplicate Protection Guaranteed:</strong> Transactions are strictly deduplicated by receipt code. Resent SMS messages will never result in duplicate credit entries.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
