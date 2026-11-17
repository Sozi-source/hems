'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Fingerprint, Lock, ShieldCheck } from 'lucide-react';

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

export function AppLockGuard({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [hasWebAuthn, setHasWebAuthn] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);

  const loadSecurityState = useCallback(async () => {
    try {
      const res = await fetch('/api/security/pin');
      if (!res.ok) {
        setChecked(true);
        return;
      }
      const json = await res.json();
      setBiometricsEnabled(Boolean(json.biometricsEnabled));
      setHasPin(Boolean(json.hasPin));
      setHasWebAuthn(Boolean(json.hasWebAuthn));
      setTimeoutSec(Number(json.lockTimeoutSeconds || 60));

      const shouldProtect = Boolean(json.biometricsEnabled || json.hasPin);
      if (shouldProtect && !sessionStorage.getItem('hems_unlocked')) {
        setLocked(true);
      }
    } catch {
      // Do not lock out if offline/error on initial check
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    loadSecurityState();
  }, [loadSecurityState]);

  useEffect(() => {
    function handleVisibility() {
      if (!biometricsEnabled && !hasPin) return;
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAtRef.current) {
        const elapsedSec = (Date.now() - hiddenAtRef.current) / 1000;
        hiddenAtRef.current = null;
        if (elapsedSec >= timeoutSec) {
          sessionStorage.removeItem('hems_unlocked');
          setLocked(true);
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [biometricsEnabled, hasPin, timeoutSec]);

  async function handleBiometricUnlock() {
    setError('');
    setBusy(true);
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        setError('Biometrics not supported on this browser. Use your PIN below.');
        return;
      }
      const prepRes = await fetch('/api/security/webauthn');
      const prep = await prepRes.json();
      if (!prepRes.ok || !prep.credentials?.length) {
        setError('No biometric passkey registered on this device. Use your PIN.');
        return;
      }

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToUint8Array(prep.challenge).buffer as ArrayBuffer,
          allowCredentials: prep.credentials.map((c: any) => ({
            id: base64UrlToUint8Array(c.credential_id).buffer as ArrayBuffer,
            type: 'public-key',
          })),
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        setError('Biometric verification cancelled.');
        return;
      }

      const verifyRes = await fetch('/api/security/webauthn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          credentialId: uint8ArrayToBase64Url(assertion.rawId),
        }),
      });

      if (!verifyRes.ok) {
        const vJson = await verifyRes.json();
        setError(vJson.error || 'Biometric verification failed.');
        return;
      }

      sessionStorage.setItem('hems_unlocked', '1');
      setLocked(false);
    } catch (err: any) {
      setError(err?.message || 'Biometric unlock failed. Use your PIN.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/security/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', pin: pinInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Incorrect PIN.');
        return;
      }
      sessionStorage.setItem('hems_unlocked', '1');
      setPinInput('');
      setLocked(false);
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return <>{children}</>;

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[200] bg-[#102719] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl space-y-5 text-center">
        <div className="w-12 h-12 rounded-full bg-[#E8F5EB] text-[#185D2D] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#14231A]">HEMS Locked</h2>
          <p className="text-xs text-slate-600 mt-1">
            Verify with fingerprint, Face ID, or your security PIN to continue.
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-[#FDECEE] border border-[#F4C5CB] text-xs text-[#8F1D2A]">
            {error}
          </div>
        )}

        {biometricsEnabled && hasWebAuthn && (
          <Button
            type="button"
            variant="primary"
            className="w-full h-11"
            onClick={handleBiometricUnlock}
            isLoading={busy}
          >
            <Fingerprint className="w-4 h-4 mr-2" />
            Unlock with Biometrics
          </Button>
        )}

        {hasPin && (
          <form onSubmit={handlePinSubmit} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 text-left">
                Security PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4,8}"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 text-center tracking-widest text-base font-mono"
                required
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full h-11" isLoading={busy}>
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Unlock with PIN
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
