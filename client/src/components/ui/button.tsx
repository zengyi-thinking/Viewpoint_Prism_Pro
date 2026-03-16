'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'accent';
  size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'border border-stroke-default bg-surface text-text-primary hover:border-stroke-strong hover:bg-bg-panel-secondary',
      outline: 'border border-stroke-default bg-transparent text-text-primary hover:border-stroke-strong hover:bg-bg-panel-secondary/70',
      ghost: 'border border-transparent bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-panel-secondary/70',
      accent: 'border border-transparent bg-[linear-gradient(135deg,var(--accent-strong),var(--accent-primary))] text-white shadow-[0_18px_40px_rgba(255,77,141,0.18)] hover:opacity-95',
    };

    const sizeClasses = {
      default: 'h-10 px-4 text-sm',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-12 px-5 text-sm',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-[var(--transition-fast)] disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
