import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { Toggle } from './Toggle';

interface ToggleItemProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
  small?: boolean;
  /** Optional inline control rendered after the label (e.g. a preview icon). */
  labelTrailing?: React.ReactNode;
}

export const ToggleItem: React.FC<ToggleItemProps> = ({
  label,
  checked,
  onChange,
  tooltip,
  small = false,
  labelTrailing,
}) => {
  const rowPaddingClass = small ? 'py-2' : 'py-3';
  const labelClass = small
    ? 'text-xs text-[var(--theme-text-secondary)]'
    : 'text-sm font-medium text-[var(--theme-text-primary)]';

  return (
    <div
      className={`flex items-center justify-between ${rowPaddingClass} transition-colors cursor-pointer group select-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]`}
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
          return;
        }

        e.preventDefault();
        onChange(!checked);
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-4">
        <span className={`${labelClass} group-hover:text-[var(--theme-text-primary)] transition-colors`}>{label}</span>
        {tooltip && (
          <div onClick={(e) => e.stopPropagation()} className="flex flex-shrink-0 items-center">
            <Tooltip text={tooltip}>
              <Info
                size={14}
                className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] cursor-help transition-colors"
                strokeWidth={1.5}
              />
            </Tooltip>
          </div>
        )}
        {labelTrailing && (
          <div onClick={(e) => e.stopPropagation()} className="flex flex-shrink-0 items-center">
            {labelTrailing}
          </div>
        )}
      </div>
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
};
