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
      'inline-flex items-center justify-center font-semibold rounded-fintech transition-colors select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700 min-h-[40px] active:translate-y-px';

    const variantStyles = {
      primary:
        'bg-[#1F7A3D] text-white hover:bg-[#176330] border border-[#1F7A3D] shadow-sm',
      secondary:
        'bg-[#E8F5EB] text-[#185D2D] hover:bg-[#D8EEDD] border border-[#D1E8D7]',
      outline:
        'bg-white text-slate-700 hover:bg-slate-50 border border-[#CBD8CE]',
      ghost:
        'bg-transparent text-slate-600 hover:text-[#174E2A] hover:bg-[#F1F5F2]',
      danger:
        'bg-[#B42332] text-white hover:bg-[#941D2A] border border-[#B42332] shadow-sm',
      success:
        'bg-[#1F7A3D] text-white hover:bg-[#176330] border border-[#176330] shadow-sm',
    };

    const sizeStyles = {
      sm: 'text-xs px-3 py-2 gap-1.5 min-h-[40px]',
      md: 'text-sm px-4 py-2.5 gap-2 min-h-[44px]',
      lg: 'text-sm px-5 py-3 gap-2.5 min-h-[48px]',
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
