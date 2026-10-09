'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, AuthInput, AuthNotice, AuthSubmit } from '@/components/auth/auth-form';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (authError) throw authError;
      if (data.session) {
        router.replace('/');
        router.refresh();
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow=""
      title="Create account"
      description=""
      footer={<>Already have an account? <AuthLink href="/login">Sign in</AuthLink></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[#d9d2d5] p-4 sm:p-5">
        {error && <AuthError>{error}</AuthError>}
        {sent && <AuthNotice>Check your email to confirm. An administrator must assign your business access.</AuthNotice>}
        <AuthInput id="full-name" label="Full name" placeholder="Your name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required />
        <AuthInput id="email" label="Work email" type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <AuthInput id="password" label="Create password" type="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
        <AuthInput id="confirm-password" label="Confirm password" type="password" placeholder="Re-enter your password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        <AuthSubmit loading={loading}>Create account</AuthSubmit>
      </form>
    </AuthShell>
  );
}
