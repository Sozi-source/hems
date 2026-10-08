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
import { RefreshCw, CreditCard, Play } from 'lucide-react';
import { ApprovePaymentModal } from '@/components/payments/approve-payment-modal';
import { RejectPaymentModal } from '@/components/payments/reject-payment-modal';
import { SimulatePaymentModal } from '@/components/payments/simulate-payment-modal';

export default function PaymentsPage() {
  const { activeBusinessId, isMasterView } = useBusiness();
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('pending');
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [activePaymentForApproval, setActivePaymentForApproval] = useState<PaymentTransaction | null>(null);
  const [activePaymentForRejection, setActivePaymentForRejection] = useState<PaymentTransaction | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);

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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Payments
        </h1>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIsSimulateModalOpen(true)}>
            <Play className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            Simulate Payment
          </Button>

          <Button variant="outline" size="sm" onClick={loadPayments} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {(['pending', 'approved', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-fintech text-xs font-semibold capitalize transition-colors ${
              filterStatus === status
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {status === 'pending' ? 'Needs Review' : status === 'approved' ? 'Approved' : 'All Payments'}
          </button>
        ))}
      </div>

      {/* Table / Empty State */}
      <Card className="bg-white border-slate-200/90 shadow-sm p-0 overflow-hidden">
        {payments.length === 0 ? (
          <div className="text-center py-12 px-4">
            <CreditCard className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              {filterStatus === 'pending'
                ? 'No payments waiting for review'
                : 'No payments found'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Receipt / Ref</th>
                  <th className="py-3 px-4">Payer</th>
                  <th className="py-3 px-4">Account No</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {payments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {item.transaction_ref}
                      <div className="text-[11px] text-slate-500 font-sans font-normal">
                        {fmt_date(item.occurred_at || item.received_at, true)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">
                        {item.payer_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {fmt_phone(item.payer_msisdn || item.payer_phone)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                          {item.account_reference || item.bill_ref_number || 'None'}
                        </span>
                        {item.match_confidence !== undefined && item.match_confidence > 0 && (
                          item.match_confidence >= 100 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              100% Exact Match
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                              {Math.round(item.match_confidence)}% Phone Match
                            </span>
                          )
                        )}
                      </div>
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
                            className="h-7 px-2.5 text-xs font-medium"
                            onClick={() => setActivePaymentForApproval(item)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-rose-700 hover:bg-rose-50 border-rose-200 font-medium"
                            onClick={() => setActivePaymentForRejection(item)}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium capitalize">{item.status}</span>
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

      <SimulatePaymentModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSuccess={loadPayments}
      />
    </div>
  );
}
