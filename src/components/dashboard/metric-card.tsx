import React from 'react';
import { Card } from '@/components/ui/card';
import { MoneyDisplay } from '@/components/ui/money-display';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  title: string;
  minorUnits: number | bigint;
  icon: LucideIcon;
  variant?: 'neutral' | 'positive' | 'negative' | 'amber';
}

export function MetricCard({
  title,
  minorUnits,
  icon: Icon,
  variant = 'neutral',
}: MetricCardProps) {
  const iconBgStyles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    negative: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <Card className="relative bg-white border-slate-200/90 shadow-sm p-3 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-1.5 sm:mb-2">
        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight">
          {title}
        </span>
        <div
          className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border shrink-0',
            iconBgStyles[variant]
          )}
        >
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>

      <div>
        <MoneyDisplay minorUnits={minorUnits} size="lg" className="text-base sm:text-xl" variant={variant} />
      </div>
    </Card>
  );
}
