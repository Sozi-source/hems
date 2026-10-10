'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, RefreshCw, Smartphone, MessageSquareOff } from 'lucide-react';
import { AddCustomerModal } from '@/components/customers/add-customer-modal';
import { StkPromptModal } from '@/components/payments/stk-prompt-modal';

interface CustomerItem {
  id: string;
  business_id: string;
  customer_no: string;
  full_name: string;
  phone: string | null;
  outstanding_minor?: number;
  open_debts?: number;
  sms_blocked_at?: string | null;
  sms_block_reason?: string | null;
}

export default function CustomersPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stkTarget, setStkTarget] = useState<CustomerItem | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadCustomers() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // SMS block flags live on the customers table, not in v_customer_balances.
      let blockQuery = supabase
        .from('customers')
        .select('id, sms_blocked_at, sms_block_reason')
        .not('sms_blocked_at', 'is', null);
      if (!isMasterView && activeBusinessId) {
        blockQuery = blockQuery.eq('business_id', activeBusinessId);
      }
      const { data: blockedRows } = await blockQuery;
      const blockedById = new Map<string, { sms_blocked_at: string | null; sms_block_reason: string | null }>(
        (blockedRows || []).map((row: any) => [row.id, row])
      );
      const withBlock = <T extends { id: string }>(items: T[]) =>
        items.map((item) => ({
          ...item,
          sms_blocked_at: blockedById.get(item.id)?.sms_blocked_at ?? null,
          sms_block_reason: blockedById.get(item.id)?.sms_block_reason ?? null,
        }));

      let query = supabase
        .from('v_customer_balances')
        .select('customer_id, business_id, customer_no, full_name, phone, outstanding_minor, open_debts')
        .order('customer_no');

      if (!isMasterView && activeBusinessId) {
        query = query.eq('business_id', activeBusinessId);
      }

      const { data, error } = await query;

      if (!error && data) {
        setCustomers(
          withBlock(
            data.map((c: any) => ({
              id: c.customer_id as string,
              business_id: c.business_id,
              customer_no: c.customer_no,
              full_name: c.full_name,
              phone: c.phone,
              outstanding_minor: Number(c.outstanding_minor || 0),
              open_debts: Number(c.open_debts || 0),
            }))
          )
        );
      } else {
        let fallbackQuery = supabase
          .from('customers')
          .select('id, business_id, customer_no, full_name, phone')
          .order('customer_no');

        if (!isMasterView && activeBusinessId) {
          fallbackQuery = fallbackQuery.eq('business_id', activeBusinessId);
        }

        const { data: fallbackData } = await fallbackQuery;
        setCustomers(withBlock((fallbackData as CustomerItem[]) || []));
      }
    } catch {
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [activeBusinessId, isMasterView]);

  async function clearSmsBlock(cust: CustomerItem) {
    const confirmed = window.confirm(
      `Clear the SMS block for ${cust.full_name}?\n\nSMS to this customer will be attempted again. ` +
        'If the number is still blocked by the provider (for example Safaricom DND), it will be flagged again on the next failed send.'
    );
    if (!confirmed) return;

    setActionError(null);
    setUnblockingId(cust.id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('clear_customer_sms_block', { p_customer_id: cust.id });
      if (error) {
        setActionError(
          error.code === '42501'
            ? 'Only an owner or admin can clear an SMS block.'
            : error.message || 'Could not clear the SMS block.'
        );
        return;
      }
      await loadCustomers();
    } catch {
      setActionError('Could not clear the SMS block. Please try again.');
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#14231A]">
          Customers
        </h1>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadCustomers} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Customer
          </Button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="rounded-md border border-[#F4C5CB] bg-[#FDECEE] px-3 py-2 text-xs text-[#8F1D2A]">
          {actionError}
        </div>
      )}

      <Card className="bg-white border-[#DCE5DF] shadow-sm p-0">
        {customers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              No customers added yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="bg-[#F1F5F2] border-b border-[#DCE5DF] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="sticky left-0 z-10 bg-[#F1F5F2] py-3 px-4">Account No</th>
                  {isMasterView && <th className="py-3 px-4">Business</th>}
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">SMS</th>
                  <th className="py-3 px-4 text-right">Current Debt</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7EDE8] text-[13px]">
                {customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-[#F8FAF8] transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                        {cust.customer_no}
                      </span>
                    </td>

                    {isMasterView && (
                      <td className="py-3.5 px-4 text-slate-600">
                        {businesses.find((business) => business.id === cust.business_id)?.name || '—'}
                      </td>
                    )}

                    <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-normal">
                      {cust.full_name}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {fmt_phone(cust.phone)}
                    </td>

                    <td className="py-3.5 px-4">
                      {cust.sms_blocked_at ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant="danger"
                            size="sm"
                            dot
                            title={cust.sms_block_reason || 'Blocked by SMS provider'}
                          >
                            SMS blocked
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-10 px-2 text-[11px] text-slate-700"
                            isLoading={unblockingId === cust.id}
                            onClick={() => clearSmsBlock(cust)}
                            title="Owner or admin only"
                          >
                            <MessageSquareOff className="w-3 h-3 mr-1" />
                            Clear block
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <MoneyDisplay
                        minorUnits={cust.outstanding_minor || 0}
                        size="sm"
                        variant={(cust.outstanding_minor || 0) > 0 ? 'positive' : 'neutral'}
                      />
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {(cust.outstanding_minor || 0) > 0 ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-800"
                          onClick={() => setStkTarget(cust)}
                          title="Prompt customer via M-Pesa"
                        >
                          <Smartphone className="w-3.5 h-3.5 mr-1 text-emerald-700" />
                          Prompt M-Pesa
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddCustomerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadCustomers}
      />

      {stkTarget && (
        <StkPromptModal
          isOpen={Boolean(stkTarget)}
          onClose={() => setStkTarget(null)}
          businessId={stkTarget.business_id}
          customerId={stkTarget.id}
          customerName={stkTarget.full_name}
          customerPhone={stkTarget.phone || ''}
          amountMinor={stkTarget.outstanding_minor || 0}
          accountReference={stkTarget.customer_no}
          onSuccess={loadCustomers}
        />
      )}
    </div>
  );
}
