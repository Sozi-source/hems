'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BusinessSwitcher } from './business-switcher';
import { Plus, LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { LivePaymentNotifier } from '@/components/payments/live-payment-notifier';
import { PwaRegistrar } from './pwa-registrar';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();
  const { activeBusinessCode, activeBusiness, isMasterView } = useBusiness();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) {
          setUserEmail(data.user.email);
        }
      } catch {
        // Ignore if unauthenticated
      }
    }
    getUser();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 px-3 py-2 sm:px-5 sm:py-2.5">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Mobile: Logo + Clean Business Switcher */}
        <div className="flex lg:hidden items-center gap-2 min-w-0 flex-1">
          <img
            src="/assets/icons/icon-192.png"
            alt="HEMS"
            className="w-8 h-8 rounded-lg shrink-0 object-cover border border-slate-200"
          />
          <div className="flex-1 min-w-0">
            <BusinessSwitcher variant="header" />
          </div>
        </div>

        {/* Desktop: Current View Scope */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Workspace:</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-900 border border-slate-200">
            {isMasterView
              ? 'All Businesses'
              : activeBusiness?.name || activeBusinessCode}
          </span>
        </div>

        {/* Right Controls — Clean, uncrowded enterprise bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PwaRegistrar />
          <LivePaymentNotifier />

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="hidden sm:inline-flex h-9 px-3 items-center justify-center rounded-lg bg-[#123520] hover:bg-[#19472B] text-white text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>New Entry</span>
          </button>

          {userEmail && (
            <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="whitespace-nowrap tabular-nums text-xs font-medium">{userEmail}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            title="Sign Out"
            aria-label="Sign out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CreateObligationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          window.location.reload();
        }}
      />
    </header>
  );
}
