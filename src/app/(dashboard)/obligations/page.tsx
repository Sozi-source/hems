'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_date } from '@/lib/format';
import { ObligationDirection } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { Plus, Receipt, RefreshCw, Smartphone } from 'lucide-react';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';
import { StkPromptModal } from '@/components/payments/stk-prompt-modal';

interface ObligationItem {
  id: string;
  business_id: string;
  customer_id?: string;
  kind: string;
  direction: ObligationDirection;
  reference_no: string;
  counterparty_name: string;
  original_minor: number;
  balance_minor: number;
  paid_minor: number;
  status: string;
  due_date: string | null;
  issue_date: string | null;
  is_overdue?: boolean;
}

export default function ObligationsPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [directionFilter, setDirectionFilter] = useState<ObligationDirection | 'all'>('all');
  const [obligations, setObligations] = useState<ObligationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [stkTarget, setStkTarget] = useState<ObligationItem | null>(null);

  async function loadObligations() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      let query = supabase
        .from('v_obligation_overview')
        .select('id, business_id, customer_id, kind, direction, reference_no, counterparty_name, original_minor, balance_minor, paid_minor, status, due_date, issue_date, is_overdue')
        .order('issue_date', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      if (directionFilter !== 'all') {
        query = query.eq('direction', directionFilter);
      }

      const { data, error } = await query;

      if (!error && data) {
        setObligations(
          data.map((o: any) => ({
            id: o.id,
            business_id: o.business_id,
            customer_id: o.customer_id,
            kind: o.kind,
            direction: o.direction as ObligationDirection,
            reference_no: o.reference_no,
            counterparty_name: o.counterparty_name || 'Counterparty',
            original_minor: Number(o.original_minor || 0),
            balance_minor: Number(o.balance_minor || 0),
            paid_minor: Number(o.paid_minor || 0),
            status: o.status,
            due_date: o.due_date,
            issue_date: o.issue_date,
            is_overdue: Boolean(o.is_overdue),
          }))
        );
      } else {
        let fallback = supabase
          .from('obligations')
          .select('id, business_id, customer_id, kind, direction, reference_no, payee_name, original_minor, balance_minor, status, due_date, issue_date')
          .order('created_at', { ascending: false });

        if (!isMasterView && activeBusinessId) {
          fallback = fallback.eq('business_id', activeBusinessId);
        }

        if (directionFilter !== 'all') {
          fallback = fallback.eq('direction', directionFilter);
        }

        const { data: fallbackData } = await fallback;
        setObligations(
          (fallbackData || []).map((o: any) => ({
            id: o.id,
            business_id: o.business_id,
            customer_id: o.customer_id,
            kind: o.kind,
            direction: o.direction as ObligationDirection,
            reference_no: o.reference_no,
            counterparty_name: o.payee_name || 'Counterparty',
            original_minor: Number(o.original_minor || 0),
            balance_minor: Number(o.balance_minor || 0),
            paid_minor: 0,
            status: o.status,
            due_date: o.due_date,
            issue_date: o.issue_date,
            is_overdue: false,
          }))
        );
      }
    } catch {
      setObligations([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadObligations();
  }, [activeBusinessId, isMasterView, directionFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Debts & Invoices
        </h1>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadObligations} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Debt or Bill
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {(['all', 'receivable', 'payable'] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => setDirectionFilter(dir)}
            className={`px-3 py-1.5 rounded-fintech text-xs font-semibold capitalize transition-colors ${
              directionFilter === dir
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {dir === 'all' ? 'All' : dir === 'receivable' ? 'Owed to You' : 'Bills to Pay'}
          </button>
        ))}
      </div>

      <Card className="bg-white border-slate-200/90 shadow-sm p-0 overflow-hidden">
        {obligations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              No debts or bills recorded yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice / Ref</th>
                  <th className="py-3 px-4">Person or Company</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Original Amount</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {obligations.map((ob) => {
                  const isReceivable = ob.direction === 'receivable';

                  return (
                    <tr key={ob.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{ob.reference_no}</div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {ob.kind.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {ob.counterparty_name}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {fmt_date(ob.due_date)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <MoneyDisplay minorUnits={ob.original_minor} size="sm" />
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <MoneyDisplay
                          minorUnits={ob.balance_minor}
                          size="sm"
                          variant={ob.balance_minor === 0 ? 'neutral' : isReceivable ? 'positive' : 'negative'}
                        />
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {ob.balance_minor === 0 || ob.status === 'settled' ? (
                          <Badge variant="success" size="sm" dot>
                            Settled
                          </Badge>
                        ) : ob.is_overdue ? (
                          <Badge variant="danger" size="sm" dot>
                            Overdue
                          </Badge>
                        ) : (
                          <Badge variant="info" size="sm" dot>
                            Active
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isReceivable && ob.balance_minor > 0 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-slate-800"
                            onClick={() => setStkTarget(ob)}
                            title="Prompt customer via M-Pesa"
                          >
                            <Smartphone className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                            Prompt M-Pesa
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateObligationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadObligations}
      />

      {stkTarget && (
        <StkPromptModal
          isOpen={Boolean(stkTarget)}
          onClose={() => setStkTarget(null)}
          businessId={stkTarget.business_id}
          customerId={stkTarget.customer_id || ''}
          customerName={stkTarget.counterparty_name}
          customerPhone=""
          amountMinor={stkTarget.balance_minor}
          accountReference={stkTarget.reference_no}
          onSuccess={loadObligations}
        />
      )}
    </div>
  );
}
