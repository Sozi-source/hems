'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoneyDisplay } from '@/components/ui/money-display';
import { fmt_phone } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Truck,
  Phone,
  Mail,
  Search,
  MessageCircle,
  Building2,
  Calendar,
  Wallet,
  CheckCircle2,
} from 'lucide-react';
import { AddSupplierModal } from '@/components/suppliers/add-supplier-modal';

export interface SupplierItem {
  id: string;
  business_id: string;
  supplier_no: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  payment_terms_note: string | null;
  notes: string | null;
  is_active: boolean;
  total_payable_minor?: number;
  open_debts_count?: number;
}

export default function SuppliersPage() {
  const { activeBusinessId, isMasterView, businesses } = useBusiness();
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadSuppliers() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      let supQuery = supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('supplier_no');

      if (!isMasterView && activeBusinessId) {
        supQuery = supQuery.eq('business_id', activeBusinessId);
      }

      const { data: rawSuppliers, error } = await supQuery;
      if (error) throw error;

      // Also query obligations of kind 'supplier_debt' to calculate outstanding amounts
      let obQuery = supabase
        .from('v_obligation_overview')
        .select('supplier_id, balance_minor, status')
        .eq('kind', 'supplier_debt')
        .in('status', ['open', 'partially_paid']);

      if (!isMasterView && activeBusinessId) {
        obQuery = obQuery.eq('business_id', activeBusinessId);
      }

      const { data: openObs } = await obQuery;

      const debtBySupplier = new Map<string, number>();
      const countBySupplier = new Map<string, number>();

      for (const ob of openObs || []) {
        if (!ob.supplier_id) continue;
        debtBySupplier.set(
          ob.supplier_id,
          (debtBySupplier.get(ob.supplier_id) || 0) + Number(ob.balance_minor || 0)
        );
        countBySupplier.set(
          ob.supplier_id,
          (countBySupplier.get(ob.supplier_id) || 0) + 1
        );
      }

      const mapped: SupplierItem[] = (rawSuppliers || []).map((s: any) => ({
        id: s.id,
        business_id: s.business_id,
        supplier_no: s.supplier_no,
        name: s.name,
        phone: s.phone || null,
        email: s.email || null,
        payment_terms_days: s.payment_terms_days || 0,
        payment_terms_note: s.payment_terms_note || null,
        notes: s.notes || null,
        is_active: s.is_active,
        total_payable_minor: debtBySupplier.get(s.id) || 0,
        open_debts_count: countBySupplier.get(s.id) || 0,
      }));

      setSuppliers(mapped);
    } catch {
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, [activeBusinessId, isMasterView]);

  const filteredSuppliers = suppliers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.supplier_no && s.supplier_no.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  const totalPayablesMinor = suppliers.reduce(
    (sum, s) => sum + (s.total_payable_minor || 0),
    0
  );
  const suppliersWithDebts = suppliers.filter((s) => (s.total_payable_minor || 0) > 0).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900">
            Suppliers & Vendor Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
            Wholesale suppliers, payment terms, and vendor contact records.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsAddModalOpen(true)}
          className="h-9 px-3 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Supplier
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#1F7A3D]" />
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Outstanding Supplier Payables
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <MoneyDisplay minorUnits={totalPayablesMinor} size="lg" variant="neutral" />
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Owed across {suppliersWithDebts} active suppliers
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Suppliers Registered
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-600 flex items-center justify-center">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {suppliers.length}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Verified vendor accounts
          </p>
        </Card>

        <Card className="bg-white border-slate-200/90 text-slate-900 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Payment Terms Standard
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/70 text-slate-600 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-sm font-bold text-slate-900 pt-1">
            0 to 90 Days Credit
          </div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            Auto-applied to new supplier bills
          </p>
        </Card>
      </div>

      {/* Search Input (No wordy placeholders!) */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-9 pl-9 pr-4 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-900"
        />
      </div>

      {/* Suppliers Table */}
      <Card className="bg-white border-slate-200/90 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Loading suppliers...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            {searchQuery ? 'No suppliers match your search.' : 'No suppliers registered yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Supplier / Company</th>
                  <th className="px-4 py-2.5">Phone Number</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Payment Terms</th>
                  <th className="px-4 py-2.5 text-right">Payable Balance</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((s) => {
                  const biz = businesses.find((b) => b.id === s.business_id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-700">
                        {s.supplier_no || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        {isMasterView && biz && (
                          <div className="text-[10px] text-slate-500">{biz.name}</div>
                        )}
                        {s.notes && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {s.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                        {s.phone ? (
                          <a
                            href={`tel:${s.phone}`}
                            className="hover:text-emerald-700 hover:underline flex items-center gap-1.5"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            {fmt_phone(s.phone)}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {s.email ? (
                          <a
                            href={`mailto:${s.email}`}
                            className="hover:text-emerald-700 hover:underline flex items-center gap-1.5"
                          >
                            <Mail className="w-3 h-3 text-slate-400" />
                            {s.email}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {s.payment_terms_days === 0
                            ? 'Cash on Delivery'
                            : `${s.payment_terms_days} Days Credit`}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {s.total_payable_minor && s.total_payable_minor > 0 ? (
                          <MoneyDisplay
                            minorUnits={s.total_payable_minor}
                            size="sm"
                            variant="negative"
                          />
                        ) : (
                          <span className="text-emerald-700 font-medium">Cleared</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.phone && (
                            <a
                              href={`https://wa.me/${s.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {s.phone && (
                            <a
                              href={`tel:${s.phone}`}
                              className="p-1 rounded text-slate-600 hover:bg-slate-100 transition-colors"
                              title="Call Supplier"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddSupplierModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={loadSuppliers}
      />
    </div>
  );
}
