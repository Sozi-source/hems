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
    <Card className="border-[#DFD2B6] bg-[#F7F3E8] shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-[#3D2E14] font-bold">Pending Payments</CardTitle>
          {payments.length > 0 && (
            <Badge variant="warning" size="sm">
              {payments.length}
            </Badge>
          )}
        </div>
        <Link
          href="/payments"
          className="text-xs text-[#5E4518] hover:text-[#3D2E14] flex items-center gap-1 font-semibold transition-colors"
        >
          View all
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <div className="space-y-2.5">
        {payments.length === 0 ? (
          <div className="text-center py-8 rounded-fintech border border-dashed border-[#D6C8A9] bg-white/70 p-6">
            <CheckCircle2 className="w-6 h-6 text-[#1F7A3D] mx-auto mb-1.5" />
            <div className="text-xs font-semibold text-[#3D2E14]">
              All incoming SMS payments reconciled
            </div>
          </div>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 rounded-fintech bg-white border border-[#E2D6BC] hover:border-[#CBB992] shadow-sm transition-all gap-3"
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#144827] text-[#8DDBA0] flex items-center justify-center shrink-0 shadow-sm">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 [overflow-wrap:anywhere]">
                      {p.payer_name || 'Customer'}
                    </span>
                    <span className="font-mono text-[10px] sm:text-[11px] whitespace-nowrap tabular-nums text-[#144827] bg-[#E8F5EB] px-1.5 py-0.5 rounded border border-[#BBDCC4] font-semibold">
                      {p.transaction_ref}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                    <span className="whitespace-nowrap tabular-nums font-medium">{fmt_phone(p.payer_msisdn || p.payer_phone)}</span>
                    {(p.account_reference || p.bill_ref_number) && (
                      <>
                        <span>•</span>
                        <span className="text-slate-700 font-mono font-semibold">{p.account_reference || p.bill_ref_number}</span>
                      </>
                    )}
                    {p.match_confidence !== undefined && p.match_confidence > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-[#144827] font-bold bg-[#E8F5EB] px-1.5 py-0.2 rounded border border-[#BBDCC4]">
                          {p.match_confidence >= 100 ? '100% Match' : `${Math.round(p.match_confidence)}% Match`}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span className="whitespace-nowrap tabular-nums text-slate-500">{fmt_date(p.occurred_at || p.received_at, true)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0 w-full sm:w-auto">
                <div className="text-left sm:text-right">
                  <MoneyDisplay minorUnits={p.amount_minor} size="md" variant="positive" />
                  {p.business_name && (
                    <div className="text-[11px] text-slate-600 font-medium whitespace-nowrap">{p.business_name}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {onApprove && (
                    <Button
                      variant="success"
                      size="sm"
                      className="min-h-9 px-3 text-xs font-semibold"
                      onClick={() => onApprove(p)}
                    >
                      Approve
                    </Button>
                  )}

                  {onReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9 px-2.5 text-xs text-rose-700 hover:bg-rose-50 border-rose-200"
                      onClick={() => onReject(p)}
                    >
                      Reject
                    </Button>
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
