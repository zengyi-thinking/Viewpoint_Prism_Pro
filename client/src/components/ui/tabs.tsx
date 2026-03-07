'use client';

import * as React from 'react';

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) {
    throw new Error('Tabs components must be used within <Tabs>');
  }
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className = '' }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={`tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <div className={`tabs-list flex min-w-0 gap-0.5 rounded-lg border border-border-subtle bg-bg-panel-secondary p-0.5 ${className}`}>
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className = '' }: TabsTriggerProps) {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      data-state={isActive ? 'active' : 'inactive'}
      onClick={() => onValueChange(value)}
      className={`tabs-trigger inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-all duration-[var(--transition-base)] ${
        isActive
          ? 'bg-bg-panel text-text-primary shadow-[var(--shadow-xs)] border border-border'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-panel-tertiary/50'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  const { value: activeValue } = useTabsContext();
  if (value !== activeValue) return null;
  return <div className={`tabs-content ${className}`}>{children}</div>;
}
