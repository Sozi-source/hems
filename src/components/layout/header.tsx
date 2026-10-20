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
    <header className="sticky top-0 z-30 bg-white border-b border-[#DCE5DF] px-3 py-2 sm:px-4 sm:py-2.5 shadow-[0_1px_3px_rgb(16_39_25/0.04)]">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Mobile: Logo + High-Contrast Business Switcher */}
        <div className="flex lg:hidden items-center gap-2 min-w-0 flex-1">
          <img
            src="/assets/icons/icon-192.png"
            alt="HEMS"
            className="w-8 h-8 rounded-lg shrink-0 object-cover border border-[#216B3B]/20 shadow-2xs"
          />
          <div className="flex-1 min-w-0">
            <BusinessSwitcher variant="header" />
          </div>
        </div>

        {/* Desktop: Current View Scope */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Viewing:</span>
          {isMasterView ? (
            <Badge variant="purple" size="md">
              All Businesses
            </Badge>
          ) : activeBusinessCode === 'HARON_FASHION' ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F3EDE0] text-[#14231A] border border-[#DFD2B6]">
              {activeBusiness?.name || 'Haron Fashion'}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAEFEC] text-[#14231A] border border-[#CBD6CF]">
              {activeBusiness?.name || 'Zenith Plast'}
            </span>
          )}
        </div>

        {/* Action Button & User Controls — Uniform h-9 (36px) bar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <PwaRegistrar />
          <LivePaymentNotifier />

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            title="New Debt or Bill"
            aria-label="New Debt or Bill"
            className="inline-flex h-9 w-9 sm:w-auto sm:px-3 items-center justify-center rounded-lg bg-[#144827] hover:bg-[#1B5E34] text-white text-xs font-semibold transition-colors shadow-2xs shrink-0"
          >
            <Plus className="w-4 h-4 sm:mr-1.5 shrink-0" />
            <span className="hidden sm:inline">New Debt or Bill</span>
          </button>

          {userEmail && (
            <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="whitespace-nowrap tabular-nums text-[clamp(10px,0.75vw,12px)] font-medium">{userEmail}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            title="Sign Out"
            aria-label="Sign out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#DCE5DF] bg-[#F6F8F7] text-slate-700 hover:text-[#B42332] hover:bg-rose-50 hover:border-rose-200 transition-colors shrink-0"
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
