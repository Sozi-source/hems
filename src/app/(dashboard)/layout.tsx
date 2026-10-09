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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Navigation Sidebar (retains Deep Navy) */}
      <Sidebar />

      {/* Main Content Area (Clean White / Off-white Dashboard) */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <Header />
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4 md:space-y-6">
          {children}
        </main>
      </div>

      {/* Mobile Navigation Bottom Bar */}
      <MobileNav />
    </div>
  );
}
