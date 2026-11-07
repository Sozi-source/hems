'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { CustomerItem } from '@/app/(dashboard)/customers/page';

export function EditCustomerModal({ customer, onClose, onSaved, onArchived }: {
  customer: CustomerItem | null; onClose: () => void; onSaved: () => void; onArchived: () => void;
}) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [offsets, setOffsets] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setName(customer?.full_name || ''); setNickname(customer?.nickname || ''); setPhone(customer?.phone || '');
    setOffsets((customer as any)?.reminder_offsets?.join(', ') || ''); setError('');
  }, [customer]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!customer) return;
    setBusy(true); setError('');
    try {
      const reminderOffsets = offsets.trim() ? offsets.split(',').map((n) => Number(n.trim())) : null;
      const res = await fetch('/api/customers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: customer.id, fullName: name, nickname, phone, reminderOffsets }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not update customer.');
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function archive() {
    if (!customer || !window.confirm(`Archive ${customer.full_name}? They will be hidden from the active list while their financial history remains available.`)) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/customers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: customer.id }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not archive customer.');
      onArchived(); onClose();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal isOpen={Boolean(customer)} onClose={onClose} title="Edit customer" maxWidth="md">
    <form onSubmit={submit} className="space-y-4 text-left">
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <label className="block text-sm font-medium">Full name<input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Nickname<input value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Debt reminder days after due date<input value={offsets} onChange={(e) => setOffsets(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs text-slate-500">Comma separated days, such as 3, 7, 14. Leave blank to use the business default. Applies to this customer’s active and future debts.</span></label>
      <div className="flex items-center justify-between border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={archive} disabled={busy} className="text-rose-700">Archive customer</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></div></div>
    </form>
  </Modal>;
}
