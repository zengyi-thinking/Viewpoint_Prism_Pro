import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function SurfaceCard({ className, children, tone = 'default' }: { className?: string; children: ReactNode; tone?: 'default' | 'muted' | 'accent'; }) {
  return (
    <div
      className={cn(
        'surface-card refracted-shell',
        tone === 'muted' && 'bg-bg-panel-secondary/80',
        tone === 'accent' && 'border-[color:var(--accent-primary)]/30 bg-[color:var(--accent-soft)]/50',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description, align = 'left', className }: { eyebrow?: string; title: string; description?: string; align?: 'left' | 'center'; className?: string; }) {
  return (
    <div className={cn(align === 'center' ? 'text-center' : '', className)}>
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">{eyebrow}</p> : null}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary md:text-5xl">{title}</h2>
      {description ? <p className="mt-4 max-w-2xl text-sm leading-7 text-text-secondary md:text-base">{description}</p> : null}
    </div>
  );
}

export function MetricChip({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string; }) {
  return (
    <div className={cn('rounded-[20px] border border-stroke-default bg-bg-panel-secondary/70 px-4 py-4', className)}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <div className="mt-3 text-3xl font-semibold text-text-primary">{value}</div>
      {hint ? <p className="mt-2 text-xs leading-5 text-text-secondary">{hint}</p> : null}
    </div>
  );
}

export function StatusPill({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'error' | 'info'; className?: string; }) {
  const toneClass = {
    default: 'border-stroke-default bg-bg-panel-secondary/70 text-text-secondary',
    success: 'border-[color:var(--signal-success)]/20 bg-[color:var(--signal-success)]/10 text-[color:var(--signal-success)]',
    warning: 'border-[color:var(--signal-warning)]/20 bg-[color:var(--signal-warning)]/10 text-[color:var(--signal-warning)]',
    error: 'border-[color:var(--signal-error)]/20 bg-[color:var(--signal-error)]/10 text-[color:var(--signal-error)]',
    info: 'border-[color:var(--signal-info)]/20 bg-[color:var(--signal-info)]/10 text-[color:var(--signal-info)]',
  }[tone];

  return <span className={cn('status-pill', toneClass, className)}>{children}</span>;
}

export function ModeSwitch({ value, onChange, options, className }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; className?: string; }) {
  return (
    <div className={cn('inline-flex rounded-full border border-stroke-default bg-bg-panel-secondary/80 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              active ? 'bg-[linear-gradient(135deg,var(--accent-strong),var(--accent-primary))] text-white' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description: string; action?: ReactNode; className?: string; }) {
  return (
    <SurfaceCard className={cn('flex flex-col items-center justify-center px-8 py-14 text-center', className)} tone="muted">
      {icon ? <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-stroke-default bg-bg-panel-secondary/80 text-text-secondary">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </SurfaceCard>
  );
}

export function PageHero({ eyebrow, title, description, actions, meta, visual, className }: { eyebrow?: string; title: ReactNode; description: ReactNode; actions?: ReactNode; meta?: ReactNode; visual?: ReactNode; className?: string; }) {
  return (
    <section className={cn('page-section', className)}>
      <div className="page-width hero-grid items-center">
        <div>
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-text-muted">{eyebrow}</p> : null}
          <div className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-text-primary md:text-7xl">{title}</div>
          <div className="mt-6 max-w-2xl text-base leading-8 text-text-secondary md:text-lg">{description}</div>
          {actions ? <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div> : null}
          {meta ? <div className="mt-8">{meta}</div> : null}
        </div>
        {visual ? <div className="relative">{visual}</div> : null}
      </div>
    </section>
  );
}
