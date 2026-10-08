'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone, fmt_date } from '@/lib/format';
import { PaymentTransaction, PaymentStatus } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { RefreshCw, CreditCard } from 'lucide-react';
import { ApprovePaymentModal } from '@/components/payments/approve-payment-modal';
import { RejectPaymentModal } from '@/components/payments/reject-payment-modal';

export default function PaymentsPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('pending');
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [activePaymentForApproval, setActivePaymentForApproval] = useState<PaymentTransaction | null>(null);
  const [activePaymentForRejection, setActivePaymentForRejection] = useState<PaymentTransaction | null>(null);

  async function loadPayments() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from('payment_transactions')
        .select('*')
        .order('occurred_at', { ascending: false });

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data } = await query;
      setPayments((data as PaymentTransaction[]) || []);
    } catch {
      setPayments([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, [activeBusinessId, isMasterView, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Payments
        </h1>

        <Button variant="outline" size="sm" onClick={loadPayments} isLoading={isLoading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-border pb-3">
        {(['pending', 'approved', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-fintech text-xs font-medium capitalize transition-colors ${
              filterStatus === status
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {status === 'pending' ? 'Needs Review' : status === 'approved' ? 'Approved' : 'All Payments'}
          </button>
        ))}
      </div>

      {/* Table / Empty State */}
      <Card>
        {payments.length === 0 ? (
          <div className="text-center py-12 px-4">
            <CreditCard className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300">
              {filterStatus === 'pending'
                ? 'No payments waiting for review'
                : 'No payments found'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Receipt / Ref</th>
                  <th className="py-3 px-4">Payer</th>
                  <th className="py-3 px-4">Account No</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-xs">
                {payments.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-100">
                      {item.transaction_ref}
                      <div className="text-[11px] text-slate-400 font-sans font-normal">
                        {fmt_date(item.received_at, true)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">
                        {item.payer_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {fmt_phone(item.payer_phone)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {item.bill_ref_number || 'None'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <MoneyDisplay minorUnits={item.amount_minor} size="sm" variant="amber" />
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {item.status === 'pending' ? (
                        <Badge variant="warning" size="sm" dot>
                          Pending
                        </Badge>
                      ) : item.status === 'approved' ? (
                        <Badge variant="success" size="sm" dot>
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="danger" size="sm" dot>
                          {item.status}
                        </Badge>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {item.status === 'pending' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => setActivePaymentForApproval(item)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:border-rose-500/40"
                            onClick={() => setActivePaymentForRejection(item)}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 capitalize">{item.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ApprovePaymentModal
        isOpen={Boolean(activePaymentForApproval)}
        payment={activePaymentForApproval}
        onClose={() => setActivePaymentForApproval(null)}
        onSuccess={loadPayments}
      />

      <RejectPaymentModal
        isOpen={Boolean(activePaymentForRejection)}
        payment={activePaymentForRejection}
        onClose={() => setActivePaymentForRejection(null)}
        onSuccess={loadPayments}
      />
    </div>
  );
}
