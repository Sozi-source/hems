'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  isShowingAll?: boolean;
  onToggleShowAll?: () => void;
  itemLabel?: string;
  className?: string;
}

export function PaginationBar({
  currentPage,
  totalItems,
  pageSize = 15,
  onPageChange,
  isShowingAll = false,
  onToggleShowAll,
  itemLabel = 'items',
  className,
}: PaginationBarProps) {
  if (totalItems <= pageSize && !isShowingAll) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = isShowingAll ? 1 : (safePage - 1) * pageSize + 1;
  const endItem = isShowingAll ? totalItems : Math.min(totalItems, safePage * pageSize);

  const handleStep = (nextPage: number) => {
    onPageChange(nextPage);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div
      className={cn(
        'rounded-card bg-white border border-slate-200/90 p-3 sm:px-4 sm:py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3',
        className
      )}
    >
      {/* Left: Range counter & Show All toggle */}
      <div className="flex items-center justify-between sm:justify-start gap-3">
        <div className="text-xs text-slate-600 font-medium">
          Showing{' '}
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {startItem}–{endItem}
          </span>{' '}
          of{' '}
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {totalItems}
          </span>{' '}
          {itemLabel}
        </div>

        {onToggleShowAll && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 transition-colors shrink-0"
          >
            <ListFilter className="w-3 h-3" />
            {isShowingAll ? `Paginate (${pageSize}/page)` : 'Show All'}
          </button>
        )}
      </div>

      {/* Right: Thumb-friendly Prev / Page indicator / Next stepper */}
      {!isShowingAll && (
        <div className="grid grid-cols-3 sm:flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => handleStep(safePage - 1)}
            className="min-h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Prev</span>
          </button>

          <div className="min-h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-semibold text-slate-700 inline-flex items-center justify-center whitespace-nowrap tabular-nums">
            {safePage} / {totalPages}
          </div>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => handleStep(safePage + 1)}
            className="min-h-9 px-3 rounded-lg bg-[#123520] hover:bg-[#1A4A2D] text-white text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-1 transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
