import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { Obligation } from '@/lib/types';
import { fmt_date } from '@/lib/format';
import { ArrowUpRight, ArrowDownLeft, Receipt } from 'lucide-react';
import Link from 'next/link';

interface RecentActivityListProps {
  obligations: Obligation[];
}

export function RecentActivityList({ obligations }: RecentActivityListProps) {
  const getStatusBadge = (status: Obligation['status']) => {
    switch (status) {
      case 'settled':
        return <Badge variant="success" size="sm" dot>Paid</Badge>;
      case 'active':
        return <Badge variant="info" size="sm" dot>Active</Badge>;
      case 'overdue':
        return <Badge variant="danger" size="sm" dot>Overdue</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Debts & Bills</CardTitle>
        <Link
          href="/obligations"
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="space-y-2">
        {obligations.length === 0 ? (
          <div className="text-center py-8 rounded-fintech border border-dashed border-white/10 p-6">
            <Receipt className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-300">
              No debts or bills yet
            </div>
          </div>
        ) : (
          obligations.map((ob) => {
            const isReceivable = ob.direction === 'receivable';

            return (
              <div
                key={ob.id}
                className="flex items-center justify-between p-3 rounded-fintech bg-surface-elevated/40 border border-surface-border/60 hover:bg-surface-elevated transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      isReceivable
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}
                  >
                    {isReceivable ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {ob.party_name}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.2 rounded border border-white/5">
                        {ob.reference_no}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span className="capitalize">{ob.kind.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>Due: {fmt_date(ob.due_date)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <MoneyDisplay
                      minorUnits={ob.balance_minor}
                      size="sm"
                      variant={isReceivable ? 'positive' : 'negative'}
                    />
                    <div className="text-[10px] text-slate-500">
                      Original: <MoneyDisplay minorUnits={ob.principal_minor} size="sm" showCents={false} />
                    </div>
                  </div>

                  <div>{getStatusBadge(ob.status)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
