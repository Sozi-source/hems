'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        const message = authError.code === 'invalid_credentials'
          ? 'Email or password is incorrect. Use the credentials for a user in this Supabase project.'
          : authError.code === 'email_not_confirmed'
            ? 'Confirm this email address before signing in.'
            : authError.code === 'email_provider_disabled'
              ? 'Email and password sign-in is disabled for this Supabase project.'
              : authError.message || 'Could not sign in.';
        throw new Error(message);
      }

      if (data.session) {
        window.location.href = '/';
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-[#881337] items-center justify-center font-bold text-white text-lg shadow-sm border border-rose-700/30">
            H
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            HEMS
          </h1>
        </div>

        <Card className="border-slate-200 bg-white shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-fintech bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="owner@hems.co.ke"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Sign In
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
