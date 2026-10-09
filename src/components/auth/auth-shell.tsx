import Link from 'next/link';
import { ArrowUpRight, Building2, ShieldCheck } from 'lucide-react';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#f1f1f2] text-slate-900">
      <div className="grid min-h-dvh w-full lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#292629] p-10 text-white lg:flex xl:p-14">
          <div className="relative z-10">
            <Link href="/login" className="inline-flex items-center gap-3" aria-label="HEMS home">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8d2947] shadow-lg shadow-black/20">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold tracking-[0.22em]">HEMS</span>
            </Link>
          </div>
          <div className="relative z-10 max-w-md py-12">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">Business management</p>
            <h2 className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-[46px]">Your business, in focus.</h2>
            <div className="mt-9 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-rose-200"><ShieldCheck className="h-5 w-5" /></span>
              <div><p className="text-sm font-semibold">Secure access</p><p className="mt-1 text-xs text-white/60">Role-based · Auditable</p></div>
            </div>
          </div>
          <div className="relative z-10 flex items-center justify-between text-xs text-white/45">
            <span>HEMS</span><span>Secure</span>
          </div>
        </aside>

        <section className="flex min-h-dvh flex-col bg-[#f1f1f2] px-4 py-4 sm:px-10 sm:py-10 lg:px-14 xl:px-20">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden sm:mb-10">
            <Link href="/login" className="inline-flex items-center gap-2.5" aria-label="HEMS home">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7b263e] text-white"><Building2 className="h-5 w-5" /></span>
              <span className="text-sm font-bold tracking-[0.2em]">HEMS</span>
            </Link>
            <span className="text-xs font-medium text-slate-500">Secure workspace</span>
          </div>
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-2 sm:max-w-[420px] sm:py-4">
            <div className="mb-6 sm:mb-8">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d2947] sm:mb-3 sm:text-[11px]">{eyebrow}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-[#252126] sm:text-[34px]">{title}</h1>
              <p className="mt-1.5 text-sm leading-5 text-slate-500 sm:mt-2.5 sm:leading-6">{description}</p>
            </div>
            {children}
            {footer && <div className="mt-5 text-center text-[13px] text-slate-500 sm:mt-7 sm:text-sm">{footer}</div>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-slate-400 sm:mt-8 sm:text-[11px] lg:justify-between">
            <span>© {new Date().getFullYear()} HEMS</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Protected sign-in</span>
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 font-semibold text-[#7b263e] transition hover:text-[#5f1d30]">{children}<ArrowUpRight className="h-3.5 w-3.5" /></Link>;
}
