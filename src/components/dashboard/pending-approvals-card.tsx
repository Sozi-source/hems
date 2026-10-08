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
    <Card className="border-amber-200 bg-amber-50/20 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-amber-950 font-bold">Pending Payments</CardTitle>
          {payments.length > 0 && (
            <Badge variant="warning" size="sm">
              {payments.length}
            </Badge>
          )}
        </div>
        <Link
          href="/payments"
          className="text-xs text-amber-900 hover:text-amber-950 flex items-center gap-1 font-semibold transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="space-y-2.5">
        {payments.length === 0 ? (
          <div className="text-center py-8 rounded-fintech border border-dashed border-slate-200 bg-white/60 p-6">
            <CheckCircle2 className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-500">
              No pending payments
            </div>
          </div>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-fintech bg-white border border-slate-200/90 hover:border-amber-300 shadow-sm transition-all gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {p.payer_name || 'Customer'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {p.transaction_ref}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>{fmt_phone(p.payer_msisdn || p.payer_phone)}</span>
                    {(p.account_reference || p.bill_ref_number) && (
                      <>
                        <span>•</span>
                        <span className="text-slate-700 font-mono font-medium">{p.account_reference || p.bill_ref_number}</span>
                      </>
                    )}
                    {p.match_confidence !== undefined && p.match_confidence > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded border border-emerald-200">
                          {p.match_confidence >= 100 ? '100% Match' : `${Math.round(p.match_confidence)}% Match`}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span>{fmt_date(p.occurred_at || p.received_at, true)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right">
                  <MoneyDisplay minorUnits={p.amount_minor} size="sm" variant="amber" />
                  {p.business_name && (
                    <div className="text-[10px] text-slate-500 font-medium">{p.business_name}</div>
                  )}
                </div>

                {onApprove && (
                  <Button
                    variant="success"
                    size="sm"
                    className="h-7 px-2.5 text-xs font-medium"
                    onClick={() => onApprove(p)}
                  >
                    Approve
                  </Button>
                )}

                {onReject && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-rose-700 hover:bg-rose-50 border-rose-200"
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
