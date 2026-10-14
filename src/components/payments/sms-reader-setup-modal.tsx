'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Check, Copy, Wifi, AlertCircle, Globe, Laptop } from 'lucide-react';

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
      title="Android SMS Message Reader Setup"
      maxWidth="lg"
    >
      <p className="text-xs text-slate-600 mb-4 leading-normal">
        Automatically sync incoming Equity Bank, ABSA Bank, and M-Pesa SMS alerts from the client's phone directly into HEMS in real time.
      </p>

      <div className="space-y-4 text-sm">
        {/* Localhost Warning & Domain Switcher */}
        {isLocalhost && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-fintech text-amber-900 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <strong className="font-semibold">Notice: You are currently running on localhost.</strong>
                <p className="text-amber-800 mt-0.5">
                  An external Android phone cannot connect to <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">localhost:3000</code>. For the phone to reach this app, use your deployed domain or a public tunnel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
              <span className="text-[11px] font-semibold text-amber-800">Target Environment:</span>
              <button
                type="button"
                onClick={() => setDomainMode('production')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  domainMode === 'production'
                    ? 'bg-[#1F7A3D] text-white shadow-xs'
                    : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                }`}
              >
                <Globe className="w-3 h-3" />
                Production Domain ({productionDomain.replace('https://', '')})
              </button>
              <button
                type="button"
                onClick={() => setDomainMode('current')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  domainMode === 'current'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100'
                }`}
              >
                <Laptop className="w-3 h-3" />
                Localhost (Dev Only)
              </button>
            </div>
          </div>
        )}

        {/* Endpoint Box */}
        <div className="bg-[#F8FAF9] border border-[#DCE5DF] p-3.5 rounded-fintech space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Webhook Target URL (Enter this in phone app)</span>
            <Badge variant="success">
              <Wifi className="w-3 h-3 mr-1 inline" /> Ready for Connection
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="w-full bg-white border border-[#DCE5DF] rounded-fintech px-3 py-2 text-xs font-mono font-medium text-slate-800 select-all"
            />
            <Button variant="outline" size="sm" onClick={copyUrl} className="shrink-0">
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Step-by-Step Guide */}
        <div className="border border-[#DCE5DF] rounded-fintech p-4 space-y-3 bg-white">
          <h4 className="font-semibold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[#1F7A3D]" />
            3-Minute Phone Configuration (Zero Bank API Required)
          </h4>

          <ol className="list-decimal list-inside space-y-2.5 text-xs text-slate-600">
            <li className="leading-relaxed">
              <strong>Install an SMS Forwarder app</strong> on the phone with the Paybill SIM card (e.g.,{' '}
              <span className="font-semibold text-slate-800">SMS Forwarder by Lanren</span> from F-Droid / Play Store or{' '}
              <span className="font-semibold text-slate-800">MacroDroid</span>).
            </li>
            <li className="leading-relaxed">
              <strong>Add a Webhook Rule:</strong> Set destination to <strong>Webhook (HTTP POST)</strong> and paste the URL above:
              <div className="mt-1 font-mono text-[11px] bg-slate-50 p-1.5 rounded border border-slate-200 select-all">
                {webhookUrl}
              </div>
            </li>
            <li className="leading-relaxed">
              <strong>Set the JSON Request Body:</strong> In the app's template, set the body to:
              <pre className="mt-1 p-2 bg-slate-900 text-emerald-400 rounded text-[11px] font-mono overflow-x-auto">
{`{
  "from": "[from]",
  "text": "[body]",
  "timestamp": "[timestamp]"
}`}
              </pre>
            </li>
            <li className="leading-relaxed">
              <strong>Add Sender Filters:</strong> Filter incoming SMS to trigger only on messages from{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">EQUITYBANK</code>,{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">ABSABANK</code>, or{' '}
              <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">MPESA</code>.
            </li>
          </ol>
        </div>

        {/* Verification Ping */}
        <div className="flex items-center justify-between p-3 bg-[#F1F5F2] rounded-fintech border border-[#DCE5DF]">
          <div>
            <span className="text-xs font-semibold text-slate-800 block">Check Server Readiness</span>
            <span className="text-[11px] text-slate-500">Verify that the webhook handler is reachable.</span>
          </div>
          <div className="flex items-center gap-2">
            {testStatus === 'success' && (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <Check className="w-4 h-4" /> Endpoint Live
              </span>
            )}
            {testStatus === 'failed' && (
              <span className="text-xs font-semibold text-red-600">
                Connection Failed
              </span>
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

        {/* Security Note */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-fintech text-blue-800 text-xs leading-relaxed">
          <strong>Security Note:</strong> All incoming messages are deduplicated by receipt code. If the phone loses connection and re-sends messages in bulk when back online, HEMS safely ignores already-recorded transactions without duplicate crediting.
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end pt-2 border-t border-[#DCE5DF]">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
