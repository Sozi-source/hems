import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone, fmt_date } from '@/lib/format';
import { PaymentTransaction } from '@/lib/types';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface PendingApprovalsCardProps {
  payments: PaymentTransaction[];
  onApprove?: (payment: PaymentTransaction) => void;
  onReject?: (payment: PaymentTransaction) => void;
}

export function PendingApprovalsCard({
  payments,
  onApprove,
  onReject,
}: PendingApprovalsCardProps) {
  return (
    <Card className="border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-surface">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-amber-300">Pending Payments</CardTitle>
          {payments.length > 0 && (
            <Badge variant="warning" size="sm">
              {payments.length}
            </Badge>
          )}
        </div>
        <Link
          href="/payments"
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="space-y-2.5">
        {payments.length === 0 ? (
          <div className="text-center py-8 rounded-fintech border border-dashed border-white/10 p-6">
            <CheckCircle2 className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-300">
              No pending payments
            </div>
          </div>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-fintech bg-surface-elevated/70 border border-surface-border hover:border-amber-500/30 transition-all gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {p.payer_name || 'Customer'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.2 rounded border border-white/5">
                      {p.transaction_ref}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>{fmt_phone(p.payer_phone)}</span>
                    {p.bill_ref_number && (
                      <>
                        <span>•</span>
                        <span className="text-indigo-300">{p.bill_ref_number}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{fmt_date(p.received_at, true)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <MoneyDisplay minorUnits={p.amount_minor} size="sm" variant="amber" />
                  {p.business_name && (
                    <div className="text-[10px] text-slate-500">{p.business_name}</div>
                  )}
                </div>

                {onApprove && (
                  <Button
                    variant="success"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => onApprove(p)}
                  >
                    Approve
                  </Button>
                )}

                {onReject && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300"
                    onClick={() => onReject(p)}
                  >
                    Reject
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
