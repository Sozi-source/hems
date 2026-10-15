'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmt_kes } from '@/lib/format';
import { useBusiness } from '@/context/business-context';
import { parseBankStatementCsv, StatementParseResult } from '@/lib/reconciliation/statement-parser';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, Building2 } from 'lucide-react';

interface ImportStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportStatementModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportStatementModalProps) {
  const { businesses, activeBusinessId, isMasterView } = useBusiness();
  const [targetBusinessId, setTargetBusinessId] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    totalProcessed: number;
    createdCount: number;
    duplicateCount: number;
    errorCount: number;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setFileName('');
      setParseResult(null);
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

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a standard CSV file exported from your bank portal.');
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseBankStatementCsv(text);
        if (result.validRows.length === 0) {
          setError('No valid incoming credit transactions found in this CSV statement. Ensure it contains credit amounts.');
          setParseResult(null);
        } else {
          setParseResult(result);
        }
      } catch (err: any) {
        setError(`Failed to parse CSV: ${err.message || 'Unknown error'}`);
        setParseResult(null);
      }
    };
    reader.onerror = () => {
      setError('Error reading file from disk.');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    if (!targetBusinessId) {
      setError('Please select the business to attribute these transactions to.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/statement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: targetBusinessId,
          rows: parseResult.validRows,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportSummary({
        totalProcessed: data.totalProcessed,
        createdCount: data.createdCount,
        duplicateCount: data.duplicateCount,
        errorCount: data.errorCount,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to import bank statement.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Bank Statement"
      maxWidth="lg"
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          Upload Equity Bank (EazzyBiz), ABSA Internet Banking, or standard CSV exports to reconcile statement lines in bulk.
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 text-rose-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector (if multi-entity) */}
        {businesses.length > 1 && !importSummary && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-1.5 shadow-xs">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Assign Payments To Business Ledger
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

        {/* Card 1: File Dropzone */}
        {!importSummary && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Statement File (.csv)
            </label>
            <div className="border border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-slate-50">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="statement-upload-input"
              />
              <label htmlFor="statement-upload-input" className="cursor-pointer block">
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-2">
                  <UploadCloud className="w-5 h-5 text-slate-600" />
                </div>
                <span className="font-semibold text-xs text-slate-900 block">
                  {fileName ? fileName : 'Click to select CSV statement file or drag here'}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Equity EazzyBiz, ABSA Business, and generic CSV formats supported.
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Card 2: Parsing Preview */}
        {parseResult && !importSummary && (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-800">
                    Detected Format:
                  </span>
                  <Badge variant="neutral" dot className="bg-white border-slate-200 text-slate-800 text-[11px]">
                    {parseResult.detectedBank === 'equity'
                      ? 'Equity Bank EazzyBiz'
                      : parseResult.detectedBank === 'absa'
                      ? 'ABSA Internet Banking'
                      : 'Generic Bank CSV'}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-slate-500 block">Total Inflow Value</span>
                  <span className="font-bold text-sm text-slate-900">
                    {fmt_kes(parseResult.totalCreditMinor)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-600">
                <span>
                  <strong className="text-slate-900">{parseResult.validRows.length}</strong> incoming transactions identified
                </span>
                <span className="text-slate-400">
                  {parseResult.skippedRows.length} debit/non-credit lines skipped
                </span>
              </div>
            </div>

            {/* Preview table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto bg-white shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Ref Code</th>
                    <th className="px-3 py-2 font-semibold">Amount</th>
                    <th className="px-3 py-2 font-semibold">Customer / Ref</th>
                    <th className="px-3 py-2 font-semibold">Statement Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parseResult.validRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-1.5 font-mono font-medium text-slate-800">
                        {row.transactionRef}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-slate-900">
                        {fmt_kes(row.amountMinor)}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {row.accountReference || (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 truncate max-w-[200px]" title={row.rawDescription}>
                        {row.rawDescription}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseResult.validRows.length > 50 && (
              <p className="text-[11px] text-slate-400 italic text-center">
                Displaying first 50 of {parseResult.validRows.length} transactions. All rows will be processed.
              </p>
            )}
          </div>
        )}

        {/* Card 3: Import Report Summary */}
        {importSummary && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Statement Reconciliation Complete
                </h4>
                <p className="text-[11px] text-slate-500">
                  Batch processed against database ledger with idempotency checks.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">New Inflow</span>
                <span className="text-sm font-bold text-slate-900">
                  {importSummary.createdCount}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Duplicates Skipped</span>
                <span className="text-sm font-bold text-slate-600">
                  {importSummary.duplicateCount}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Errors</span>
                <span className="text-sm font-bold text-rose-700">
                  {importSummary.errorCount}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              New transactions have been queued in <strong>"Needs Review"</strong> with automated candidate debt match scoring.
            </p>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>
            {importSummary ? 'Close' : 'Cancel'}
          </Button>

          {!importSummary && (
            <Button
              variant="primary"
              size="sm"
              disabled={!parseResult || parseResult.validRows.length === 0 || isImporting}
              isLoading={isImporting}
              onClick={handleImport}
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              Import & Reconcile ({parseResult?.validRows.length || 0})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
