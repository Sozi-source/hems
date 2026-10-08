'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowDownLeft,
  Receipt,
  Users,
  BellRing,
  History,
  Settings,
  Shield,
} from 'lucide-react';
import { BusinessSwitcher } from './business-switcher';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
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
      label: 'Debts & Invoices',
      href: '/obligations',
      icon: Receipt,
    },
    {
      label: 'Customers',
      href: '/customers',
      icon: Users,
    },
    {
      label: 'Reminders',
      href: '/reminders',
      icon: BellRing,
    },
    {
      label: 'Activity Log',
      href: '/audit',
      icon: History,
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-[#0A1128] border-r border-slate-800/80 h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#881337] flex items-center justify-center font-bold text-white text-sm shadow-sm border border-rose-700/40">
            H
          </div>
          <div className="text-sm font-bold text-white tracking-tight">HEMS</div>
        </div>

        {/* Business Selector */}
        <BusinessSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-fintech text-xs font-medium transition-colors',
                isActive
                  ? 'bg-slate-800/90 text-white border-l-2 border-[#BE123C] shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4',
                  isActive ? 'text-rose-400' : 'text-slate-400'
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User / Session Info */}
      <div className="p-3 border-t border-slate-800/80">
        <div className="flex items-center gap-2.5 p-2 rounded-fintech bg-slate-800/40 border border-slate-700/50 text-xs text-slate-300">
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            <Shield className="w-3.5 h-3.5 text-slate-300" />
          </div>
          <div className="font-medium text-slate-200 truncate">Owner Account</div>
        </div>
      </div>
    </aside>
  );
}
