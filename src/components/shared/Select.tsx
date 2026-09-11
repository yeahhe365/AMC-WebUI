import React, { useMemo, useRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useListboxNavigation } from '@/hooks/ui/useListboxNavigation';

export const SelectRoot = SelectPrimitive.Root;
export const SelectTrigger = SelectPrimitive.Trigger;
export const SelectValue = SelectPrimitive.Value;
export const SelectIcon = SelectPrimitive.Icon;
export const SelectPortal = SelectPrimitive.Portal;
export const SelectContent = SelectPrimitive.Content;
export const SelectViewport = SelectPrimitive.Viewport;
export const SelectItem = SelectPrimitive.Item;
export const SelectItemText = SelectPrimitive.ItemText;
export const SelectItemIndicator = SelectPrimitive.ItemIndicator;
export const SelectGroup = SelectPrimitive.Group;
export const SelectLabel = SelectPrimitive.Label;
export const SelectSeparator = SelectPrimitive.Separator;

export interface SelectProps {
  id?: string;
  label: string;
  children: React.ReactNode;
  labelContent?: React.ReactNode;
  value?: string | number;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  layout?: 'vertical' | 'horizontal';
  hideLabel?: boolean;
  wrapperClassName?: string;
  dropdownClassName?: string;
  direction?: 'up' | 'down';
  /** default = form control; compact = chat-input toolbar height (h-9, text-xs). */
  size?: 'default' | 'compact';
  /** Optional class override for the trigger button (appended after size styles). */
  triggerClassName?: string;
}

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled: boolean | undefined;
};

export const Select: React.FC<SelectProps> = ({
  id,
  label,
  children,
  labelContent,
  value,
  onChange,
  disabled,
  className,
  layout = 'vertical',
  hideLabel = false,
  wrapperClassName,
  dropdownClassName,
  direction = 'down',
  size = 'default',
  triggerClassName,
}) => {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const options = useMemo<SelectOption[]>(() => {
    return React.Children.toArray(children).flatMap((child) => {
      if (React.isValidElement(child) && child.type === 'option') {
        const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        return [
          {
            value: String(props.value),
            label: props.children,
            disabled: props.disabled,
          },
        ];
      }
      return [];
    });
  }, [children]);

  const selectedOption = options.find((option) => String(option.value) === String(value));
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));

  const findEnabledIndex = (startIndex: number, directionStep = 1) => {
    if (options.length === 0) return -1;

    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (startIndex + offset * directionStep + options.length) % options.length;
      if (!options[index].disabled) {
        return index;
      }
    }

    return -1;
  };

  const getInitialActiveIndex = () => {
    if (selectedIndex >= 0 && !options[selectedIndex].disabled) {
      return selectedIndex;
    }

    return findEnabledIndex(0);
  };

  const handleSelect = (selectedValue: string) => {
    onChange({ target: { value: selectedValue } });
    navigation.close();
  };

  const navigation = useListboxNavigation({
    getInitialActiveIndex,
    getRelativeActiveIndex: (currentIndex, directionStep) => {
      const baseIndex = currentIndex >= 0 ? currentIndex : getInitialActiveIndex();
      return findEnabledIndex(baseIndex + directionStep, directionStep);
    },
    getFirstActiveIndex: () => findEnabledIndex(0),
    getLastActiveIndex: () => findEnabledIndex(options.length - 1, -1),
    onSelectActiveIndex: (index) => {
      const option = options[index];
      if (option && !option.disabled) {
        handleSelect(option.value);
      }
    },
  });

  const { isOpen, activeIndex } = navigation;

  const containerClasses =
    layout === 'horizontal' ? `flex items-center justify-between py-1 ${className || ''}` : className;

  const labelClasses =
    layout === 'horizontal'
      ? 'text-sm font-medium text-[var(--theme-text-primary)] mr-4 flex-shrink-0'
      : 'block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5';
  const defaultWrapperClasses = layout === 'horizontal' ? 'relative w-full sm:w-64' : 'relative';

  const finalWrapperClasses = wrapperClassName || defaultWrapperClasses;

  return (
    <div className={containerClasses}>
      {!hideLabel && (
        <label htmlFor={id} className={labelClasses}>
          {labelContent || label}
        </label>
      )}
      {hideLabel && label && (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      )}
      <div className={finalWrapperClasses} ref={wrapperRef}>
        <SelectPrimitive.Root
          value={value !== undefined ? String(value) : undefined}
          onValueChange={handleSelect}
          open={isOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              navigation.open();
            } else {
              navigation.close();
            }
          }}
          disabled={disabled}
        >
          <SelectPrimitive.Trigger
            id={id}
            aria-label={label}
            aria-haspopup="listbox"
            disabled={disabled}
            onKeyDown={(event) => {
              if (disabled) return;
              navigation.handleKeyDown(event);
            }}
            className={
              size === 'compact'
                ? `w-full h-9 px-2.5 py-0 text-left border rounded-lg flex items-center justify-between transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] ${disabled ? 'opacity-60 cursor-not-allowed bg-[var(--theme-bg-secondary)]' : 'cursor-pointer bg-[var(--theme-bg-input)] hover:border-[var(--theme-border-focus)]'} border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] text-xs font-medium ${triggerClassName || ''}`
                : `w-full p-2.5 text-left border rounded-lg flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] ${disabled ? 'opacity-60 cursor-not-allowed bg-[var(--theme-bg-secondary)]' : 'cursor-pointer bg-[var(--theme-bg-input)] hover:border-[var(--theme-border-focus)]'} border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] text-sm ${triggerClassName || ''}`
            }
          >
            <div className="truncate mr-2 flex-grow text-left">
              {selectedOption ? (
                selectedOption.label
              ) : (
                <span className="text-[var(--theme-text-tertiary)]">{t('selectPlaceholder')}</span>
              )}
            </div>
            <SelectPrimitive.Icon asChild>
              <ChevronDown
                size={16}
                className={`text-[var(--theme-text-tertiary)] transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                strokeWidth={1.5}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Content
            position="popper"
            side={direction === 'up' ? 'top' : 'bottom'}
            sideOffset={4}
            className={`z-50 w-[var(--radix-select-trigger-width)] bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-premium overflow-hidden flex flex-col ${dropdownClassName || 'max-h-[300px]'}`}
          >
            <SelectPrimitive.Viewport className="overflow-y-auto custom-scrollbar p-1">
              {options.map((option, optionIndex) => {
                const isSelected = String(option.value) === String(value);
                const isActive = activeIndex === optionIndex;

                return (
                  <SelectPrimitive.Item
                    key={`${option.value}-${optionIndex}`}
                    value={option.value}
                    disabled={option.disabled}
                    aria-selected={isSelected}
                    data-highlighted={isActive ? '' : undefined}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between transition-colors outline-none select-none ${
                      isSelected
                        ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-medium'
                        : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]/50 hover:text-[var(--theme-text-primary)]'
                    } ${isActive && !isSelected ? 'bg-[var(--theme-bg-tertiary)]/50 text-[var(--theme-text-primary)]' : ''} ${
                      option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <SelectPrimitive.ItemText asChild>
                      <span className="truncate w-full block">{option.label}</span>
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={14} className="text-[var(--theme-text-link)] flex-shrink-0 ml-2" strokeWidth={1.5} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Root>
      </div>
    </div>
  );
};
