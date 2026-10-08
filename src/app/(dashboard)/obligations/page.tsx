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
import { Plus, Receipt, RefreshCw } from 'lucide-react';
import { CreateObligationModal } from '@/components/obligations/create-obligation-modal';

interface ObligationItem {
  id: string;
  business_id: string;
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

  async function loadObligations() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      let query = supabase
        .from('v_obligation_overview')
        .select('id, business_id, kind, direction, reference_no, counterparty_name, original_minor, balance_minor, paid_minor, status, due_date, issue_date, is_overdue')
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
        // Fallback to base table
        let fallback = supabase
          .from('obligations')
          .select('id, business_id, kind, direction, reference_no, payee_name, original_minor, balance_minor, status, due_date, issue_date')
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
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

      <div className="flex items-center gap-2 border-b border-surface-border pb-3">
        {(['all', 'receivable', 'payable'] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => setDirectionFilter(dir)}
            className={`px-3 py-1.5 rounded-fintech text-xs font-medium capitalize transition-colors ${
              directionFilter === dir
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {dir === 'all' ? 'All' : dir === 'receivable' ? 'Owed to You' : 'Bills to Pay'}
          </button>
        ))}
      </div>

      <Card>
        {obligations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Receipt className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300">
              No debts or bills recorded yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice / Ref</th>
                  <th className="py-3 px-4">Person or Company</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Original Amount</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-xs">
                {obligations.map((ob) => {
                  const isReceivable = ob.direction === 'receivable';

                  return (
                    <tr key={ob.id} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-semibold text-slate-100">{ob.reference_no}</div>
                        <div className="text-[11px] text-slate-400 capitalize">
                          {ob.kind.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {ob.counterparty_name}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
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
    </div>
  );
}
