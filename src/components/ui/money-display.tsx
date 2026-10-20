import React from 'react';
import { cn } from '@/lib/utils';
import { fmt_kes } from '@/lib/format';

export interface MoneyDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  minorUnits: bigint | number | null | undefined;
  variant?: 'neutral' | 'positive' | 'negative' | 'amber' | 'inverse' | 'mint';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCents?: boolean;
}

export function MoneyDisplay({
  minorUnits,
  variant = 'neutral',
  size = 'md',
  showCents = true,
  className,
  ...props
}: MoneyDisplayProps) {
  const formatted = fmt_kes(minorUnits, { showCents });

  const match = formatted.match(/^([+-]?KSh\s+)?([0-9,]+)(\.[0-9]{2})?$/);

  const symbol = match?.[1] ?? 'KSh ';
  const integer = match?.[2] ?? '0';
  const decimal = match?.[3] ?? '.00';

  const sizeStyles = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-bold',
    lg: 'text-lg sm:text-xl font-bold',
    xl: 'text-xl sm:text-2xl font-bold tracking-tight',
    '2xl': 'text-2xl sm:text-3xl font-extrabold tracking-tight',
  };

  const decimalSizes = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-xs sm:text-sm font-medium',
    xl: 'text-sm sm:text-base font-medium',
    '2xl': 'text-base sm:text-lg font-medium',
  };

  const variantStyles = {
    neutral: 'text-[#17291D]',
    positive: 'text-[#1F7A3D]',
    negative: 'text-[#B42332]',
    amber: 'text-[#7A4B00]',
    inverse: 'text-white',
    mint: 'text-[#8DDBA0]',
  };

  const isLightOnDark = variant === 'inverse' || variant === 'mint';

  return (
    <span
      className={cn(
        'font-mono tabular-nums tracking-tight inline-flex items-baseline whitespace-nowrap select-all',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'font-sans mr-1 text-[11px] sm:text-xs font-semibold',
          isLightOnDark ? 'text-[#9FE3B0]' : 'text-slate-500'
        )}
      >
        {symbol.trim()}
      </span>
      <span>{integer}</span>
      {showCents && (
        <span
          className={cn(
            'font-mono',
            isLightOnDark ? 'text-white/75' : 'text-slate-600 opacity-90',
            decimalSizes[size]
          )}
        >
          {decimal}
        </span>
      )}
    </span>
  );
}
