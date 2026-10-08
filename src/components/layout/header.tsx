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
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md border-b border-surface-border px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Mobile: Switcher */}
        <div className="flex lg:hidden items-center gap-3 w-full max-w-xs">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
            H
          </div>
          <div className="flex-1 min-w-0">
            <BusinessSwitcher />
          </div>
        </div>

        {/* Desktop: Current View Scope */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="text-slate-400">Viewing:</span>
          {isMasterView ? (
            <Badge variant="purple" size="md">
              All Businesses
            </Badge>
          ) : (
            <Badge
              variant={activeBusinessCode === 'HARON_FASHION' ? 'danger' : 'info'}
              size="md"
            >
              {activeBusiness?.name || activeBusinessCode}
            </Badge>
          )}
        </div>

        {/* Action Button & User Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Debt or Bill
          </Button>

          {userEmail && (
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-surface-border text-xs text-slate-300">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate max-w-[140px]">{userEmail}</span>
            </div>
          )}

          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-300 hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <CreateObligationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          // Trigger page reload / event
          window.location.reload();
        }}
      />
    </header>
  );
}
