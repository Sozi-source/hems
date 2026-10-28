'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parseSingleContactString } from '@/lib/customers/phonebook-parser';
import {
  AlertCircle,
  Truck,
  Building2,
  Smartphone,
  ClipboardPaste,
  CheckCircle2,
} from 'lucide-react';

interface AddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSupplierModal({ isOpen, onClose, onSuccess }: AddSupplierModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('0');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phonebook quick-add states
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [phonebookLoadedNotice, setPhonebookLoadedNotice] = useState<string | null>(null);

  const isContactPickerSupported =
    typeof window !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setName('');
      setPhone('');
      setEmail('');
      setPaymentTermsDays('0');
      setNotes('');
      setShowPasteInput(false);
      setPasteInput('');
      setPhonebookLoadedNotice(null);
      if (!isMasterView && activeBusinessId) {
        setBusinessId(activeBusinessId);
      } else if (businesses.length > 0) {
        setBusinessId(businesses[0].id || businesses[0].code);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  const handlePickFromPhonebook = async () => {
    setError(null);
    setPhonebookLoadedNotice(null);

    if (isContactPickerSupported) {
      try {
        const props = ['name', 'tel'];
        const contacts = await (navigator as any).contacts.select(props, { multiple: false });
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          const rawName = (c.name && c.name[0]) || '';
          const rawTel = (c.tel && c.tel[0]) || '';

          if (!rawTel && !rawName) {
            setError('No contact details found in selected contact.');
            return;
          }

          let formattedPhone = rawTel.replace(/[^\d+]/g, '');
          if (formattedPhone.startsWith('+254')) {
            formattedPhone = '0' + formattedPhone.slice(4);
          } else if (formattedPhone.startsWith('254')) {
            formattedPhone = '0' + formattedPhone.slice(3);
          } else if (
            formattedPhone.length === 9 &&
            (formattedPhone.startsWith('7') || formattedPhone.startsWith('1'))
          ) {
            formattedPhone = '0' + formattedPhone;
          }

          const parsed = parseSingleContactString(rawName);
          setName(parsed.fullName || rawName);
          if (formattedPhone) {
            setPhone(formattedPhone);
          }
          setPhonebookLoadedNotice(
            `Loaded from phonebook: ${rawName}${formattedPhone ? ` (${formattedPhone})` : ''}`
          );
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setShowPasteInput(true);
          setError('Could not access device phonebook. You can paste the contact details below.');
        }
      }
    } else {
      setShowPasteInput(true);
    }
  };

  const handleParsePastedContact = () => {
    setError(null);
    if (!pasteInput.trim()) {
      setError('Please enter contact text to fill.');
      return;
    }

    const parsed = parseSingleContactString(pasteInput);
    if (!parsed.fullName && !parsed.phone) {
      setError('Could not identify a supplier name or phone number from the text.');
      return;
    }

    if (parsed.fullName) setName(parsed.fullName);
    if (parsed.phone) setPhone(parsed.phone);

    setPhonebookLoadedNotice(
      `Loaded from text: ${parsed.fullName}${parsed.phone ? ` (${parsed.phone})` : ''}`
    );
    setPasteInput('');
    setShowPasteInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetBiz = businessId || activeBusinessId;
    if (!targetBiz) {
      setError('Please select a business');
      return;
    }

    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 120) {
      setError('Enter a supplier or vendor name between 2 and 120 characters.');
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (
      phone.trim() &&
      !(
        /^0[17]\d{8}$/.test(phoneDigits) ||
        /^254[17]\d{8}$/.test(phoneDigits) ||
        /^[17]\d{8}$/.test(phoneDigits)
      )
    ) {
      setError('Enter a valid Kenyan phone number, such as 0712345678 or 254712345678.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBiz,
          name: cleanName,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          paymentTermsDays: parseInt(paymentTermsDays, 10) || 0,
          notes: notes.trim() || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to create supplier');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add supplier');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Supplier / Vendor" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector */}
        {isMasterView && businesses.length > 0 && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-1.5 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Target Business Ledger
            </label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              required
            >
              {businesses.map((b) => (
                <option
                  key={b.id || b.code}
                  value={b.id || b.code}
                  className="bg-white text-slate-900"
                >
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Phonebook Quick-Add Strip */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add from Phonebook</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePickFromPhonebook}
              className="text-xs bg-white border-slate-300 hover:bg-slate-50 text-slate-800 shadow-2xs font-medium h-8"
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              {isContactPickerSupported
                ? 'Choose from Phone Contacts'
                : 'Paste Contact from Phonebook'}
            </Button>

            <button
              type="button"
              onClick={() => setShowPasteInput(!showPasteInput)}
              className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2 py-1 px-1 font-medium"
            >
              {showPasteInput ? 'Hide quick paste' : 'Paste text'}
            </button>
          </div>

          {showPasteInput && (
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  className="flex-1 h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 font-mono text-slate-900"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={handleParsePastedContact}
                  className="h-8 text-xs px-3"
                >
                  <ClipboardPaste className="w-3 h-3 mr-1" />
                  Fill
                </Button>
              </div>
            </div>
          )}

          {phonebookLoadedNotice && (
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{phonebookLoadedNotice}</span>
            </div>
          )}
        </div>

        {/* Card 1: Identity */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
          <Input
            label="Supplier / Company Name *"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono text-xs"
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        {/* Card 2: Payment Terms & Notes */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Payment Terms (Days Credit)
            </label>
            <select
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="0">Immediate / Cash on Delivery (0 Days)</option>
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days (Standard Month-End)</option>
              <option value="60">60 Days</option>
              <option value="90">90 Days</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Notes / Delivery Terms
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            <Truck className="w-3.5 h-3.5 mr-1" />
            Save Supplier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
