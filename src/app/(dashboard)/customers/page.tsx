'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { AddCustomerModal } from '@/components/customers/add-customer-modal';

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
  const { activeBusinessId, isMasterView } = useBusiness();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  async function loadCustomers() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // Query v_customer_balances for real-time customer balances
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
        // Fallback directly to customers table if view has no entries
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
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

      <Card>
        {customers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-300">
              No customers added yet
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Account No</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4 text-right">Current Debt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 text-xs">
                {customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                        {cust.customer_no}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      {cust.full_name}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {fmt_phone(cust.phone)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <MoneyDisplay
                        minorUnits={cust.outstanding_minor || 0}
                        size="sm"
                        variant={(cust.outstanding_minor || 0) > 0 ? 'positive' : 'neutral'}
                      />
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
    </div>
  );
}
