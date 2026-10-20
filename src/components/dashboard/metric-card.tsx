import React from 'react';
import { Card } from '@/components/ui/card';
import { MoneyDisplay } from '@/components/ui/money-display';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricCardTone =
  | 'safaricom'
  | 'cream'
  | 'gray'
  | 'charcoal'
  | 'amber'
  | 'white';

export interface MetricCardProps {
  title: string;
  minorUnits: number | bigint;
  icon: LucideIcon;
  variant?: 'neutral' | 'positive' | 'negative' | 'amber';
  tone?: MetricCardTone;
  subtitle?: string;
}

export function MetricCard({
  title,
  minorUnits,
  icon: Icon,
  tone = 'white',
  subtitle,
}: MetricCardProps) {
  const isHero = tone === 'safaricom' || tone === 'charcoal';
  const isWarm = tone === 'cream';

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-150 p-3.5 sm:p-5 [container-type:inline-size]',
        isHero
          ? 'bg-[#123520] border-[#1E4D30] text-white shadow-xs'
          : isWarm
          ? 'bg-[#F7F5EE] border-[#E5E0D3] text-[#0F172A] shadow-2xs'
          : 'bg-white border-[#E2E8E4] text-[#0F172A] shadow-2xs'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-[0.04em] leading-snug',
            isHero ? 'text-[#A7C4B2]' : 'text-slate-500'
          )}
        >
          {title}
        </span>
        <div
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center border shrink-0',
            isHero
              ? 'bg-white/10 text-[#8DDBA0] border-white/10'
              : 'bg-slate-100/80 text-slate-600 border-slate-200/80'
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="min-w-0">
        <MoneyDisplay
          minorUnits={minorUnits}
          size="lg"
          className="text-[clamp(14px,4.5cqi,22px)] sm:text-[clamp(16px,1.35vw,22px)]"
          variant={isHero ? 'inverse' : 'neutral'}
        />
      </div>

      {subtitle && (
        <p
          className={cn(
            'mt-1 text-[11px] font-normal truncate',
            isHero ? 'text-[#A7C4B2]' : 'text-slate-500'
          )}
        >
          {subtitle}
        </p>
      )}
    </Card>
  );
}

