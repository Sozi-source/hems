'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BusinessSwitcher } from './business-switcher';
import { Plus, LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#DCE5DF] px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Mobile: Switcher */}
        <div className="flex lg:hidden items-center gap-2 w-full min-w-0 flex-1">
          <div className="w-7 h-7 rounded-md bg-[#1F7A3D] flex items-center justify-center font-bold text-white text-xs shrink-0">
            H
          </div>
          <div className="flex-1 min-w-0">
            <BusinessSwitcher />
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
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
              {activeBusiness?.name || 'Haron Fashion'}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F1F5F2] text-slate-800 border border-[#DCE5DF]">
              {activeBusiness?.name || 'Zenith Plast'}
            </span>
          )}
        </div>

        {/* Action Button & User Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">New Debt or Bill</span>
            <span className="sr-only sm:hidden">New Debt or Bill</span>
          </Button>

          {userEmail && (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-200 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="whitespace-nowrap tabular-nums text-[clamp(10px,0.75vw,12px)] font-medium">{userEmail}</span>
            </div>
          )}

          <button
            onClick={handleSignOut}
            title="Sign Out"
            aria-label="Sign out"
            className="inline-flex min-h-10 min-w-10 items-center justify-center p-2 rounded-md text-slate-600 hover:text-[#B42332] hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F7A3D]"
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
