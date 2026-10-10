'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Building2, CreditCard, Key, Pencil, Plus, X } from 'lucide-react';

interface PaymentChannelRecord {
  id: string;
  business_id: string;
  provider: string;
  shortcode: string;
  business_shortcode?: string | null;
  label: string;
  secret_ref?: string;
  is_active?: boolean;
}

export default function SettingsPage() {
  const { businesses } = useBusiness();
  const [channels, setChannels] = useState<PaymentChannelRecord[]>([]);
  const [editingChannel, setEditingChannel] = useState<PaymentChannelRecord | null>(null);
  const [draft, setDraft] = useState({ business_id: '', provider: 'mpesa_paybill', shortcode: '', business_shortcode: '', label: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  function startEditing(channel: PaymentChannelRecord) {
    setEditingChannel(channel);
    setDraft({
      business_id: channel.business_id,
      provider: channel.provider,
      shortcode: channel.shortcode,
      business_shortcode: channel.business_shortcode || '',
      label: channel.label || '',
    });
    setFormError('');
    setNotice('');
  }

  async function saveChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingChannel) return;
    const shortcode = draft.shortcode.trim();
    const storeCode = draft.business_shortcode.trim();
    if (!/^\d{5,7}$/.test(shortcode)) {
      setFormError('Enter a valid 5–7 digit shortcode or Till number.');
      return;
    }
    if (draft.provider === 'mpesa_till' && !/^\d{5,7}$/.test(storeCode)) {
      setFormError('A Till channel needs the 5–7 digit Store / Business Short Code.');
      return;
    }

    setSaving(true);
    setFormError('');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('payment_channels')
      .update({
        business_id: draft.business_id,
        provider: draft.provider,
        shortcode,
        business_shortcode: draft.provider === 'mpesa_till' ? storeCode : null,
        label: draft.label.trim() || (draft.provider === 'mpesa_till' ? 'M-Pesa Till' : 'M-Pesa Paybill'),
      })
      .eq('id', editingChannel.id)
      .select('*')
      .single();

    setSaving(false);
    if (error) {
      setFormError(error.message.includes('duplicate')
        ? 'That provider and shortcode are already registered.'
        : `Could not save channel: ${error.message}`);
      return;
    }
    setChannels((current) => current.map((channel) => channel.id === editingChannel.id ? data as PaymentChannelRecord : channel));
    setEditingChannel(null);
    setNotice('Payment channel updated.');
  }

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
              <CardTitle className="text-slate-800">M-Pesa Channels</CardTitle>
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
                  No M-Pesa channels registered
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
                    <div className="flex items-center gap-2">
                      <Badge variant="info" size="sm">{ch.provider === 'mpesa_till' ? 'Till' : 'Paybill'} {ch.shortcode}</Badge>
                      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => startEditing(ch)}>
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    </div>
                  </div>
                  {ch.business_shortcode && <div className="text-[11px] text-slate-500">Store / Business Short Code: <span className="font-mono text-slate-700">{ch.business_shortcode}</span></div>}
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
            {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
          </div>
        </Card>
      </div>

      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditingChannel(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="edit-channel-title" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="edit-channel-title" className="text-base font-semibold text-slate-900">Edit M-Pesa Channel</h2>
              <button type="button" aria-label="Close" disabled={saving} onClick={() => setEditingChannel(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={saveChannel} className="space-y-4">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Business
                <select required value={draft.business_id} onChange={(event) => setDraft({ ...draft, business_id: event.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="" disabled>Select a business</option>
                  {businesses.filter((business) => business.id).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Channel type
                <select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value, business_shortcode: event.target.value === 'mpesa_till' ? draft.business_shortcode : '' })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="mpesa_paybill">Paybill</option>
                  <option value="mpesa_till">Buy Goods / Till</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                {draft.provider === 'mpesa_till' ? 'Receiving Till number' : 'Paybill number'}
                <input required inputMode="numeric" pattern="[0-9]{5,7}" maxLength={7} value={draft.shortcode} onChange={(event) => setDraft({ ...draft, shortcode: event.target.value.replace(/\D/g, '').slice(0, 7) })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              {draft.provider === 'mpesa_till' && (
                <label className="block space-y-1 text-xs font-medium text-slate-700">
                  Store / Business Short Code (the Store Number)
                  <input required inputMode="numeric" pattern="[0-9]{5,7}" maxLength={7} value={draft.business_shortcode} onChange={(event) => setDraft({ ...draft, business_shortcode: event.target.value.replace(/\D/g, '').slice(0, 7) })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                  <span className="block font-normal text-slate-500">This must match the shortcode configured for Daraja production credentials.</span>
                </label>
              )}
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Display name
                <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              {formError && <p role="alert" className="text-xs text-rose-700">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setEditingChannel(null)}>Cancel</Button>
                <Button type="submit" variant="success" size="sm" isLoading={saving}>Save changes</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
