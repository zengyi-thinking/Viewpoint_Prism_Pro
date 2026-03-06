'use client';

import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'accent';
  size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-[var(--transition-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)] disabled:pointer-events-none disabled:opacity-50';

    const variantClasses = {
      default: 'bg-[var(--bg-panel-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-panel-tertiary)] hover:border-[var(--border)] active:scale-[0.98] shadow-[var(--shadow-xs)]',
      outline: 'border border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-panel-secondary)] hover:border-[var(--accent-primary)] active:scale-[0.98]',
      ghost: 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-panel-secondary)] active:bg-[var(--bg-panel-tertiary)]',
      accent: 'bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)] active:scale-[0.98] shadow-[var(--shadow-sm)]',
    };

    const sizeClasses = {
      default: 'h-9 px-3 py-1.5 text-[13px]',
      sm: 'h-7 px-2.5 py-1 text-[12px]',
      lg: 'h-11 px-5 py-2.5 text-[14px]',
    };

    return (
      <button
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
