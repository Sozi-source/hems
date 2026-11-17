'use client';

import React, { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}`;
}

export function CashbookExportButton() {
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/cashbook?month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not generate the cashbook.');
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `Cashbook_${month}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hidden md:flex items-center gap-1">
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        aria-label="Cashbook month"
        className="h-9 px-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={download}
        isLoading={loading}
        title="Download the monthly cashbook for both businesses (Excel)"
        className="h-9 px-3 text-xs"
      >
        {!loading && <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />}
        Cashbook
      </Button>
    </div>
  );
}
