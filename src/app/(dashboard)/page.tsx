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

      // 1. Fetch pending payments
      let paymentsQuery = supabase
        .from('payment_transactions')
        .select('*')
        .eq('status', 'pending')
        .order('occurred_at', { ascending: false })
        .limit(5);

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

      // 3. Fetch KPI metrics from live views
      if (isMasterView) {
        const { data: masterData } = await supabase
          .from('v_master_dashboard')
          .select('*')
          .single();

        const { data: bizBreakdown } = await supabase
          .from('v_business_dashboard')
          .select('business_id, code, customers_owing_minor');

        const breakdownMap: Record<string, { debt: number; collected: number }> = {};
        if (bizBreakdown) {
          for (const b of bizBreakdown) {
            breakdownMap[b.code] = {
              debt: Number(b.customers_owing_minor || 0),
              collected: 0,
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
            collectedMonthMinor: 0,
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
            collectedMonthMinor: 0,
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
  }, [activeBusinessId, isMasterView]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {isMasterView ? 'All Businesses' : activeBusiness?.name || activeBusinessCode}
        </h1>

        <div className="flex items-center gap-2">
          <Link href="/payments">
            <Button variant="secondary" size="sm">
              <CreditCard className="w-3.5 h-3.5 mr-1" />
              Payments
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Debt or Bill
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Customer Debts"
          minorUnits={stats.receivablesTotalMinor}
          icon={Wallet}
          variant="positive"
        />
        <MetricCard
          title="Bills to Pay"
          minorUnits={stats.payablesTotalMinor}
          icon={TrendingDown}
          variant="negative"
        />
        <MetricCard
          title="Collected This Month"
          minorUnits={stats.collectedMonthMinor}
          icon={CheckCircle2}
          variant="positive"
        />
        <MetricCard
          title="Pending Payments"
          minorUnits={stats.pendingApprovalMinor}
          icon={Clock}
          variant={pendingPayments.length > 0 ? 'amber' : 'neutral'}
        />
      </div>

      {/* Business Breakdown in Master View */}
      {isMasterView && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-surface">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-rose-500/20 border border-rose-500/30 flex items-center justify-center font-bold text-xs text-rose-400">
                  HF
                </div>
                <h4 className="text-sm font-semibold text-white">Haron Fashion</h4>
              </div>
              <Badge variant="danger" size="sm">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div>
                <span className="text-[11px] text-slate-400">Customer Debts</span>
                <div className="text-base font-bold text-white">
                  <MoneyDisplay
                    minorUnits={businessCardsData['HARON_FASHION']?.debt || 0}
                    size="md"
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Collected</span>
                <div className="text-base font-bold text-emerald-400">
                  <MoneyDisplay
                    minorUnits={businessCardsData['HARON_FASHION']?.collected || 0}
                    size="md"
                    variant="positive"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-surface">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-sky-500/20 border border-sky-500/30 flex items-center justify-center font-bold text-xs text-sky-400">
                  ZP
                </div>
                <h4 className="text-sm font-semibold text-white">Zenith Plast Distributors Ltd</h4>
              </div>
              <Badge variant="info" size="sm">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div>
                <span className="text-[11px] text-slate-400">Customer Debts</span>
                <div className="text-base font-bold text-white">
                  <MoneyDisplay
                    minorUnits={businessCardsData['ZENITH_PLAST']?.debt || 0}
                    size="md"
                  />
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Collected</span>
                <div className="text-base font-bold text-emerald-400">
                  <MoneyDisplay
                    minorUnits={businessCardsData['ZENITH_PLAST']?.collected || 0}
                    size="md"
                    variant="positive"
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
