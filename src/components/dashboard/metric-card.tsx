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
    neutral: 'bg-white/5 text-slate-300 border-white/10',
    positive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    negative: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <Card className="relative">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
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
