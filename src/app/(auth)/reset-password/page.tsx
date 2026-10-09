'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, AuthInput, AuthSubmit } from '@/components/auth/auth-form';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter(); const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('This reset link is invalid or expired. Request a new one.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/'); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update your password.'); setLoading(false); }
  }

  return <AuthShell eyebrow="Secure account recovery" title="Choose a new password" description="Create a new password for your HEMS account." footer={<AuthLink href="/login">Return to sign in</AuthLink>}>
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AuthError>{error}</AuthError>}
      <AuthInput id="password" label="New password" type="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
      <AuthInput id="confirm-password" label="Confirm new password" type="password" placeholder="Re-enter your password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
      <AuthSubmit loading={loading}>Update password <span aria-hidden="true">→</span></AuthSubmit>
    </form>
  </AuthShell>;
}
