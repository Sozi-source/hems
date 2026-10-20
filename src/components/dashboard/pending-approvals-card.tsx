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
    <Card className="border-slate-200/90 bg-white shadow-2xs">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-slate-900 font-bold">Pending Payments</CardTitle>
          {payments.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {payments.length}
            </span>
          )}
        </div>
        <Link
          href="/payments"
          className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="divide-y divide-slate-100">
        {payments.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6">
            <CheckCircle2 className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
            <div className="text-xs font-medium text-slate-500">
              All incoming SMS payments reconciled
            </div>
          </div>
        ) : (
          payments.slice(0, 5).map((p) => (
            <div
              key={p.id}
              className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                    {p.payer_name || 'Customer'}
                  </span>
                  <span className="font-mono text-[11px] whitespace-nowrap tabular-nums text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                    {p.transaction_ref}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                  <span className="whitespace-nowrap tabular-nums">{fmt_phone(p.payer_msisdn || p.payer_phone)}</span>
                  {(p.account_reference || p.bill_ref_number) && (
                    <>
                      <span>·</span>
                      <span className="text-slate-600 font-mono">{p.account_reference || p.bill_ref_number}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="whitespace-nowrap tabular-nums">{fmt_date(p.occurred_at || p.received_at, true)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 w-full sm:w-auto">
                <MoneyDisplay minorUnits={p.amount_minor} size="sm" variant="neutral" />

                <div className="flex items-center gap-1.5">
                  {onApprove && (
                    <button
                      type="button"
                      className="h-8 px-3 rounded-md bg-[#AEF359] hover:bg-[#9fe648] text-slate-950 font-semibold border border-[#9fe648] text-xs transition-colors shadow-2xs"
                      onClick={() => onApprove(p)}
                    >
                      Approve
                    </button>
                  )}

                  {onReject && (
                    <button
                      type="button"
                      className="h-8 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-700 text-xs font-medium transition-colors"
                      onClick={() => onReject(p)}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
