import React from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-[#F6F8F7] text-[#14231A]">
      {/* Desktop Navigation Sidebar (retains Deep Navy) */}
      <Sidebar />

      {/* Main Content Area (Clean White / Off-white Dashboard) */}
      <div className="flex-1 flex flex-col min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Header />
        <main className="flex-1 min-w-0 w-full max-w-[1440px] mx-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7 space-y-4 md:space-y-6">
          {children}
        </main>
      </div>

      {/* Mobile Navigation Bottom Bar */}
      <MobileNav />
    </div>
  );
}
