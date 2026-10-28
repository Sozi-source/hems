'use client';

import React, { useState, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  Building2,
  CreditCard,
  Key,
  Pencil,
  X,
  MessageSquare,
  Phone,
  CheckCircle2,
} from 'lucide-react';

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

interface SmsTemplateRecord {
  id: string;
  business_id: string;
  key: string;
  name: string;
  body: string;
  is_active: boolean;
}

export default function SettingsPage() {
  const { businesses } = useBusiness();
  const [channels, setChannels] = useState<PaymentChannelRecord[]>([]);
  const [editingChannel, setEditingChannel] = useState<PaymentChannelRecord | null>(null);
  const [draft, setDraft] = useState({
    business_id: '',
    provider: 'mpesa_paybill',
    shortcode: '',
    business_shortcode: '',
    label: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  // SMS Templates state
  const [templates, setTemplates] = useState<SmsTemplateRecord[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplateRecord | null>(null);
  const [templateDraftBody, setTemplateDraftBody] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateNotice, setTemplateNotice] = useState('');

  function startEditing(channel: PaymentChannelRecord) {
    setEditingChannel(channel);
    setDraft({
      business_id: channel.business_id,
      provider: channel.provider,
      shortcode: channel.shortcode,
      business_shortcode: channel.business_shortcode || '',
      label: channel.label || '',
      is_active: channel.is_active !== false,
    });
    setFormError('');
    setNotice('');
  }

  function startEditingTemplate(tpl: SmsTemplateRecord) {
    setEditingTemplate(tpl);
    setTemplateDraftBody(tpl.body);
    setFormError('');
    setTemplateNotice('');
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
    if (
      draft.is_active &&
      channels.some(
        (channel) =>
          channel.id !== editingChannel.id &&
          channel.business_id === draft.business_id &&
          channel.is_active &&
          ['mpesa_paybill', 'mpesa_till'].includes(channel.provider)
      )
    ) {
      setFormError(
        'Another M-Pesa channel is already active for this business. Deactivate it first; STK Push requires exactly one active channel.'
      );
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
        label:
          draft.label.trim() ||
          (draft.provider === 'mpesa_till' ? 'M-Pesa Till' : 'M-Pesa Paybill'),
        is_active: draft.is_active,
      })
      .eq('id', editingChannel.id)
      .select('*')
      .single();

    setSaving(false);
    if (error) {
      setFormError(
        error.message.includes('duplicate')
          ? 'That provider and shortcode are already registered.'
          : `Could not save channel: ${error.message}`
      );
      return;
    }
    setChannels((current) =>
      current.map((channel) =>
        channel.id === editingChannel.id ? (data as PaymentChannelRecord) : channel
      )
    );
    setEditingChannel(null);
    setNotice('Payment channel updated.');
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTemplate) return;

    const cleanBody = templateDraftBody.trim();
    if (!cleanBody) {
      setFormError('SMS template body cannot be empty.');
      return;
    }

    setTemplateSaving(true);
    setFormError('');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sms_templates')
      .update({ body: cleanBody })
      .eq('id', editingTemplate.id)
      .select('*')
      .single();

    setTemplateSaving(false);
    if (error) {
      setFormError(`Could not save template: ${error.message}`);
      return;
    }

    setTemplates((current) =>
      current.map((t) => (t.id === editingTemplate.id ? (data as SmsTemplateRecord) : t))
    );
    setEditingTemplate(null);
    setTemplateNotice('SMS template updated.');
  }

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const { data: channelData } = await supabase
          .from('payment_channels')
          .select('*')
          .order('created_at', { ascending: false });

        setChannels((channelData as PaymentChannelRecord[]) || []);

        const { data: tplData } = await supabase
          .from('sms_templates')
          .select('id, business_id, key, name, body, is_active')
          .order('key');

        setTemplates((tplData as SmsTemplateRecord[]) || []);
      } catch {
        setChannels([]);
        setTemplates([]);
      }
    }

    loadData();
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
              const isHaron = b.code === 'HARON_FASHION' || b.code === 'DEV_HARON_FASHION';
              const contactPhone = isHaron ? '0725499796' : '0711377496';
              const contactTag = isHaron ? 'Haron fashio-0725499796' : 'Zenith- 0711377496';
              return (
                <div
                  key={b.code}
                  className={`flex flex-col gap-1.5 p-3 rounded-fintech bg-slate-50/70 border border-slate-200/80 border-l-4 ${
                    isHaron ? 'border-l-[#881337]' : 'border-l-[#0F172A]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{b.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{b.code}</div>
                    </div>
                    <Badge variant={isHaron ? 'danger' : 'info'} size="sm">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white/80 px-2 py-1 rounded border border-slate-200/60 font-mono">
                    <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Appended Contact: <strong>{contactTag}</strong></span>
                  </div>
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
            <span className="text-[11px] text-slate-500">
              Edit a channel to configure Till and STK Push
            </span>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{ch.label}</span>
                    <Badge variant="info" size="sm">
                      {ch.provider === 'mpesa_till' ? 'Buy Goods / Till' : 'Paybill'} ·{' '}
                      {ch.shortcode}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {ch.is_active ? 'Active for STK Push' : 'Inactive for STK Push'}
                  </div>
                  {ch.business_shortcode && (
                    <div className="text-[11px] text-slate-500">
                      Store / Business Short Code:{' '}
                      <span className="font-mono text-slate-700">
                        {ch.business_shortcode}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="capitalize">{ch.provider.replace('_', ' ')}</span>
                    {ch.secret_ref && (
                      <span className="font-mono flex items-center gap-1 text-slate-700">
                        <Key className="w-3 h-3 text-amber-600 inline" />
                        {ch.secret_ref}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full text-xs"
                    onClick={() => startEditing(ch)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit channel / Configure STK Push
                  </Button>
                </div>
              ))
            )}
            {notice && (
              <p role="status" className="text-xs text-emerald-700">
                {notice}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* SMS Templates & Contact Phone Numbers Section */}
      <Card className="bg-white border-slate-200/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-700" />
            <CardTitle className="text-slate-800">
              Customer SMS Templates & Sign-Off Numbers
            </CardTitle>
          </div>
          <span className="text-[11px] text-slate-500">
            Messages are appended with designated phone numbers and optimized to fit single-SMS limits (≤ 160 characters).
          </span>
        </CardHeader>

        {templateNotice && (
          <div className="p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{templateNotice}</span>
          </div>
        )}

        <div className="space-y-6">
          {businesses.map((biz) => {
            const bizTemplates = templates.filter((t) => t.business_id === biz.id);
            const isHaron = biz.code === 'HARON_FASHION' || biz.code === 'DEV_HARON_FASHION';
            const contactTag = isHaron ? 'Haron fashio-0725499796' : 'Zenith- 0711377496';

            return (
              <div key={biz.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{biz.name}</span>
                    <Badge variant={isHaron ? 'danger' : 'info'} size="sm">
                      {biz.code}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono font-medium">
                    Contact Tag: <span className="font-bold text-slate-900">{contactTag}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {bizTemplates.map((t) => {
                    const charCount = t.body.length;
                    const isSingleSms = charCount <= 160;

                    return (
                      <div
                        key={t.id}
                        className="p-3 rounded-fintech bg-slate-50/70 border border-slate-200 space-y-2 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {t.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {t.key}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-200/80 font-mono leading-relaxed">
                            {t.body}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
                          <span
                            className={`text-[11px] font-medium font-mono ${
                              isSingleSms ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {charCount} chars {isSingleSms ? '(≤160 · 1 SMS)' : '(>160 · 2 SMS)'}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => startEditingTemplate(t)}
                            className="h-7 text-xs px-2"
                          >
                            <Pencil className="w-3 h-3 mr-1" /> Edit
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit M-Pesa Channel Modal */}
      {editingChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setEditingChannel(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-channel-title"
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="edit-channel-title" className="text-base font-semibold text-slate-900">
                Edit M-Pesa Channel
              </h2>
              <button
                type="button"
                aria-label="Close"
                disabled={saving}
                onClick={() => setEditingChannel(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveChannel} className="space-y-4">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Business
                <select
                  required
                  value={draft.business_id}
                  onChange={(event) =>
                    setDraft({ ...draft, business_id: event.target.value })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Select a business
                  </option>
                  {businesses
                    .filter((business) => business.id)
                    .map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Channel type
                <select
                  value={draft.provider}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      provider: event.target.value,
                      business_shortcode:
                        event.target.value === 'mpesa_till' ? draft.business_shortcode : '',
                    })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="mpesa_paybill">Paybill</option>
                  <option value="mpesa_till">Buy Goods / Till</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                {draft.provider === 'mpesa_till' ? 'Receiving Till number' : 'Paybill number'}
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{5,7}"
                  maxLength={7}
                  value={draft.shortcode}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      shortcode: event.target.value.replace(/\D/g, '').slice(0, 7),
                    })
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              {draft.provider === 'mpesa_till' && (
                <label className="block space-y-1 text-xs font-medium text-slate-700">
                  Store / Business Short Code (the Store Number)
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{5,7}"
                    maxLength={7}
                    value={draft.business_shortcode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        business_shortcode: event.target.value.replace(/\D/g, '').slice(0, 7),
                      })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <span className="block font-normal text-slate-500">
                    This must match the shortcode configured for Daraja production credentials.
                  </span>
                </label>
              )}
              <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(event) =>
                    setDraft({ ...draft, is_active: event.target.checked })
                  }
                  className="mt-0.5 accent-emerald-600"
                />
                <span>
                  <span className="font-medium">Enable this channel for STK Push</span>
                  <span className="mt-0.5 block text-slate-500">
                    Only one M-Pesa channel can be active for prompts per business.
                  </span>
                </span>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Display name
                <input
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              {formError && (
                <p role="alert" className="text-xs text-rose-700">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setEditingChannel(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="success" size="sm" isLoading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Edit SMS Template Modal */}
      {editingTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !templateSaving) {
              setEditingTemplate(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-template-title"
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2
                  id="edit-template-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Edit SMS Template
                </h2>
                <span className="text-xs text-slate-500">
                  {editingTemplate.name} ({editingTemplate.key})
                </span>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={templateSaving}
                onClick={() => setEditingTemplate(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={saveTemplate} className="space-y-4">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Template Message Body
                <textarea
                  required
                  rows={4}
                  value={templateDraftBody}
                  onChange={(event) => setTemplateDraftBody(event.target.value)}
                  className="w-full rounded-md border border-slate-300 p-2.5 text-xs font-mono leading-relaxed"
                />
              </label>

              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={`font-mono font-medium ${
                    templateDraftBody.length <= 160 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {templateDraftBody.length} characters{' '}
                  {templateDraftBody.length <= 160
                    ? '(Single SMS segment)'
                    : '(Multi-segment SMS)'}
                </span>
                <span className="text-slate-500">
                  Placeholders: {'{{first_name}}'}, {'{{amount}}'}, {'{{balance}}'}, etc.
                </span>
              </div>

              {formError && (
                <p role="alert" className="text-xs text-rose-700">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={templateSaving}
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  size="sm"
                  isLoading={templateSaving}
                >
                  Save Template
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
