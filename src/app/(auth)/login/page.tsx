'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { AuthError, AuthInput } from '@/components/auth/auth-form';
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

  return <AuthShell eyebrow="YOUR BUSINESS, IN FOCUS" title="Welcome back" description="Sign in to continue to your workspace." compact footer={<>New to HEMS? <AuthLink href="/signup">Create an account</AuthLink></>}>
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-white bg-white p-5 shadow-[0_18px_50px_-28px_rgba(41,38,41,0.32)] sm:p-7">
      {error && <AuthError>{error}</AuthError>}
      <AuthInput id="email" label="Email address" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2"><label htmlFor="password" className="text-[13px] font-semibold text-slate-700">Password</label><AuthLink href="/forgot-password">Forgot password?</AuthLink></div>
        <AuthInput id="password" label="" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required />
      </div>
      <button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#7b263e] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#692035] focus:outline-none focus:ring-4 focus:ring-[#8d2947]/20 disabled:cursor-wait disabled:opacity-65">
        {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
      </button>
      <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-slate-400"><LockKeyhole className="h-3 w-3" />Your account is protected with secure sign-in</p>
    </form>
  </AuthShell>;
}
