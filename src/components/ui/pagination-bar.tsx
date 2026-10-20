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
        'rounded-card bg-[#EAEFEC] border border-[#CBD6CF] p-3 sm:px-4 sm:py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3',
        className
      )}
    >
      {/* Left: Range counter & Show All toggle */}
      <div className="flex items-center justify-between sm:justify-start gap-3">
        <div className="text-xs text-[#26382E] font-medium">
          Showing{' '}
          <span className="font-mono font-bold tabular-nums text-[#14231A]">
            {startItem}–{endItem}
          </span>{' '}
          of{' '}
          <span className="font-mono font-bold tabular-nums text-[#144827]">
            {totalItems}
          </span>{' '}
          {itemLabel}
        </div>

        {onToggleShowAll && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#144827] hover:text-[#0E351C] bg-white/80 hover:bg-white px-2 py-1 rounded-md border border-[#CBD6CF] transition-colors shrink-0"
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
            className="min-h-10 px-3 rounded-lg bg-white border border-[#CBD6CF] text-xs font-bold text-[#14231A] hover:bg-[#F6F8F7] disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-1 transition-colors shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Prev</span>
          </button>

          <div className="min-h-10 px-2.5 rounded-lg bg-[#F3EDE0] border border-[#DFD2B6] text-xs font-mono font-bold text-[#3D2E14] inline-flex items-center justify-center whitespace-nowrap tabular-nums">
            Page {safePage} / {totalPages}
          </div>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => handleStep(safePage + 1)}
            className="min-h-10 px-3 rounded-lg bg-[#144827] hover:bg-[#1B5E34] text-white text-xs font-bold disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-1 transition-colors shadow-2xs"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
