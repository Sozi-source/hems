'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowDownLeft, Receipt, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileNav() {
  const pathname = usePathname();

  const items = [
    {
      label: 'Overview',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      label: 'Payments',
      href: '/payments',
      icon: ArrowDownLeft,
    },
    {
      label: 'Obligations',
      href: '/obligations',
      icon: Receipt,
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0A1128]/95 backdrop-blur-xl border-t border-slate-800 px-2 py-1.5 z-40 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition-all select-none',
                isActive
                  ? 'text-white bg-slate-800/90'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className={cn('w-5 h-5 mb-0.5', isActive ? 'text-rose-400' : 'text-slate-400')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
