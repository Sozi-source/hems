import Link from 'next/link';
import { ArrowUpRight, Building2, ShieldCheck } from 'lucide-react';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <main className="min-h-dvh bg-[#F5F7F3] text-slate-900">
      <div className="grid min-h-dvh w-full lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#102719] p-10 text-white lg:flex xl:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-40 -top-36 h-[34rem] w-[34rem] rounded-full bg-[#214A30]/75 blur-3xl" />
            <div className="absolute -right-20 top-1/4 h-[30rem] w-[30rem] rounded-full border border-white/[0.06]" />
            <div className="absolute -right-5 top-[32%] h-[21rem] w-[21rem] rounded-full border border-white/[0.06]" />
            <div className="absolute bottom-0 left-0 h-1 w-32 bg-[#AEF359]" />
          </div>

          <div className="relative z-10">
            <Link href="/login" className="inline-flex items-center gap-3" aria-label="HEMS home">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#AEF359] text-[#102719] shadow-lg shadow-black/20">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold tracking-[0.22em]">HEMS</span>
            </Link>
          </div>

          <div className="relative z-10 max-w-lg py-12">
            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#AEF359]">
              Business management, made clear
            </p>
            <h2 className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-[48px]">
              Your business,<br />in focus.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#D2E1D6]">
              Keep customer balances, payments and daily operations together in one workspace.
            </p>
            <div className="mt-9 flex items-center gap-3 border-t border-white/10 pt-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[#AEF359]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-white">Private business workspace</p>
                <p className="mt-1 text-xs text-white/55">Access is protected by your account and role.</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between text-xs text-white/45">
            <span>HEMS</span>
            <span>Business management</span>
          </div>
        </aside>

        <section className="flex min-h-dvh flex-col bg-[#F5F7F3] px-5 py-5 sm:px-10 sm:py-8 lg:px-14 xl:px-20">
          <div className="mb-6 flex items-center lg:hidden sm:mb-10">
            <Link href="/login" className="inline-flex items-center gap-2.5" aria-label="HEMS home">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#AEF359] text-[#102719]">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold tracking-[0.2em]">HEMS</span>
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center py-2 sm:py-4">
            <div className={compact ? 'mb-4 sm:mb-5' : 'mb-6 sm:mb-8'}>
              {eyebrow && (
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#315F3C] sm:mb-3 sm:text-[11px]">
                  {eyebrow}
                </p>
              )}
              <h1 className="text-3xl font-semibold tracking-tight text-[#17251B] sm:text-[36px]">{title}</h1>
              {description && <p className="mt-2 text-sm leading-5 text-slate-500 sm:leading-6">{description}</p>}
            </div>
            {children}
            {footer && <div className="mt-4 text-center text-[13px] text-slate-500 sm:mt-5 sm:text-sm">{footer}</div>}
          </div>

          <div className="mt-5 flex items-center justify-center text-[10px] text-slate-400 sm:mt-8 sm:text-[11px] lg:justify-end">
            <span>© {new Date().getFullYear()} HEMS</span>
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-semibold text-[#315F3C] transition hover:text-[#102719]">
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}
