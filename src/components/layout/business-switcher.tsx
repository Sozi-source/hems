'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { BusinessCode } from '@/lib/types';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BusinessSwitcherProps {
  variant?: 'sidebar' | 'header';
}

export function BusinessSwitcher({ variant = 'sidebar' }: BusinessSwitcherProps) {
  const { activeBusinessCode, setBusiness, businesses } = useBusiness();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isHeader = variant === 'header';

  const getBusinessInfo = (code: BusinessCode) => {
    switch (code) {
      case 'HARON_FASHION':
        return {
          name: 'Haron Fashion',
          badge: 'HF',
          badgeBg: isHeader
            ? 'bg-[#123520] text-white border-[#123520]'
            : 'bg-white/15 text-white border-white/20',
        };
      case 'ZENITH_PLAST':
        return {
          name: 'Zenith Plast',
          badge: 'ZP',
          badgeBg: isHeader
            ? 'bg-slate-800 text-white border-slate-800'
            : 'bg-white/15 text-white border-white/20',
        };
      case 'MASTER':
      default:
        return {
          name: 'All Businesses',
          badge: 'ALL',
          badgeBg: isHeader
            ? 'bg-slate-700 text-white border-slate-700'
            : 'bg-white/15 text-white border-white/20',
        };
    }
  };

  const currentInfo = getBusinessInfo(activeBusinessCode);

  return (
    <div className="relative w-full max-w-[210px]" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border transition-colors text-left group',
          isHeader
            ? 'h-9 px-2.5 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900'
            : 'p-2.5 rounded-fintech bg-white/10 hover:bg-white/15 border-white/15 text-slate-100'
        )}
        aria-label="Select business"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={cn(
              'rounded flex items-center justify-center font-bold border shrink-0',
              isHeader ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-[11px]',
              currentInfo.badgeBg
            )}
          >
            {currentInfo.badge}
          </div>
          <span
            className={cn(
              'font-semibold truncate leading-tight text-xs',
              isHeader ? 'text-slate-900' : 'text-slate-100'
            )}
          >
            {currentInfo.name}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 transition-transform shrink-0',
            isHeader ? 'text-slate-400' : 'text-slate-400',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1.5 min-w-[230px] w-full rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 border',
            isHeader
              ? 'bg-white border-[#CBD6CF] text-[#14231A]'
              : 'bg-[#173622] border-[#365541] text-slate-100'
          )}
        >
          <div className="space-y-1">
            {/* All Businesses Option */}
            <button
              type="button"
              onClick={() => {
                setBusiness('MASTER');
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left text-xs',
                isHeader
                  ? activeBusinessCode === 'MASTER'
                    ? 'bg-[#F3EDE0] text-[#14231A] font-bold border border-[#DFD2B6]'
                    : 'hover:bg-[#F1F5F2] text-slate-700 font-medium'
                  : activeBusinessCode === 'MASTER'
                  ? 'bg-purple-900/30 text-purple-200 border border-purple-700/40'
                  : 'hover:bg-slate-800 text-slate-300'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border shrink-0',
                    isHeader
                      ? 'bg-[#4A3B1C] text-[#F3EDE0] border-[#6E5F43]'
                      : 'bg-purple-900/40 text-purple-300 border-purple-700/50'
                  )}
                >
                  ALL
                </div>
                <div className="truncate">All Businesses</div>
              </div>
              {activeBusinessCode === 'MASTER' && (
                <Check
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    isHeader ? 'text-[#144827]' : 'text-purple-400'
                  )}
                />
              )}
            </button>

            {/* Individual Businesses */}
            {businesses.map((b) => {
              const info = getBusinessInfo(b.code as BusinessCode);
              const isSelected = activeBusinessCode === b.code;

              return (
                <button
                  type="button"
                  key={b.code}
                  onClick={() => {
                    setBusiness(b.code as BusinessCode);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left text-xs',
                    isHeader
                      ? isSelected
                        ? 'bg-[#E8F5EB] text-[#144827] font-bold border border-[#BBDCC4]'
                        : 'hover:bg-[#F1F5F2] text-slate-700 font-medium'
                      : isSelected
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border shrink-0',
                        info.badgeBg
                      )}
                    >
                      {info.badge}
                    </div>
                    <div className="truncate">{b.name}</div>
                  </div>
                  {isSelected && (
                    <Check
                      className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        isHeader ? 'text-[#144827]' : 'text-emerald-400'
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

