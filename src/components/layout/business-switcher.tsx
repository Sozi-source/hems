'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useBusiness } from '@/context/business-context';
import { BusinessCode } from '@/lib/types';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BusinessSwitcher() {
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

  const getBusinessInfo = (code: BusinessCode) => {
    switch (code) {
      case 'HARON_FASHION':
        return {
          name: 'Haron Fashion',
          badge: 'HF',
          badgeBg: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
        };
      case 'ZENITH_PLAST':
        return {
          name: 'Zenith Plast',
          badge: 'ZP',
          badgeBg: 'bg-sky-900/40 text-sky-300 border-sky-700/50',
        };
      case 'MASTER':
      default:
        return {
          name: 'All Businesses',
          badge: 'ALL',
          badgeBg: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
        };
    }
  };

  const currentInfo = getBusinessInfo(activeBusinessCode);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 rounded-fintech bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 transition-colors text-left group"
        aria-label="Select business"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center font-bold text-[11px] border shrink-0',
              currentInfo.badgeBg
            )}
          >
            {currentInfo.badge}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-100 truncate">
              {currentInfo.name}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 transition-transform shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full bg-[#0F172A] border border-slate-700 rounded-card shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="space-y-1">
            {/* All Businesses Option */}
            <button
              onClick={() => {
                setBusiness('MASTER');
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between p-2 rounded-fintech transition-colors text-left text-xs',
                activeBusinessCode === 'MASTER'
                  ? 'bg-purple-900/30 text-purple-200 border border-purple-700/40'
                  : 'hover:bg-slate-800 text-slate-300'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50 flex items-center justify-center text-[10px] font-bold">
                  ★
                </div>
                <div className="font-semibold text-slate-100">All Businesses</div>
              </div>
              {activeBusinessCode === 'MASTER' && (
                <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              )}
            </button>

            {/* Individual Businesses */}
            {businesses.map((b) => {
              const info = getBusinessInfo(b.code as BusinessCode);
              const isSelected = activeBusinessCode === b.code;

              return (
                <button
                  key={b.code}
                  onClick={() => {
                    setBusiness(b.code as BusinessCode);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between p-2 rounded-fintech transition-colors text-left text-xs',
                    isSelected
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        'w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold border',
                        info.badgeBg
                      )}
                    >
                      {info.badge}
                    </div>
                    <div className="font-medium text-slate-200 truncate">{b.name}</div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
