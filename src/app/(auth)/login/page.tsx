'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, AuthInput, AuthSubmit } from '@/components/auth/auth-form';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth_error') === 'link') {
      setError('That confirmation or reset link is invalid or expired. Request a new link and try again.');
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        if (authError.code === 'email_not_confirmed') throw new Error('Confirm your email address before signing in.');
        if (authError.code === 'email_provider_disabled') throw new Error('Email and password sign-in is disabled for this project.');
        throw new Error(authError.code === 'invalid_credentials' ? 'The email or password is incorrect.' : authError.message || 'Could not sign in.');
      }
      router.replace('/'); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); setLoading(false); }
  }

  return <AuthShell eyebrow="Welcome back" title="Sign in to HEMS" description="Enter your work email and password to access your business workspace." footer={<>New to HEMS? <AuthLink href="/signup">Create an account</AuthLink></>}>
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AuthError>{error}</AuthError>}
      <AuthInput id="email" label="Work email" type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      <div className="space-y-2">
        <div className="flex items-center justify-between"><label htmlFor="password" className="text-[13px] font-semibold text-slate-700">Password</label><AuthLink href="/forgot-password">Forgot password?</AuthLink></div>
        <AuthInput id="password" label="" type="password" placeholder="Enter your password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <AuthSubmit loading={loading}>Sign in securely <span aria-hidden="true">→</span></AuthSubmit>
      <p className="text-center text-xs leading-5 text-slate-400">Access is limited to users assigned to a HEMS business workspace.</p>
    </form>
  </AuthShell>;
}
