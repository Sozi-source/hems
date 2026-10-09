'use client';

import { useState, type FormEvent } from 'react';
import { AuthError, AuthInput, AuthNotice, AuthSubmit } from '@/components/auth/auth-form';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not request a password reset.'); }
    finally { setLoading(false); }
  }

  return <AuthShell eyebrow="Account recovery" title="Reset your password" description="Enter your account email and we’ll send a secure link to choose a new password." footer={<>Remembered it? <AuthLink href="/login">Back to sign in</AuthLink></>}>
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AuthError>{error}</AuthError>}
      {sent && <AuthNotice>If an account exists for that email, a password reset link is on its way. Check your inbox.</AuthNotice>}
      <AuthInput id="email" label="Work email" type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
      <AuthSubmit loading={loading}>Send reset link <span aria-hidden="true">→</span></AuthSubmit>
    </form>
  </AuthShell>;
}
