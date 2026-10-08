import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-fintech transition-all select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20';

    const variantStyles = {
      primary:
        'bg-[#0F172A] text-white hover:bg-slate-800 border border-slate-900 shadow-sm',
      secondary:
        'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 shadow-sm',
      outline:
        'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm',
      ghost:
        'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100',
      danger:
        'bg-[#881337] text-white hover:bg-[#70102D] border border-[#70102D] shadow-sm',
      success:
        'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700 shadow-sm',
    };

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
      md: 'text-sm px-3.5 py-2 gap-2 h-9',
      lg: 'text-base px-4 py-2.5 gap-2.5 h-11',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
