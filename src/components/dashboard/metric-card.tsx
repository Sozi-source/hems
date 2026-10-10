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
    neutral: 'bg-[#F1F5F2] text-[#405247] border-[#DCE5DF]',
    positive: 'bg-[#E8F5EB] text-[#1F7A3D] border-[#BBDCC4]',
    negative: 'bg-[#FDECEE] text-[#A21D2B] border-[#F4C5CB]',
    amber: 'bg-[#FFF4D8] text-[#754900] border-[#F0D99B]',
  };

  return (
    <Card className="relative bg-white border-[#DCE5DF] shadow-sm p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-1.5 sm:mb-2">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-600 tracking-wide leading-snug">
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
        <MoneyDisplay minorUnits={minorUnits} size="lg" className="text-[clamp(13px,1.15vw,20px)]" variant={variant} />
      </div>
    </Card>
  );
}
