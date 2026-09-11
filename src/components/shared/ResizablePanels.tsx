import React from 'react';
import { Group, Panel, Separator, type GroupProps, type PanelProps } from 'react-resizable-panels';

export interface ResizablePanelGroupProps extends GroupProps {
  className?: string;
  children: React.ReactNode;
}

export interface ResizablePanelProps extends PanelProps {
  className?: string;
  children: React.ReactNode;
}

export interface ResizableHandleProps {
  className?: string;
  withHandle?: boolean;
  disabled?: boolean;
  onDoubleClick?: () => void;
  title?: string;
  ariaLabel?: string;
}

export const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
  className = '',
  orientation = 'horizontal',
  children,
  ...props
}) => {
  return (
    <Group
      orientation={orientation}
      className={`flex h-full w-full data-[group-orientation=vertical]:flex-col ${className}`}
      {...props}
    >
      {children}
    </Group>
  );
};

export const ResizablePanel: React.FC<ResizablePanelProps> = ({ className = '', children, ...props }) => {
  return (
    <Panel className={`relative overflow-hidden ${className}`} {...props}>
      {children}
    </Panel>
  );
};

export const ResizableHandle: React.FC<ResizableHandleProps> = ({
  className = '',
  withHandle = true,
  disabled = false,
  onDoubleClick,
  title,
  ariaLabel = 'Resize panel',
}) => {
  return (
    <Separator
      disabled={disabled}
      onDoubleClick={onDoubleClick}
      title={title}
      aria-label={ariaLabel}
      className={`group relative flex w-2 cursor-col-resize items-center justify-center bg-transparent transition-colors hover:bg-[var(--theme-bg-accent)]/20 active:bg-[var(--theme-bg-accent)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] disabled:pointer-events-none disabled:opacity-40 select-none ${className}`}
    >
      {withHandle && (
        <div
          data-testid="resize-grip"
          className="z-10 flex h-8 w-1 items-center justify-center rounded-full bg-[var(--theme-border-secondary)] transition-all group-hover:scale-y-110 group-hover:bg-[var(--theme-bg-accent)]"
        />
      )}
    </Separator>
  );
};
