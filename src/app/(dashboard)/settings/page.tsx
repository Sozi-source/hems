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
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
        Settings
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Businesses List */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <CardTitle>Businesses</CardTitle>
            </div>
            <Badge variant="purple" size="sm">
              {businesses.length} Active
            </Badge>
          </CardHeader>

          <div className="space-y-3">
            {businesses.map((b) => (
              <div
                key={b.code}
                className="flex items-center justify-between p-3 rounded-fintech bg-surface-elevated border border-surface-border"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">{b.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{b.code}</div>
                </div>
                <Badge variant="neutral" size="sm">Active</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Payment Channels */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <CardTitle>Paybill Channels</CardTitle>
            </div>
            <Button variant="secondary" size="sm" className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Paybill
            </Button>
          </CardHeader>

          <div className="space-y-3">
            {channels.length === 0 ? (
              <div className="text-center py-8 rounded-fintech border border-dashed border-white/10 p-4">
                <div className="text-xs font-medium text-slate-300">
                  No Paybills registered
                </div>
              </div>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3 rounded-fintech bg-surface-elevated border border-surface-border space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{ch.label}</span>
                    <Badge variant="info" size="sm">Paybill {ch.shortcode}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="capitalize">{ch.provider.replace('_', ' ')}</span>
                    {ch.secret_ref && (
                      <span className="font-mono flex items-center gap-1 text-slate-300">
                        <Key className="w-3 h-3 text-amber-400 inline" />
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
