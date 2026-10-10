import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoneyDisplay } from '@/components/ui/money-display';
import { Obligation } from '@/lib/types';
import { fmt_date } from '@/lib/format';
import { ArrowUpRight, ExternalLink, Receipt } from 'lucide-react';
import Link from 'next/link';

interface RecentActivityListProps {
  obligations: Obligation[];
}

export function RecentActivityList({ obligations }: RecentActivityListProps) {
  const getStatusBadge = (status: Obligation['status']) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success" size="sm" dot>Paid</Badge>;
      case 'open':
        return <Badge variant="info" size="sm" dot>Open</Badge>;
      case 'partially_paid':
        return <Badge variant="warning" size="sm" dot>Partially paid</Badge>;
      case 'written_off':
        return <Badge variant="neutral" size="sm">Written off</Badge>;
      case 'cancelled':
        return <Badge variant="neutral" size="sm">Cancelled</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="bg-white border-[#DCE5DF] shadow-sm">
      <CardHeader>
        <CardTitle className="text-slate-800 font-bold">Recent Debts & Bills</CardTitle>
        <Link
          href="/obligations"
          className="text-xs text-slate-700 hover:text-slate-900 flex items-center gap-1 font-semibold transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="space-y-2">
        {obligations.length === 0 ? (
          <div className="text-center py-8 rounded-fintech border border-dashed border-slate-200 bg-slate-50/50 p-6">
            <Receipt className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-500">No debts or bills yet</div>
          </div>
        ) : (
          obligations.map((ob) => {
            const isReceivable = ob.direction === 'receivable';

            return (
              <div
                key={ob.id}
                className="flex items-start sm:items-center justify-between gap-3 p-3 rounded-fintech bg-[#F8FAF8] border border-[#DCE5DF] hover:bg-[#F1F5F2] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 [overflow-wrap:anywhere]">{ob.party_name}</div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    <span className="capitalize">{ob.kind.replace('_', ' ')}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span>Due {fmt_date(ob.due_date)}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                    {isReceivable ? 'To collect' : 'To pay'}
                  </div>
                  <MoneyDisplay
                    minorUnits={ob.balance_minor}
                    size="sm"
                    variant={isReceivable ? 'positive' : 'negative'}
                  />
                  <div className="flex items-center justify-end gap-2">
                    {getStatusBadge(ob.status)}
                    <Link
                      href={`/obligations#${ob.id}`}
                      className="inline-flex min-h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F7A3D]/30"
                      aria-label={`Open ${ob.party_name} obligation`}
                    >
                      Open
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
