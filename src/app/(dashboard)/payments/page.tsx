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
        .select('id,business_id,provider,transaction_ref,amount_minor,occurred_at,payer_msisdn,payer_name,account_reference,status,unallocated_minor,match_confidence,conflict_flags')
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
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
          Payments
        </h1>

        <div className="flex items-center gap-2">
          {process.env.NODE_ENV !== 'production' && (
            <Button variant="secondary" size="sm" onClick={() => setIsSimulateModalOpen(true)}>
              <Play className="w-3.5 h-3.5 mr-1 text-[#1F7A3D]" />
              Simulate Payment
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={loadPayments} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#DCE5DF] pb-3">
        {(['pending', 'approved', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-2.5 rounded-fintech text-xs font-semibold capitalize transition-colors min-h-11 whitespace-nowrap ${
              filterStatus === status
                ? 'bg-[#1F7A3D] text-white shadow-sm'
                : 'text-slate-600 hover:text-[#174E2A] hover:bg-[#F1F5F2]'
            }`}
          >
            {status === 'pending' ? 'Needs Review' : status === 'approved' ? 'Approved' : 'All Payments'}
          </button>
        ))}
      </div>

      {/* Table / Empty State */}
      <Card className="bg-white border-[#DCE5DF] shadow-sm p-0">
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
          <div className="overflow-x-auto rounded-card">
            <table className="w-full min-w-[820px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-3 px-4">Receipt / Ref</th>
                  <th className="py-3 px-4">Payer</th>
                  <th className="py-3 px-4">Account No</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EDE8] text-[13px]">
                {payments.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F8FAF8] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                      {item.transaction_ref}
                      <div className="text-[11px] text-slate-600 font-sans font-normal whitespace-nowrap tabular-nums">
                        {fmt_date(item.occurred_at || item.received_at, true)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 whitespace-normal">
                        {item.payer_name || 'Customer'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {fmt_phone(item.payer_msisdn || item.payer_phone)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono tabular-nums whitespace-nowrap px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-semibold">
                          {item.account_reference || item.bill_ref_number || 'None'}
                        </span>
                        {item.match_confidence !== undefined && item.match_confidence > 0 && (
                          item.match_confidence >= 100 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#1F7A3D] border border-emerald-200">
                              Exact reference suggestion
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#EDF3F7] text-[#29465A] border border-[#D1DFE8]">
                              Phone match suggestion
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <MoneyDisplay minorUnits={item.amount_minor} size="sm" variant="amber" />
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {item.status === 'pending' && (item.conflict_flags?.length || 0) > 0 ? (
                        <Badge variant="danger" size="sm" dot>
                          Reconcile first
                        </Badge>
                      ) : item.status === 'pending' ? (
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
                            className="min-h-10 px-3 text-xs font-semibold"
                            onClick={() => setActivePaymentForApproval(item)}
                          >
                            {(item.conflict_flags?.length || 0) > 0 ? 'Reconcile' : 'Review'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10 px-3 text-xs text-[#A21D2B] hover:bg-[#FDECEE] border-[#F4C5CB] font-semibold"
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
