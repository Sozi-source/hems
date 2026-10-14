'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmt_kes } from '@/lib/format';
import { useBusiness } from '@/context/business-context';
import { parseBankStatementCsv, StatementParseResult } from '@/lib/reconciliation/statement-parser';
import { UploadCloud, FileSpreadsheet, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

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
      title="Import Bank Statement (CSV)"
      maxWidth="lg"
    >
      <p className="text-xs text-slate-600 mb-4 leading-normal">
        Upload Equity EazzyBiz, ABSA, or standard bank CSV exports to reconcile paybill collections.
      </p>
      <div className="space-y-4 text-sm">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Business Selector (if master view or multiple) */}
        {businesses.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assign Payments To Business
            </label>
            <select
              value={targetBusinessId}
              onChange={(e) => setTargetBusinessId(e.target.value)}
              className="w-full px-3 py-2 border border-[#DCE5DF] rounded-fintech text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1F7A3D]"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.id}>
                  {biz.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Upload Zone */}
        {!importSummary && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select CSV Statement
            </label>
            <div className="border-2 border-dashed border-[#DCE5DF] hover:border-[#1F7A3D] rounded-fintech p-6 text-center cursor-pointer transition-colors bg-[#F8FAF9]">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="statement-upload-input"
              />
              <label htmlFor="statement-upload-input" className="cursor-pointer block">
                <UploadCloud className="w-8 h-8 text-[#1F7A3D] mx-auto mb-2" />
                <span className="font-semibold text-slate-800">
                  {fileName ? fileName : 'Click to upload or drag & drop'}
                </span>
                <p className="text-xs text-slate-500 mt-1">
                  Supports Equity Bank (EazzyBiz), ABSA Internet Banking, and standard CSV exports.
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Parse Preview */}
        {parseResult && !importSummary && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-[#F1F5F2] p-3 rounded-fintech border border-[#DCE5DF]">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#1F7A3D]" />
                <div>
                  <span className="font-semibold text-slate-800">
                    Detected Format:
                  </span>{' '}
                  <Badge variant="neutral">
                    {parseResult.detectedBank === 'equity'
                      ? 'Equity Bank'
                      : parseResult.detectedBank === 'absa'
                      ? 'ABSA Bank'
                      : 'Generic Bank CSV'}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Credit Value</span>
                <span className="font-bold text-[#14231A]">
                  {fmt_kes(parseResult.totalCreditMinor)}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-600 px-1">
              <span>
                <strong>{parseResult.validRows.length}</strong> incoming payments found
              </span>
              <span>
                {parseResult.skippedRows.length} non-credit / debit rows skipped
              </span>
            </div>

            {/* Preview table */}
            <div className="border border-[#DCE5DF] rounded-fintech overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F8FAF9] text-slate-600 border-b border-[#DCE5DF] sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Ref Code</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Customer / BillRef</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE5DF]">
                  {parseResult.validRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 font-mono font-medium text-slate-800">
                        {row.transactionRef}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-[#1F7A3D]">
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
              <p className="text-xs text-slate-400 italic text-center">
                Showing first 50 of {parseResult.validRows.length} transactions. All will be imported.
              </p>
            )}
          </div>
        )}

        {/* Success Report */}
        {importSummary && (
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-fintech text-emerald-900 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <span>Bank Statement Reconciled Successfully!</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2.5 rounded border border-emerald-200">
                <span className="text-slate-500 block">New Payments</span>
                <span className="text-base font-bold text-emerald-700">
                  {importSummary.createdCount}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded border border-emerald-200">
                <span className="text-slate-500 block">Already Recorded</span>
                <span className="text-base font-bold text-slate-600">
                  {importSummary.duplicateCount}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded border border-emerald-200">
                <span className="text-slate-500 block">Errors</span>
                <span className="text-base font-bold text-red-600">
                  {importSummary.errorCount}
                </span>
              </div>
            </div>
            <p className="text-xs text-emerald-700">
              New transactions have been queued in <strong>"Needs Review"</strong> with automated debt matching candidate scores.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#DCE5DF]">
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
              <ArrowRight className="w-4 h-4 mr-1" />
              Import & Reconcile ({parseResult?.validRows.length || 0})
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
