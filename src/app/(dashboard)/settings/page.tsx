'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Building2, CreditCard, Key, Plus } from 'lucide-react';

interface PaymentChannelRecord {
  id: string;
  business_id: string;
  provider: string;
  shortcode: string;
  label: string;
  secret_ref?: string;
  is_active?: boolean;
}

export default function SettingsPage() {
  const { businesses } = useBusiness();
  const [channels, setChannels] = useState<PaymentChannelRecord[]>([]);

  useEffect(() => {
    async function loadChannels() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('payment_channels')
          .select('*')
          .order('created_at', { ascending: false });

        setChannels((data as PaymentChannelRecord[]) || []);
      } catch {
        setChannels([]);
      }
    }

    loadChannels();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
        Settings
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Businesses List */}
        <Card className="bg-white border-slate-200/90 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              <CardTitle className="text-slate-800">Businesses</CardTitle>
            </div>
            <Badge variant="purple" size="sm">
              {businesses.length} Active
            </Badge>
          </CardHeader>

          <div className="space-y-3">
            {businesses.map((b) => {
              const isHaron = b.code === 'HARON_FASHION';
              return (
                <div
                  key={b.code}
                  className={`flex items-center justify-between p-3 rounded-fintech bg-slate-50/70 border border-slate-200/80 border-l-4 ${
                    isHaron ? 'border-l-[#881337]' : 'border-l-[#0F172A]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{b.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{b.code}</div>
                  </div>
                  <Badge variant={isHaron ? 'danger' : 'info'} size="sm">Active</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Payment Channels */}
        <Card className="bg-white border-slate-200/90 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-700" />
              <CardTitle className="text-slate-800">Paybill Channels</CardTitle>
            </div>
            <Button variant="secondary" size="sm" className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Paybill
            </Button>
          </CardHeader>

          <div className="space-y-3">
            {channels.length === 0 ? (
              <div className="text-center py-8 rounded-fintech border border-dashed border-slate-200 bg-slate-50/40 p-4">
                <div className="text-xs font-medium text-slate-500">
                  No Paybills registered
                </div>
              </div>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3 rounded-fintech bg-slate-50/70 border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{ch.label}</span>
                    <Badge variant="info" size="sm">Paybill {ch.shortcode}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="capitalize">{ch.provider.replace('_', ' ')}</span>
                    {ch.secret_ref && (
                      <span className="font-mono flex items-center gap-1 text-slate-700">
                        <Key className="w-3 h-3 text-amber-600 inline" />
                        {ch.secret_ref}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
