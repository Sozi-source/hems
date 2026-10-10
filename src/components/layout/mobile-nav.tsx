'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowDownLeft, Receipt, Users, Ellipsis, BellRing, History, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const primaryItems = [
  { label: 'Home', href: '/', icon: LayoutDashboard },
  { label: 'Payments', href: '/payments', icon: ArrowDownLeft },
  { label: 'Debts', href: '/obligations', icon: Receipt },
  { label: 'Customers', href: '/customers', icon: Users },
];

const moreItems = [
  { label: 'Reminders', href: '/reminders', icon: BellRing },
  { label: 'Activity Log', href: '/audit', icon: History },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = moreItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => setIsMoreOpen(false), [pathname]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setIsMoreOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <nav aria-label="Main navigation" className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#102719]/[0.98] border-t border-[#264632] z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 items-stretch px-1 pt-1.5">
        {primaryItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={cn('min-h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold transition-colors', active ? 'text-white bg-white/10' : 'text-[#A7BEAE]')}>
              <Icon className={cn('w-[18px] h-[18px]', active ? 'text-[#8DDBA0]' : 'text-[#A7BEAE]')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="relative" ref={moreRef}>
          {isMoreOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-52 rounded-xl border border-[#365541] bg-[#173622] p-1.5 shadow-xl">
              {moreItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                    className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-xs font-medium', active ? 'bg-slate-800 text-white' : 'text-slate-300')}>
                    <Icon className={cn('h-4 w-4', active && 'text-[#8DDBA0]')} />{item.label}
                  </Link>
                );
              })}
            </div>
          )}
          <button type="button" aria-expanded={isMoreOpen} aria-haspopup="menu" aria-label="More navigation" onClick={() => setIsMoreOpen((open) => !open)}
            className={cn('w-full min-h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium', moreActive || isMoreOpen ? 'text-white bg-white/10' : 'text-[#A7BEAE]')}>
            <Ellipsis className={cn('w-[18px] h-[18px]', moreActive || isMoreOpen ? 'text-[#8DDBA0]' : 'text-[#A7BEAE]')} />
            <span>More</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
