'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function AuthInput({
  id,
  label,
  type = 'text',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-semibold text-slate-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-[#8d2947] focus:ring-4 focus:ring-[#8d2947]/10 disabled:bg-slate-50"
          {...props}
        />
        {isPassword && <button type="button" onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-700" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800">{children}</div>;
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">{children}</div>;
}

export function AuthSubmit({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return <button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7b263e] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(123,38,62,0.18)] transition hover:bg-[#692035] focus:outline-none focus:ring-4 focus:ring-[#8d2947]/20 disabled:cursor-wait disabled:opacity-65">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{children}</button>;
}
