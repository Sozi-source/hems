'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Database, Download, Fingerprint, Lock, RotateCcw } from 'lucide-react';

function base64UrlToUint8Array(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupAndSecurityCards() {
  // Backup state
  const [backups, setBackups] = useState<any[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupErr, setBackupErr] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);

  // Security state
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [hasWebAuthn, setHasWebAuthn] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(60);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [secBusy, setSecBusy] = useState(false);
  const [secMsg, setSecMsg] = useState('');
  const [secErr, setSecErr] = useState('');

  async function loadAll() {
    const [bRes, sRes] = await Promise.all([
      fetch('/api/backups'),
      fetch('/api/security/pin'),
    ]);
    if (bRes.ok) {
      const bJson = await bRes.json();
      setBackups(bJson.backups || []);
    }
    if (sRes.ok) {
      const sJson = await sRes.json();
      setBiometricsEnabled(Boolean(sJson.biometricsEnabled));
      setHasPin(Boolean(sJson.hasPin));
      setHasWebAuthn(Boolean(sJson.hasWebAuthn));
      setLockTimeout(Number(sJson.lockTimeoutSeconds || 60));
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleBackupNow() {
    setBackupBusy(true);
    setBackupMsg('');
    setBackupErr('');
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setBackupErr(json.error || 'Backup failed.');
        return;
      }
      setBackupMsg('Encrypted backup created and verified.');
      loadAll();
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setBackupBusy(true);
    setBackupMsg('');
    setBackupErr('');
    try {
      const res = await fetch(`/api/backups/${restoreTarget.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBackupErr(json.error || 'Restore failed.');
        return;
      }
      setBackupMsg('Backup integrity verified and data restored successfully.');
      setRestoreTarget(null);
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    setSecBusy(true);
    setSecMsg('');
    setSecErr('');
    try {
      const res = await fetch('/api/security/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_pin', pin: newPin, currentPin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSecErr(json.error || 'Failed to save PIN.');
        return;
      }
      setCurrentPin('');
      setNewPin('');
      setSecMsg('Security PIN saved.');
      loadAll();
    } finally {
      setSecBusy(false);
    }
  }

  async function handleRegisterBiometrics() {
    setSecBusy(true);
    setSecMsg('');
    setSecErr('');
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        setSecErr('This browser/device does not support WebAuthn biometrics.');
        return;
      }
      const prepRes = await fetch('/api/security/webauthn');
      const prep = await prepRes.json();
      if (!prepRes.ok) {
        setSecErr(prep.error || 'Failed to initialize biometric registration.');
        return;
      }

      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToUint8Array(prep.challenge).buffer as ArrayBuffer,
          rp: { name: 'HEMS' },
          user: {
            id: new TextEncoder().encode(prep.userId),
            name: prep.userEmail,
            displayName: prep.userEmail,
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!cred) {
        setSecErr('Biometric registration cancelled.');
        return;
      }

      const regRes = await fetch('/api/security/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          credentialId: uint8ArrayToBase64Url(cred.rawId),
          publicKey: uint8ArrayToBase64Url(cred.response.clientDataJSON),
          deviceName: navigator.userAgent.slice(0, 80),
        }),
      });
      if (!regRes.ok) {
        const rJson = await regRes.json();
        setSecErr(rJson.error || 'Failed to save biometric credential.');
        return;
      }
      setSecMsg('Device biometrics enabled.');
      loadAll();
    } catch (err: any) {
      setSecErr(err?.message || 'Biometric setup failed.');
    } finally {
      setSecBusy(false);
    }
  }

  async function handleToggleBiometrics(nextEnabled: boolean) {
    setSecBusy(true);
    setSecMsg('');
    setSecErr('');
    try {
      const res = await fetch('/api/security/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_settings',
          enabled: nextEnabled,
          lockTimeoutSeconds: lockTimeout,
        }),
      });
      if (res.ok) {
        setBiometricsEnabled(nextEnabled);
        setSecMsg('Security settings updated.');
      }
    } finally {
      setSecBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Backup & Restore */}
      <Card className="p-5 space-y-4">
        <CardHeader className="p-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#185D2D]" />
            <CardTitle className="text-base">Backup & Restore</CardTitle>
          </div>
          <Button variant="primary" size="sm" onClick={handleBackupNow} isLoading={backupBusy}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Back up now
          </Button>
        </CardHeader>

        {backupErr && (
          <div className="p-2.5 rounded bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A]">{backupErr}</div>
        )}
        {backupMsg && (
          <div className="p-2.5 rounded bg-[#E8F5EB] border border-[#BBDCC4] text-xs text-[#185D2D]">{backupMsg}</div>
        )}

        <p className="text-xs text-slate-600">
          Encrypted AES-256-GCM snapshots of all HEMS data (businesses, loans, payments, customers, and settings).
        </p>

        {backups.length === 0 ? (
          <div className="p-4 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            No encrypted backups created yet.
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {backups.map((b) => (
              <div key={b.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-slate-800">
                    {new Date(b.created_at).toLocaleString()}
                  </div>
                  <div className="text-slate-500">
                    {formatBytes(b.size_bytes)} · <span className="capitalize">{b.trigger_type}</span>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setRestoreTarget(b)}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Biometric & PIN Security */}
      <Card className="p-5 space-y-4">
        <CardHeader className="p-0 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#185D2D]" />
            <CardTitle className="text-base">Biometric & PIN Security</CardTitle>
          </div>
          <Badge variant={biometricsEnabled || hasPin ? 'success' : 'neutral'} size="sm">
            {biometricsEnabled || hasPin ? 'Protected' : 'Off'}
          </Badge>
        </CardHeader>

        {secErr && (
          <div className="p-2.5 rounded bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A]">{secErr}</div>
        )}
        {secMsg && (
          <div className="p-2.5 rounded bg-[#E8F5EB] border border-[#BBDCC4] text-xs text-[#185D2D]">{secMsg}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-[#F6F8F7] border border-slate-200">
          <div className="text-xs">
            <div className="font-semibold text-slate-800">Fingerprint / Face ID</div>
            <div className="text-slate-500">
              {hasWebAuthn ? 'Device passkey registered' : 'Register this device for biometric unlock'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleRegisterBiometrics} disabled={secBusy}>
              <Fingerprint className="w-3.5 h-3.5 mr-1" />
              {hasWebAuthn ? 'Add Device' : 'Enable Biometrics'}
            </Button>
            {hasWebAuthn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleBiometrics(!biometricsEnabled)}
                disabled={secBusy}
              >
                {biometricsEnabled ? 'Disable' : 'Enable'}
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSavePin} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hasPin && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {hasPin ? 'New PIN (4–8 digits)' : 'Set Security PIN (4–8 digits)'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Auto-lock timeout:</span>
              <select
                value={lockTimeout}
                onChange={(e) => setLockTimeout(Number(e.target.value))}
                className="h-8 px-2 rounded border border-slate-300 bg-white"
              >
                <option value={15}>15s</option>
                <option value={60}>1 min</option>
                <option value={300}>5 min</option>
              </select>
            </div>
            <Button type="submit" variant="primary" size="sm" isLoading={secBusy}>
              {hasPin ? 'Change PIN' : 'Save PIN'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Restore Confirmation Modal */}
      <Modal
        isOpen={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        title="Confirm Backup Restore"
        description="Verify backup details before restoring data."
        maxWidth="md"
      >
        {restoreTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-[#FFF4D8] border border-[#F0D99B] text-[#754900]">
              Restoring will overwrite matching records with the snapshot from{' '}
              <strong>{new Date(restoreTarget.created_at).toLocaleString()}</strong> (
              {formatBytes(restoreTarget.size_bytes)}).
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRestoreTarget(null)} disabled={backupBusy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmRestore} isLoading={backupBusy}>
                Confirm & Restore
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
