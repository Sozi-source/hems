'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PendingApprovalsCard } from '@/components/dashboard/pending-approvals-card';
import { RecentActivityList } from '@/components/dashboard/recent-activity-list';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import {
  Wallet,
  TrendingDown,
  CheckCircle2,
  Clock,
  CreditCard,
  Plus,
} from 'lucide-react';
import { PaymentTransaction, Obligation } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { ApprovePaymentModal } from '@/components/payments/approve-payment-modal';
import { RejectPaymentModal } from '@/components/payments/reject-payment-modal';

export default function DashboardOverviewPage() {
  const { activeBusinessCode, activeBusiness, activeBusinessId, isMasterView, businesses } = useBusiness();

  const [stats, setStats] = useState({
    receivablesTotalMinor: 0,
    payablesTotalMinor: 0,
    collectedMonthMinor: 0,
    pendingApprovalMinor: 0,
  });

  const [businessCardsData, setBusinessCardsData] = useState<Record<string, { debt: number; collected: number }>>({});
  const [pendingPayments, setPendingPayments] = useState<PaymentTransaction[]>([]);
  const [recentObligations, setRecentObligations] = useState<Obligation[]>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activePaymentForApproval, setActivePaymentForApproval] = useState<PaymentTransaction | null>(null);
  const [activePaymentForRejection, setActivePaymentForRejection] = useState<PaymentTransaction | null>(null);

  async function loadDashboard() {
    try {
      const supabase = createClient();

      // 1. Fetch pending payments (all pending for accurate totals; PendingApprovalsCard previews top 5)
      let paymentsQuery = supabase
        .from('payment_transactions')
        .select('id,business_id,provider,transaction_ref,amount_minor,occurred_at,payer_msisdn,payer_name,account_reference,status,unallocated_minor,match_confidence,conflict_flags')
        .eq('status', 'pending')
        .order('occurred_at', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        paymentsQuery = paymentsQuery.eq('business_id', activeBusinessId);
      }

      const { data: paymentsData } = await paymentsQuery;
      const validPayments = (paymentsData as PaymentTransaction[]) || [];
      setPendingPayments(validPayments);

      // 2. Fetch recent obligations using view
      let obligationsQuery = supabase
        .from('v_obligation_overview')
        .select('id, business_id, kind, direction, counterparty_name, original_minor, balance_minor, status, due_date, issue_date, reference_no, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!isMasterView && activeBusinessId) {
        obligationsQuery = obligationsQuery.eq('business_id', activeBusinessId);
      }

      const { data: obligationsData } = await obligationsQuery;
      const formattedObligations = (obligationsData || []).map((o: any) => ({
        id: o.id,
        business_id: o.business_id,
        kind: o.kind,
        direction: o.direction,
        party_id: '',
        party_name: o.counterparty_name,
        principal_minor: Number(o.original_minor || 0),
        balance_minor: Number(o.balance_minor || 0),
        status: o.status,
        due_date: o.due_date,
        issue_date: o.issue_date,
        reference_no: o.reference_no,
        created_at: o.created_at,
      }));
      setRecentObligations(formattedObligations as Obligation[]);

      // 3. Fetch settled payments this month for real collection totals
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      let settledMonthQuery = supabase
        .from('payment_transactions')
        .select('business_id, amount_minor')
        .in('status', ['approved', 'settled'])
        .gte('occurred_at', startOfMonth.toISOString());

      if (!isMasterView && activeBusinessId) {
        settledMonthQuery = settledMonthQuery.eq('business_id', activeBusinessId);
      }

      const { data: settledMonthData } = await settledMonthQuery;
      const settledList = settledMonthData || [];
      const totalCollectedMonth = settledList.reduce(
        (sum: number, item: any) => sum + Number(item.amount_minor || 0),
        0
      );

      // 4. Fetch KPI metrics from live views
      if (isMasterView) {
        const { data: masterData } = await supabase
          .from('v_master_dashboard')
          .select('*')
          .single();

        const { data: bizBreakdown } = await supabase
          .from('v_business_dashboard')
          .select('business_id, code, customers_owing_minor');

        const collectedByBizId: Record<string, number> = {};
        for (const row of settledList) {
          if (row.business_id) {
            collectedByBizId[row.business_id] =
              (collectedByBizId[row.business_id] || 0) + Number(row.amount_minor || 0);
          }
        }

        const breakdownMap: Record<string, { debt: number; collected: number }> = {};
        if (bizBreakdown) {
          for (const b of bizBreakdown) {
            breakdownMap[b.code] = {
              debt: Number(b.customers_owing_minor || 0),
              collected: collectedByBizId[b.business_id] || 0,
            };
          }
        }
        setBusinessCardsData(breakdownMap);

        let totalPending = 0;
        for (const p of validPayments) {
          totalPending += Number(p.amount_minor || 0);
        }

        if (masterData) {
          setStats({
            receivablesTotalMinor: Number(masterData.customers_owing_minor || 0),
            payablesTotalMinor: Number(masterData.total_obligations_minor || 0),
            collectedMonthMinor: totalCollectedMonth,
            pendingApprovalMinor: totalPending,
          });
        }
      } else if (activeBusinessId) {
        const { data: singleBizData } = await supabase
          .from('v_business_dashboard')
          .select('*')
          .eq('business_id', activeBusinessId)
          .single();

        let totalPending = 0;
        for (const p of validPayments) {
          totalPending += Number(p.amount_minor || 0);
        }

        if (singleBizData) {
          setStats({
            receivablesTotalMinor: Number(singleBizData.customers_owing_minor || 0),
            payablesTotalMinor: Number(singleBizData.total_obligations_minor || 0),
            collectedMonthMinor: totalCollectedMonth,
            pendingApprovalMinor: totalPending,
          });
        }
      }
    } catch {
      // Keeps zero state cleanly
    }
  }

  useEffect(() => {
    loadDashboard();
    const handleNewSms = () => {
      loadDashboard();
    };
    window.addEventListener('hems:payment-received', handleNewSms);
    return () => window.removeEventListener('hems:payment-received', handleNewSms);
  }, [activeBusinessId, isMasterView]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Clean Single-Row Page Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
          {isMasterView ? 'Overview' : activeBusiness?.name || activeBusinessCode}
        </h1>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex h-9 px-3.5 items-center justify-center rounded-lg bg-[#123520] hover:bg-[#19472B] text-white text-xs font-semibold transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          <span>New Debt or Bill</span>
        </button>
      </div>

      {/* Summary KPI Cards — 1 Hero Forest Card + 3 Uniform Neutral Enterprise Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <MetricCard
          title="Customer Debts"
          minorUnits={stats.receivablesTotalMinor}
          icon={Wallet}
          tone="safaricom"
          subtitle="Total owed to you"
        />
        <MetricCard
          title="Collected (Month)"
          minorUnits={stats.collectedMonthMinor}
          icon={CheckCircle2}
          tone="white"
          subtitle="Approved receipts"
        />
        <MetricCard
          title="Bills to Pay"
          minorUnits={stats.payablesTotalMinor}
          icon={TrendingDown}
          tone="white"
          subtitle="Supplier obligations"
        />
        <MetricCard
          title="Pending Review"
          minorUnits={stats.pendingApprovalMinor}
          icon={Clock}
          tone="white"
          subtitle={
            pendingPayments.length > 0
              ? `${pendingPayments.length} awaiting approval`
              : 'All SMS reconciled'
          }
        />
      </div>

      {/* Business Breakdown in Master View — Clean Matching Enterprise Cards */}
      {isMasterView && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Haron Fashion */}
          <Card className="border border-slate-200/90 bg-white shadow-2xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-[#123520] text-white flex items-center justify-center font-bold text-[11px]">
                  HF
                </div>
                <h4 className="text-sm font-bold text-slate-900">Haron Fashion</h4>
              </div>
              <Badge variant="neutral" size="sm">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Customer Debts
                </span>
                <div className="mt-1">
                  <MoneyDisplay
                    minorUnits={businessCardsData['HARON_FASHION']?.debt || 0}
                    size="md"
                  />
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Collected (Mo)
                </span>
                <div className="mt-1">
                  <MoneyDisplay
                    minorUnits={businessCardsData['HARON_FASHION']?.collected || 0}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Zenith Plast */}
          <Card className="border border-slate-200/90 bg-white shadow-2xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-slate-800 text-white flex items-center justify-center font-bold text-[11px]">
                  ZP
                </div>
                <h4 className="text-sm font-bold text-slate-900">Zenith Plast Distributors Ltd</h4>
              </div>
              <Badge variant="neutral" size="sm">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Customer Debts
                </span>
                <div className="mt-1">
                  <MoneyDisplay
                    minorUnits={businessCardsData['ZENITH_PLAST']?.debt || 0}
                    size="md"
                  />
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Collected (Mo)
                </span>
                <div className="mt-1">
                  <MoneyDisplay
                    minorUnits={businessCardsData['ZENITH_PLAST']?.collected || 0}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PendingApprovalsCard
          payments={pendingPayments}
          onApprove={(p) => setActivePaymentForApproval(p)}
          onReject={(p) => setActivePaymentForRejection(p)}
        />
        <RecentActivityList obligations={recentObligations} />
      </div>

      <CreateObligationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadDashboard}
      />

      <ApprovePaymentModal
        isOpen={Boolean(activePaymentForApproval)}
        payment={activePaymentForApproval}
        onClose={() => setActivePaymentForApproval(null)}
        onSuccess={loadDashboard}
      />

      <RejectPaymentModal
        isOpen={Boolean(activePaymentForRejection)}
        payment={activePaymentForRejection}
        onClose={() => setActivePaymentForRejection(null)}
        onSuccess={loadDashboard}
      />
    </div>
  );
}
