'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import { parse_kes } from '@/lib/format';
import { parseSingleContactString } from '@/lib/customers/phonebook-parser';
import {
  AlertCircle,
  UserPlus,
  Building2,
  Smartphone,
  ClipboardPaste,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenImport?: () => void;
}

export function AddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenImport,
}: AddCustomerModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [businessId, setBusinessId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
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
      setFullName('');
      setNickname('');
      setPhone('');
      setCreditLimit('');
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
          setFullName(parsed.fullName || rawName);
          if (parsed.nickname) {
            setNickname(parsed.nickname);
          }
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
      setError('Please enter contact text to fill (e.g. Mama Brian - 0712345678).');
      return;
    }

    const parsed = parseSingleContactString(pasteInput);
    if (!parsed.fullName && !parsed.phone) {
      setError('Could not identify a customer name or phone number from the text.');
      return;
    }

    if (parsed.fullName) setFullName(parsed.fullName);
    if (parsed.nickname) setNickname(parsed.nickname);
    if (parsed.phone) setPhone(parsed.phone);

    setPhonebookLoadedNotice(
      `Loaded from phonebook text: ${parsed.fullName}${parsed.phone ? ` (${parsed.phone})` : ''}`
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

    const cleanName = fullName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 120) {
      setError('Enter a customer name between 2 and 120 characters.');
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
      const cleanLimit = creditLimit.trim();
      if (cleanLimit && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleanLimit)) {
        throw new Error('Enter a valid credit limit, such as 1000 or 1,000.00.');
      }
      const parsedLimit = cleanLimit ? parse_kes(cleanLimit) : 0n;
      if (parsedLimit < 0n || parsedLimit > 9223372036854775807n) {
        throw new Error('Credit limit must be between KSh 0 and KSh 92,233,720,368,547,758.07.');
      }

      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBiz,
          fullName: cleanName,
          nickname: nickname.trim() || undefined,
          phone: phone.trim() || undefined,
          creditLimitMinor: cleanLimit ? parsedLimit.toString() : undefined,
        }),
      });

      let resData: any = {};
      const responseText = await res.text();
      try {
        resData = JSON.parse(responseText);
      } catch {
        if (!res.ok) {
          throw new Error('Server error. Please try again.');
        }
      }

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to create customer');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add customer');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Customer" maxWidth="md">
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add from Phonebook</span>
            </div>
            {onOpenImport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImport();
                }}
                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" />
                Batch import (.vcf / list) →
              </button>
            )}
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
              {showPasteInput
                ? 'Hide quick paste'
                : 'Paste text (e.g. Mama Brian - 0712345678)'}
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
              <p className="text-[10px] text-slate-500">
                Paste contact details from WhatsApp or your phonebook to auto-fill name, nickname,
                and phone.
              </p>
            </div>
          )}

          {phonebookLoadedNotice && (
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{phonebookLoadedNotice}</span>
            </div>
          )}
        </div>

        {/* Card 1: Identity & Nickname */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
          <Input
            label="Official Full Name *"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Phonebook Nickname / Alias (Optional)"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <p className="text-[11px] text-slate-500 leading-normal -mt-1.5">
            How they are saved in your phone. Incoming payment alerts with this nickname or phone will
            auto-match this customer.
          </p>
        </div>

        {/* Card 2: Contact & Credit Settings */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-white font-mono text-xs"
          />

          <Input
            label="Credit Limit (Optional, KSh)"
            type="text"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            className="bg-white text-xs"
          />
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
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Save Customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
