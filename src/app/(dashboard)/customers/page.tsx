'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Plus, Users, RefreshCw, Smartphone } from 'lucide-react';
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
}

export default function CustomersPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [stkTarget, setStkTarget] = useState<CustomerItem | null>(null);

  async function loadCustomers() {
    setIsLoading(true);
    try {
      const supabase = createClient();

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
          data.map((c: any) => ({
            id: c.customer_id,
            business_id: c.business_id,
            customer_no: c.customer_no,
            full_name: c.full_name,
            phone: c.phone,
            outstanding_minor: Number(c.outstanding_minor || 0),
            open_debts: Number(c.open_debts || 0),
          }))
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
        setCustomers((fallbackData as CustomerItem[]) || []);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
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

      <Card className="bg-white border-slate-200/90 shadow-sm p-0 overflow-hidden">
        {customers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600">
              No customers added yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Account No</th>
                  {isMasterView && <th className="py-3 px-4">Business</th>}
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4 text-right">Current Debt</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
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

                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {cust.full_name}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {fmt_phone(cust.phone)}
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
                        <span className="text-[11px] text-slate-400">—</span>
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
