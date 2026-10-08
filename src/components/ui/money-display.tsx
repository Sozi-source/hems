import React from 'react';
import { cn } from '@/lib/utils';
import { fmt_kes } from '@/lib/format';

export interface MoneyDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  minorUnits: bigint | number | null | undefined;
  variant?: 'neutral' | 'positive' | 'negative' | 'amber';
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
    lg: 'text-xl font-bold',
    xl: 'text-2xl font-bold tracking-tight',
    '2xl': 'text-3xl font-extrabold tracking-tight',
  };

  const decimalSizes = {
    sm: 'text-xs',
    md: 'text-xs',
    lg: 'text-sm font-medium',
    xl: 'text-base font-medium',
    '2xl': 'text-lg font-medium',
  };

  const variantStyles = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-700',
    negative: 'text-rose-700',
    amber: 'text-amber-800',
  };

  return (
    <span
      className={cn(
        'font-mono tabular-nums tracking-tight inline-flex items-baseline select-all',
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
      {...props}
    >
      <span className="text-slate-500 font-sans mr-1 text-xs font-normal">{symbol.trim()}</span>
      <span>{integer}</span>
      {showCents && (
        <span className={cn('text-slate-500 font-mono opacity-80', decimalSizes[size])}>
          {decimal}
        </span>
      )}
    </span>
  );
}
