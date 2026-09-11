import React, { useId } from 'react';
import * as RadixSlider from '@radix-ui/react-slider';

export interface SliderProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  ariaValueText?: string;
  className?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export const Slider: React.FC<SliderProps> = ({
  id: propId,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  ariaLabel,
  ariaValueText,
  className = '',
  onChange,
  onCommit,
}) => {
  const generatedId = useId();
  const id = propId || generatedId;

  // Safe clamp and step alignment
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={disabled}
        onChange={(event) => {
          const num = parseFloat(event.target.value);
          if (!Number.isNaN(num)) {
            onChange(num);
          }
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none"
      />

      <RadixSlider.Root
        value={[safeValue]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-valuetext={ariaValueText}
        onValueChange={(values) => {
          if (values.length > 0 && Number.isFinite(values[0])) {
            onChange(values[0]);
          }
        }}
        onValueCommit={(values) => {
          if (values.length > 0 && onCommit && Number.isFinite(values[0])) {
            onCommit(values[0]);
          }
        }}
        className="group relative flex h-5 w-full touch-none select-none items-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RadixSlider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--theme-border-secondary)] transition-colors group-hover:bg-[var(--theme-border-secondary)]/80">
          <RadixSlider.Range className="absolute h-full rounded-full bg-[var(--theme-bg-accent)] transition-all" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={ariaLabel}
          aria-disabled={disabled ? 'true' : undefined}
          className="block h-4 w-4 rounded-full border border-[var(--theme-border-secondary)]/60 bg-white shadow-xs transition-all duration-150 hover:scale-110 hover:shadow-md active:scale-95 active:shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] disabled:pointer-events-none disabled:opacity-50"
        />
      </RadixSlider.Root>
    </div>
  );
};
