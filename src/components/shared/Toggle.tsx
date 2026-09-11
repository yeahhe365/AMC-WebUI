import React, { useId } from 'react';
import * as Switch from '@radix-ui/react-switch';

export const Toggle: React.FC<{
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  interactive?: boolean;
}> = ({ id: propId, checked, onChange, disabled, ariaLabel, interactive = true }) => {
  const generatedId = useId();
  const id = propId || generatedId;

  if (!interactive) {
    return (
      <span className="flex items-center" aria-hidden="true">
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)]">
          <span
            className={`block h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out ${
              checked ? 'translate-x-5.5' : 'translate-x-1'
            }`}
          />
        </span>
      </span>
    );
  }

  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      onClick={(e) => {
        e.preventDefault();
      }}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-checked={checked}
      />
      <Switch.Root
        id={id ? `${id}-switch` : undefined}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--theme-bg-accent)] active:scale-95"
      >
        <Switch.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-xs ring-0 transition-transform duration-200 ease-in-out data-[state=checked]:translate-x-5.5 data-[state=unchecked]:translate-x-1 will-change-transform group-active:scale-90" />
      </Switch.Root>
    </label>
  );
};
