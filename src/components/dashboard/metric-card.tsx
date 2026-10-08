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
    <Card className="relative bg-white border-slate-200/90 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {title}
        </span>
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center border shrink-0',
            iconBgStyles[variant]
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div>
        <MoneyDisplay minorUnits={minorUnits} size="xl" variant={variant} />
      </div>
    </Card>
  );
}
