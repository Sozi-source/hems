'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { fmt_phone, parse_kes } from '@/lib/format';
import { useBusiness } from '@/context/business-context';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
} from 'lucide-react';

export interface CustomerOption {
  id: string;
  business_id: string;
  customer_no: string;
  full_name: string;
  nickname?: string | null;
  phone: string | null;
  outstanding_minor?: number;
}

export interface OpenDebtOption {
  id: string;
  reference_no: string;
  balance_minor: number;
  original_minor: number;
  issue_date?: string | null;
  description?: string | null;
}

interface PayDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedCustomer?: CustomerOption | any | null;
  preselectedObligation?: {
    id: string;
    business_id: string;
    customer_id?: string;
    reference_no: string;
    balance_minor: number;
    original_minor: number;
    counterparty_name?: string;
  } | null;
  businessId?: string;
}

export function PayDebtModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedCustomer,
  preselectedObligation,
  businessId,
}: PayDebtModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();

  // Form state
  const [selectedBizId, setSelectedBizId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedObligationId, setSelectedObligationId] = useState<string>('all');
  const [amount, setAmount] = useState<string>('');

  // Data state
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [openDebts, setOpenDebts] = useState<OpenDebtOption[]>([]);
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<CustomerOption | null>(null);

  // Status state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize modal state on open
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setError(null);
      setSuccessMsg(null);
      setCustomerSearch('');
      setSelectedObligationId('all');
      return;
    }

    const targetBiz =
      businessId ||
      preselectedCustomer?.business_id ||
      preselectedObligation?.business_id ||
      activeBusinessId ||
      (businesses.length > 0 ? businesses[0].id : '');

    setSelectedBizId(targetBiz);

    if (preselectedCustomer) {
      setSelectedCustomerId(preselectedCustomer.id);
      setSelectedCustomerObj({
        id: preselectedCustomer.id,
        business_id: preselectedCustomer.business_id || targetBiz,
        customer_no: preselectedCustomer.customer_no,
        full_name: preselectedCustomer.full_name,
        nickname: preselectedCustomer.nickname,
        phone: preselectedCustomer.phone,
        outstanding_minor: preselectedCustomer.outstanding_minor,
      });

      if (preselectedCustomer.outstanding_minor && preselectedCustomer.outstanding_minor > 0) {
        setAmount((preselectedCustomer.outstanding_minor / 100).toFixed(2));
      }
    } else if (preselectedObligation?.customer_id) {
      setSelectedCustomerId(preselectedObligation.customer_id);
      setSelectedObligationId(preselectedObligation.id);
      if (preselectedObligation.balance_minor > 0) {
        setAmount((preselectedObligation.balance_minor / 100).toFixed(2));
      }
    } else {
      setSelectedCustomerId('');
      setSelectedCustomerObj(null);
    }
  }, [isOpen, preselectedCustomer, preselectedObligation, businessId, activeBusinessId, businesses]);

  // Load customers for the active business if not preselected
  useEffect(() => {
    async function loadCustomers() {
      if (!isOpen || !selectedBizId || preselectedCustomer) return;

      try {
        const supabase = createClient();
        const { data: rawCusts } = await supabase
          .from('customers')
          .select('id, business_id, customer_no, full_name, nickname, phone')
          .eq('business_id', selectedBizId)
          .eq('is_active', true)
          .order('full_name');

        // Fetch balances
        const { data: balances } = await supabase
          .from('v_obligation_overview')
          .select('customer_id, balance_minor')
          .eq('business_id', selectedBizId)
          .eq('kind', 'customer_debt')
          .in('status', ['open', 'partially_paid']);

        const balMap = new Map<string, number>();
        for (const b of balances || []) {
          if (b.customer_id) {
            balMap.set(b.customer_id, (balMap.get(b.customer_id) || 0) + Number(b.balance_minor || 0));
          }
        }

        const custList: CustomerOption[] = (rawCusts || []).map((c: any) => ({
          id: c.id,
          business_id: c.business_id,
          customer_no: c.customer_no,
          full_name: c.full_name,
          nickname: c.nickname,
          phone: c.phone,
          outstanding_minor: balMap.get(c.id) || 0,
        }));

        setCustomers(custList);

        // If preselected obligation has customer, find match
        if (preselectedObligation?.customer_id) {
          const match = custList.find((c) => c.id === preselectedObligation.customer_id);
          if (match) setSelectedCustomerObj(match);
        }
      } catch {
        setCustomers([]);
      }
    }

    loadCustomers();
  }, [isOpen, selectedBizId, preselectedCustomer, preselectedObligation]);

  // Load open debts for the selected customer
  useEffect(() => {
    async function fetchCustomerDebts() {
      if (!isOpen || !selectedBizId || !selectedCustomerId) {
        setOpenDebts([]);
        return;
      }

      setIsDataLoading(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('v_obligation_overview')
          .select('id, reference_no, balance_minor, original_minor, issue_date, description')
          .eq('business_id', selectedBizId)
          .eq('customer_id', selectedCustomerId)
          .eq('kind', 'customer_debt')
          .in('status', ['open', 'partially_paid'])
          .gt('balance_minor', 0)
          .order('issue_date', { ascending: true });

        const debts: OpenDebtOption[] = (data || []).map((d: any) => ({
          id: d.id,
          reference_no: d.reference_no,
          balance_minor: Number(d.balance_minor || 0),
          original_minor: Number(d.original_minor || 0),
          issue_date: d.issue_date,
          description: d.description,
        }));

        setOpenDebts(debts);

        // Update customer total balance if not already present
        const totalBal = debts.reduce((sum, d) => sum + d.balance_minor, 0);
        setSelectedCustomerObj((prev) =>
          prev ? { ...prev, outstanding_minor: totalBal } : prev
        );

        // Auto-fill amount if not filled yet
        if (!amount && totalBal > 0) {
          setAmount((totalBal / 100).toFixed(2));
        }
      } catch {
        setOpenDebts([]);
      } finally {
        setIsDataLoading(false);
      }
    }

    fetchCustomerDebts();
  }, [isOpen, selectedBizId, selectedCustomerId]);

  // Filtered customer list for search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.customer_no?.toLowerCase().includes(q) ||
        c.nickname?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [customers, customerSearch]);

  const currentOutstandingMinor = selectedCustomerObj?.outstanding_minor || 0;
  const parsedInputMinor = useMemo(() => {
    try {
      return parse_kes(amount || '0');
    } catch {
      return 0n;
    }
  }, [amount]);

  const remainingBalanceMinor = useMemo(() => {
    const currentBig = BigInt(currentOutstandingMinor);
    const rem = currentBig - parsedInputMinor;
    return rem > 0n ? Number(rem) : 0;
  }, [currentOutstandingMinor, parsedInputMinor]);

  const isFullSettlement =
    parsedInputMinor > 0n &&
    currentOutstandingMinor > 0 &&
    parsedInputMinor >= BigInt(currentOutstandingMinor);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedBizId) {
      setError('Please select a business');
      return;
    }

    if (!selectedCustomerId) {
      setError('Please select the customer paying the debt');
      return;
    }

    if (parsedInputMinor <= 0n) {
      setError('Please enter a valid cash payment amount greater than zero');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        businessId: selectedBizId,
        customerId: selectedCustomerId,
        amountMinor: Number(parsedInputMinor),
        obligationId: selectedObligationId !== 'all' ? selectedObligationId : null,
      };

      const res = await fetch('/api/payments/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record cash payment');
      }

      setSuccessMsg(data.message || 'Payment recorded successfully!');

      // Notify other views
      window.dispatchEvent(new CustomEvent('hems:payment-received'));

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Error processing cash payment');
    } finally {
      setIsLoading(false);
    }
  };

  const businessName = businesses.find((b) => b.id === selectedBizId)?.name || 'Haron Enterprise';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Cash Payment"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>{successMsg}</div>
          </div>
        )}

        {/* Business Selector (if in Master View) */}
        {isMasterView && !preselectedCustomer && !preselectedObligation && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Target Business</span>
            </label>
            <select
              value={selectedBizId}
              onChange={(e) => {
                setSelectedBizId(e.target.value);
                setSelectedCustomerId('');
                setSelectedCustomerObj(null);
                setOpenDebts([]);
              }}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Customer & Debt Overview */}
        {selectedCustomerObj ? (
          <div className="p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-semibold text-slate-900 text-sm truncate">
                  {selectedCustomerObj.full_name}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  ({selectedCustomerObj.customer_no})
                </span>
                {selectedCustomerObj.nickname && (
                  <span className="text-xs text-slate-400">
                    · {selectedCustomerObj.nickname}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {selectedCustomerObj.phone ? fmt_phone(selectedCustomerObj.phone) : 'No phone recorded'}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                Current Debt
              </span>
              <span className="text-sm font-bold font-mono text-slate-900">
                KES {(currentOutstandingMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              Customer Paying Debt
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, phone, or account #..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {customers.length > 0 && customerSearch.trim() && (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white mt-1">
                {filteredCustomers.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setSelectedCustomerObj(c);
                      setCustomerSearch('');
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{c.full_name}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                        ({c.customer_no})
                      </span>
                    </div>
                    <div className="font-mono text-right font-medium">
                      {c.outstanding_minor && c.outstanding_minor > 0 ? (
                        <span className="text-slate-800">
                          KES {(c.outstanding_minor / 100).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-400">Settled</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Debt Target Selection (if multiple invoices) */}
        {openDebts.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              Apply Payment Towards
            </label>
            <select
              value={selectedObligationId}
              onChange={(e) => {
                setSelectedObligationId(e.target.value);
                if (e.target.value !== 'all') {
                  const target = openDebts.find((d) => d.id === e.target.value);
                  if (target) setAmount((target.balance_minor / 100).toFixed(2));
                } else if (currentOutstandingMinor > 0) {
                  setAmount((currentOutstandingMinor / 100).toFixed(2));
                }
              }}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">
                Auto-apply across all debts (Oldest debt first)
              </option>
              {openDebts.map((d) => (
                <option key={d.id} value={d.id}>
                  Invoice {d.reference_no} — KES {(d.balance_minor / 100).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Cash Amount Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-medium text-slate-700">Amount Received</label>
            {currentOutstandingMinor > 0 && (
              <button
                type="button"
                onClick={() => setAmount((currentOutstandingMinor / 100).toFixed(2))}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Pay full balance (KES {(currentOutstandingMinor / 100).toLocaleString()})
              </button>
            )}
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold text-slate-400">
              KES
            </span>
            <input
              type="number"
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 pl-12 pr-3 font-mono text-base font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 transition-colors"
              required
            />
          </div>

          {parsedInputMinor > 0n && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>Balance after payment:</span>
              <span className="font-mono font-semibold text-slate-800">
                {isFullSettlement ? (
                  <span className="text-emerald-700 font-medium">Fully Settled (KES 0.00)</span>
                ) : (
                  `KES ${(remainingBalanceMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                )}
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={isLoading || parsedInputMinor <= 0n || (!selectedCustomerObj && !selectedCustomerId)}
            className="bg-[#0F172A] hover:bg-slate-800 text-white font-medium px-4"
          >
            {isLoading ? 'Processing...' : 'Record Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
