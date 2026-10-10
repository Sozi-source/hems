import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          ref={ref}
          className={cn(
            'flex h-11 w-full rounded-fintech border border-[#C9D7CD] bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1F7A3D]/20 focus:border-[#1F7A3D] transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
            error && 'border-[#B42332] focus:border-[#B42332] focus:ring-[#B42332]/10',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-slate-600">{hint}</p>}
        {error && <p className="text-xs text-[#A21D2B] font-semibold">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
