'use client';

import * as React from 'react';

export interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

export interface SelectContentProps {
  children: React.ReactNode;
}

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

export interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
}

export interface SelectValueProps {
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({ children, value, onValueChange }) => {
  // Extract options from children using a simpler approach
  const [options, setOptions] = React.useState<Array<{ value: string; label: string }>>([]);
  const [placeholder, setPlaceholder] = React.useState<string>('');

  React.useEffect(() => {
    const extractedOptions: Array<{ value: string; label: string }> = [];
    let extractedPlaceholder = '';

    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        if (child.type === SelectTrigger) {
          React.Children.forEach((child.props as any).children, (grandChild: React.ReactElement) => {
            if (React.isValidElement(grandChild) && grandChild.type === SelectValue) {
              extractedPlaceholder = (grandChild.props as any).placeholder || '';
            }
          });
        } else if (child.type === SelectContent) {
          React.Children.forEach((child.props as any).children, (grandChild: React.ReactElement) => {
            if (React.isValidElement(grandChild) && grandChild.type === SelectItem) {
              extractedOptions.push({
                value: (grandChild.props as any).value,
                label: String((grandChild.props as any).children),
              });
            }
          });
        }
      }
    });

    setOptions(extractedOptions);
    setPlaceholder(extractedPlaceholder);
  }, [children]);

  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const SelectContent: React.FC<SelectContentProps> = () => null;

export const SelectItem: React.FC<SelectItemProps> = () => null;

export const SelectTrigger: React.FC<SelectTriggerProps> = () => null;

export const SelectValue: React.FC<SelectValueProps> = () => null;
