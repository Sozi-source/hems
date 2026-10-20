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
  variant = 'neutral',
  tone,
  subtitle,
}: MetricCardProps) {
  // Default tone mapping from variant if tone is not explicitly passed
  const resolvedTone: MetricCardTone =
    tone ??
    (variant === 'positive'
      ? 'safaricom'
      : variant === 'amber'
      ? 'amber'
      : variant === 'negative'
      ? 'cream'
      : 'gray');

  const surfaceStyles: Record<MetricCardTone, string> = {
    safaricom:
      'bg-[#144827] border-[#216B3B] text-white shadow-[0_8px_20px_-6px_rgb(20_72_39/0.35)]',
    cream:
      'bg-[#F3EDE0] border-[#DFD2B6] text-[#1F241D] shadow-[0_2px_10px_-2px_rgb(74_59_28/0.07)]',
    gray:
      'bg-[#E7ECE9] border-[#CBD6CF] text-[#17231C] shadow-[0_2px_10px_-2px_rgb(23_35_28/0.05)]',
    charcoal:
      'bg-[#1E2923] border-[#314238] text-white shadow-[0_8px_20px_-6px_rgb(18_28_22/0.28)]',
    amber:
      'bg-[#FDF2D0] border-[#E6C775] text-[#4E3200] shadow-[0_2px_10px_-2px_rgb(117_73_0/0.08)]',
    white: 'bg-white border-[#DCE5DF] text-[#14231A] shadow-sm',
  };

  const titleStyles: Record<MetricCardTone, string> = {
    safaricom: 'text-[#B8E8C4]',
    cream: 'text-[#5A4D35]',
    gray: 'text-[#425449]',
    charcoal: 'text-[#A8BEB1]',
    amber: 'text-[#6E4700]',
    white: 'text-slate-600',
  };

  const subtitleStyles: Record<MetricCardTone, string> = {
    safaricom: 'text-[#8DDBA0]/90',
    cream: 'text-[#6E5F43]',
    gray: 'text-[#526559]',
    charcoal: 'text-[#8FA899]',
    amber: 'text-[#7A4F02]',
    white: 'text-slate-500',
  };

  const iconBgStyles: Record<MetricCardTone, string> = {
    safaricom: 'bg-[#1E6337] text-[#8DDBA0] border-[#2E824C]',
    cream: 'bg-[#E6DCC6] text-[#4A3B1C] border-[#D3C4A3]',
    gray: 'bg-[#D7E0DB] text-[#26382E] border-[#BFCBC4]',
    charcoal: 'bg-[#2B3B32] text-[#8DDBA0] border-[#3D5246]',
    amber: 'bg-[#F6E1A4] text-[#6E4700] border-[#DFC06A]',
    white: 'bg-[#F1F5F2] text-[#405247] border-[#DCE5DF]',
  };

  const moneyVariant =
    resolvedTone === 'safaricom' || resolvedTone === 'charcoal'
      ? 'inverse'
      : variant;

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-150 p-3.5 sm:p-5 [container-type:inline-size]',
        surfaceStyles[resolvedTone]
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-2.5">
        <span
          className={cn(
            'text-[11px] sm:text-xs font-bold uppercase tracking-[0.04em] leading-snug',
            titleStyles[resolvedTone]
          )}
        >
          {title}
        </span>
        <div
          className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border shrink-0',
            iconBgStyles[resolvedTone]
          )}
        >
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>

      <div className="min-w-0">
        <MoneyDisplay
          minorUnits={minorUnits}
          size="lg"
          className="text-[clamp(14px,4.5cqi,22px)] sm:text-[clamp(16px,1.35vw,22px)]"
          variant={moneyVariant}
        />
      </div>

      {subtitle && (
        <p
          className={cn(
            'mt-1.5 text-[10px] sm:text-[11px] font-medium truncate',
            subtitleStyles[resolvedTone]
          )}
        >
          {subtitle}
        </p>
      )}
    </Card>
  );
}

