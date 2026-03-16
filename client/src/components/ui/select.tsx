'use client';

import * as React from 'react';

export interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

export interface SelectContentProps { children: React.ReactNode; }
export interface SelectItemProps { value: string; children: React.ReactNode; }
export interface SelectTriggerProps { children: React.ReactNode; className?: string; }
export interface SelectValueProps { placeholder?: string; }

type SelectLikeProps = {
  children?: React.ReactNode;
  placeholder?: string;
  value?: string;
};

export const Select: React.FC<SelectProps> = ({ children, value, onValueChange }) => {
  const [options, setOptions] = React.useState<Array<{ value: string; label: string }>>([]);
  const [placeholder, setPlaceholder] = React.useState('');

  React.useEffect(() => {
    const extractedOptions: Array<{ value: string; label: string }> = [];
    let extractedPlaceholder = '';

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const childProps = child.props as SelectLikeProps;
      if (child.type === SelectTrigger) {
        React.Children.forEach(childProps.children, (grandChild) => {
          if (React.isValidElement(grandChild) && grandChild.type === SelectValue) {
            extractedPlaceholder = ((grandChild.props as SelectLikeProps).placeholder || '');
          }
        });
      }
      if (child.type === SelectContent) {
        React.Children.forEach(childProps.children, (grandChild) => {
          if (React.isValidElement(grandChild) && grandChild.type === SelectItem) {
            const itemProps = grandChild.props as SelectLikeProps;
            extractedOptions.push({
              value: itemProps.value || '',
              label: String(itemProps.children),
            });
          }
        });
      }
    });

    setOptions(extractedOptions);
    setPlaceholder(extractedPlaceholder);
  }, [children]);

  return (
    <select
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      className="input cursor-pointer appearance-none bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-surface-alt)_92%,transparent),color-mix(in_srgb,var(--bg-surface)_100%,transparent))]"
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export const SelectContent: React.FC<SelectContentProps> = () => null;
export const SelectItem: React.FC<SelectItemProps> = () => null;
export const SelectTrigger: React.FC<SelectTriggerProps> = () => null;
export const SelectValue: React.FC<SelectValueProps> = () => null;
