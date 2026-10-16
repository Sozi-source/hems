'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useBusiness } from '@/context/business-context';
import {
  parseVCard,
  parseContactsCsv,
  parsePastedContacts,
  ParsedContact,
} from '@/lib/customers/phonebook-parser';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Building2,
  Smartphone,
  ClipboardPaste,
  UserCheck,
} from 'lucide-react';

interface ImportPhonebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportPhonebookModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportPhonebookModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [targetBusinessId, setTargetBusinessId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [fileName, setFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setFileName('');
      setPasteText('');
      setContacts([]);
      setSelectedIndices(new Set());
      setImportSummary(null);
      if (!isMasterView && activeBusinessId) {
        setTargetBusinessId(activeBusinessId);
      } else if (businesses.length > 0) {
        setTargetBusinessId(businesses[0].id);
      }
    }
  }, [isOpen, activeBusinessId, isMasterView, businesses]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setImportSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.vcf') && !lower.endsWith('.csv')) {
      setError('Please upload an Android/iPhone vCard (.vcf) or Contacts CSV (.csv) file.');
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let result;
        if (lower.endsWith('.vcf')) {
          result = parseVCard(text);
        } else {
          result = parseContactsCsv(text);
        }

        if (result.contacts.length === 0) {
          setError('No valid contacts with phone numbers found in this file.');
          setContacts([]);
          setSelectedIndices(new Set());
        } else {
          setContacts(result.contacts);
          setSelectedIndices(new Set(result.contacts.map((_, i) => i)));
        }
      } catch (err: any) {
        setError(`Failed to parse contact file: ${err.message || 'Unknown error'}`);
        setContacts([]);
      }
    };
    reader.onerror = () => {
      setError('Error reading file from disk.');
    };
    reader.readAsText(file);
  };

  const handleParsePastedText = () => {
    setError(null);
    if (!pasteText.trim()) {
      setError('Please paste contact lines first.');
      return;
    }

    const result = parsePastedContacts(pasteText);
    if (result.contacts.length === 0) {
      setError('No valid phone numbers found in the pasted text. Expected formats like: Mama Brian - 0712345678');
      setContacts([]);
    } else {
      setContacts(result.contacts);
      setSelectedIndices(new Set(result.contacts.map((_, i) => i)));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === contacts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(contacts.map((_, i) => i)));
    }
  };

  const toggleSelectIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  const handleContactChange = (index: number, field: 'fullName' | 'nickname', value: string) => {
    setContacts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleImport = async () => {
    const selected = contacts.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) {
      setError('Select at least one contact to import.');
      return;
    }

    if (!targetBusinessId) {
      setError('Please select a target business ledger.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const res = await fetch('/api/customers/import-phonebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBusinessId,
          contacts: selected,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportSummary({
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
        skippedCount: data.skippedCount,
      });

      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to import phonebook contacts');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Phonebook Customers & Nicknames"
      maxWidth="lg"
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          Import regular customers from the business phonebook with their contact nicknames (e.g. Mama Brian, Kipkorir Mulot).
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Target Business Ledger */}
        {businesses.length > 1 && !importSummary && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-1.5 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Target Business Ledger
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Input Methods Tab Switcher */}
        {!importSummary && contacts.length === 0 && (
          <div className="flex border-b border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'upload'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              Upload Phonebook File (.vcf / .csv)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'paste'
                  ? 'border-slate-900 text-slate-900 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste Contacts List
            </button>
          </div>
        )}

        {/* Option 1: File Dropzone */}
        {!importSummary && contacts.length === 0 && activeTab === 'upload' && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
            <div className="border border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-slate-50">
              <input
                type="file"
                accept=".vcf,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="phonebook-upload-input"
              />
              <label htmlFor="phonebook-upload-input" className="cursor-pointer block">
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-2">
                  <Smartphone className="w-5 h-5 text-slate-600" />
                </div>
                <span className="font-semibold text-xs text-slate-900 block">
                  {fileName ? fileName : 'Click to select exported contacts (.vcf or .csv)'}
                </span>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  Export directly from Android Contacts: <strong>Contacts app → Settings / Manage Contacts → Export to .vcf</strong>
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Option 2: Paste List */}
        {!importSummary && contacts.length === 0 && activeTab === 'paste' && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Paste Contacts (One per line)
            </label>
            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Mama Brian - 0712345678&#10;Kipkorir Mulot (Festus) - 254113761329&#10;Norah Tangus: 0722000000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 placeholder:text-slate-400"
            />
            <div className="flex justify-end">
              <Button type="button" variant="primary" size="sm" onClick={handleParsePastedText}>
                Parse Contacts
              </Button>
            </div>
          </div>
        )}

        {/* Contacts Preview Table */}
        {!importSummary && contacts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold text-slate-900">
                  {selectedIndices.size} of {contacts.length} Contacts Selected
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                {selectedIndices.size === contacts.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIndices.size === contacts.length && contacts.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-slate-900"
                      />
                    </th>
                    <th className="px-3 py-2 font-semibold">Customer Full Name</th>
                    <th className="px-3 py-2 font-semibold">Nickname / Alias</th>
                    <th className="px-3 py-2 font-semibold">Phone Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contacts.map((c, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        selectedIndices.has(idx) ? 'bg-white' : 'bg-slate-50/40 opacity-60'
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(idx)}
                          onChange={() => toggleSelectIndex(idx)}
                          className="rounded border-slate-300 text-slate-900"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-900">
                        <input
                          type="text"
                          value={c.fullName}
                          onChange={(e) => handleContactChange(idx, 'fullName', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white text-xs font-medium"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        <input
                          type="text"
                          value={c.nickname || ''}
                          placeholder="— Add nickname —"
                          onChange={(e) => handleContactChange(idx, 'nickname', e.target.value)}
                          className="w-full bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200 focus:border-slate-400 focus:bg-white text-xs text-slate-600 placeholder:text-slate-400 placeholder:italic"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-600">
                        +{c.phone}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setContacts([]);
                  setFileName('');
                  setPasteText('');
                }}
                className="text-slate-500 hover:text-slate-800 text-[11px]"
              >
                ← Choose another file or text
              </button>
            </div>
          </div>
        )}

        {/* Success Report */}
        {importSummary && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Phonebook Contacts Imported Successfully
                </h4>
                <p className="text-[11px] text-slate-500">
                  Customers are active with auto-generated account numbers (C0001...) and mapped nicknames.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">New Customers</span>
                <span className="text-sm font-bold text-slate-900">
                  {importSummary.createdCount}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Nicknames Updated</span>
                <span className="text-sm font-bold text-slate-600">
                  {importSummary.updatedCount}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Skipped / Exists</span>
                <span className="text-sm font-bold text-slate-400">
                  {importSummary.skippedCount}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              When these customers pay via M-Pesa, Equity, NCBA, or ABSA, HEMS will automatically recognize them by their phone number or nickname.
            </p>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isImporting}>
            {importSummary ? 'Close' : 'Cancel'}
          </Button>

          {!importSummary && contacts.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleImport}
              isLoading={isImporting}
              disabled={selectedIndices.size === 0}
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              Import {selectedIndices.size} Customers
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
