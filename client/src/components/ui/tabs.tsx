'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

export function Tabs({ value, onValueChange, children, className = '' }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; className?: string; }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }: { children: React.ReactNode; className?: string; }) {
  return <div className={cn('inline-flex min-w-0 gap-1 rounded-full border border-stroke-default bg-bg-panel-secondary/80 p-1', className)}>{children}</div>;
}

export function TabsTrigger({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string; }) {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      onClick={() => onValueChange(value)}
      data-state={isActive ? 'active' : 'inactive'}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition',
        isActive ? 'bg-surface text-text-primary shadow-[var(--shadow-card)]' : 'text-text-secondary hover:text-text-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string; }) {
  const { value: activeValue } = useTabsContext();
  if (value !== activeValue) return null;
  return <div className={className}>{children}</div>;
}
