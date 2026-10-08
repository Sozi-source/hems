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
      'inline-flex items-center justify-center font-medium rounded-fintech transition-all select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50';

    const variantStyles = {
      primary:
        'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30 border border-indigo-500/30',
      secondary:
        'bg-white/10 text-slate-100 hover:bg-white/15 border border-white/10 shadow-sm',
      outline:
        'bg-transparent text-slate-200 hover:bg-white/5 border border-white/15 hover:border-white/25',
      ghost:
        'bg-transparent text-slate-300 hover:text-white hover:bg-white/5',
      danger:
        'bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-500/30 shadow-sm shadow-rose-600/20',
      success:
        'bg-emerald-600/90 text-white hover:bg-emerald-500 border border-emerald-500/30 shadow-sm shadow-emerald-600/20',
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
