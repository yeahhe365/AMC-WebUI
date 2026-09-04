import React, { useMemo, useId, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useI18n } from '@/contexts/I18nContext';
import { useListboxNavigation } from '@/hooks/ui/useListboxNavigation';

interface SelectProps {
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
  const listboxId = useId();
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

  useClickOutside(wrapperRef, () => navigation.close(), isOpen);

  const handleToggle = () => {
    if (disabled) return;
    if (navigation.isOpenRef.current) {
      navigation.close();
      return;
    }

    navigation.open();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    navigation.handleKeyDown(event);
  };

  const containerClasses =
    layout === 'horizontal' ? `flex items-center justify-between py-1 ${className || ''}` : className;

  const labelClasses =
    layout === 'horizontal'
      ? 'text-sm font-medium text-[var(--theme-text-primary)] mr-4 flex-shrink-0'
      : 'block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5';
  const defaultWrapperClasses = layout === 'horizontal' ? 'relative w-full sm:w-64' : 'relative';

  const finalWrapperClasses = wrapperClassName || defaultWrapperClasses;

  const dropdownPositionClass = direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1';
  const optionId = (optionIndex: number) => `${listboxId}-option-${optionIndex}`;

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
        <button
          type="button"
          id={id}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={
            size === 'compact'
              ? `w-full h-9 px-2.5 py-0 text-left border rounded-lg flex items-center justify-between transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] ${disabled ? 'opacity-60 cursor-not-allowed bg-[var(--theme-bg-secondary)]' : 'cursor-pointer bg-[var(--theme-bg-input)] hover:border-[var(--theme-border-focus)]'} border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] text-xs font-medium ${triggerClassName || ''}`
              : `w-full p-2.5 text-left border rounded-lg flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] ${disabled ? 'opacity-60 cursor-not-allowed bg-[var(--theme-bg-secondary)]' : 'cursor-pointer bg-[var(--theme-bg-input)] hover:border-[var(--theme-border-focus)]'} border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] text-sm ${triggerClassName || ''}`
          }
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        >
          <div className="truncate mr-2 flex-grow text-left">
            {selectedOption ? (
              selectedOption.label
            ) : (
              <span className="text-[var(--theme-text-tertiary)]">{t('selectPlaceholder')}</span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`text-[var(--theme-text-tertiary)] transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            strokeWidth={1.5}
          />
        </button>

        {isOpen && (
          <div
            className={`absolute ${dropdownPositionClass} left-0 z-50 w-full bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-premium overflow-hidden flex flex-col ${dropdownClassName || 'max-h-[300px]'}`}
          >
            <div id={listboxId} role="listbox" className="overflow-y-auto custom-scrollbar p-1">
              {options.map((option, optionIndex) => {
                const isSelected = String(option.value) === String(value);
                const isActive = activeIndex === optionIndex;

                return (
                  <button
                    key={`${option.value}-${optionIndex}`}
                    id={optionId(optionIndex)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-medium'
                        : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]/50 hover:text-[var(--theme-text-primary)]'
                    } ${isActive && !isSelected ? 'bg-[var(--theme-bg-tertiary)]/50 text-[var(--theme-text-primary)]' : ''} ${
                      option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <span className="truncate w-full block">{option.label}</span>
                    {isSelected && (
                      <Check size={14} className="text-[var(--theme-text-link)] flex-shrink-0 ml-2" strokeWidth={1.5} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
