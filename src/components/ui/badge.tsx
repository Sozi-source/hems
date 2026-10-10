import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  children,
  className,
  variant = 'neutral',
  size = 'md',
  dot = false,
  ...props
}: BadgeProps) {
  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-[#E8F5EB] text-[#185D2D] border-[#BBDCC4]',
    warning: 'bg-[#FFF4D8] text-[#754900] border-[#F0D99B]',
    danger: 'bg-[#FDECEE] text-[#8F1D2A] border-[#F4C5CB]',
    info: 'bg-[#EDF3F7] text-[#29465A] border-[#D1DFE8]',
    purple: 'bg-[#F1EDFC] text-[#533C8C] border-[#DDD3F5]',
  };

  const dotColors = {
    neutral: 'bg-slate-500',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    danger: 'bg-rose-600',
    info: 'bg-slate-700',
    purple: 'bg-purple-600',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-1 font-semibold',
    md: 'text-xs px-2.5 py-1 font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center border rounded-full transition-colors whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full mr-1.5 shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
