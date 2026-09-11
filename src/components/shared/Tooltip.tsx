import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export interface TooltipProps {
  text: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  delayDuration?: number;
  asChild?: boolean;
  variant?: 'default' | 'dark';
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className = '',
  delayDuration = 200,
  asChild = false,
  variant = 'default',
}) => {
  if (!text) {
    return <>{children}</>;
  }

  const isDarkVariant = variant === 'dark';
  const contentStyle = isDarkVariant
    ? 'border-white/20 bg-zinc-900/95 text-zinc-100 shadow-2xl backdrop-blur-md'
    : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] shadow-lg backdrop-blur-md';

  const arrowStyle = isDarkVariant
    ? 'fill-zinc-900 stroke-white/20 stroke-1'
    : 'fill-[var(--theme-bg-tertiary)] stroke-[var(--theme-border-secondary)] stroke-1';

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {asChild && React.isValidElement(children) ? (
            children
          ) : (
            <span className="ml-1.5 inline-flex items-center cursor-help">{children}</span>
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            className={`z-[9999] max-w-xs rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-opacity duration-150 leading-snug pointer-events-none select-none ${contentStyle} ${className}`}
          >
            {text}
            <TooltipPrimitive.Arrow className={arrowStyle} width={8} height={4} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};
