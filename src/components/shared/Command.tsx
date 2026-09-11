import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogContent } from './Dialog';

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className = '', ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={`flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] ${className}`}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

export type CommandDialogProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> & {
  children?: React.ReactNode;
  className?: string;
  commandProps?: React.ComponentPropsWithoutRef<typeof CommandPrimitive>;
};

export const CommandDialog: React.FC<CommandDialogProps> = ({ children, className = '', commandProps, ...props }) => {
  return (
    <Dialog {...props}>
      <DialogContent
        showCloseButton={false}
        className={`overflow-hidden p-0 shadow-2xl border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] max-w-xl sm:rounded-2xl ${className}`}
      >
        <Command
          className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-[var(--theme-text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-1.5 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
          {...commandProps}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className = '', ...props }, ref) => (
  <div className="flex items-center border-b border-[var(--theme-border-secondary)] px-3.5" cmdk-input-wrapper="">
    <Search className="mr-2.5 h-4 w-4 shrink-0 text-[var(--theme-text-tertiary)]" />
    <CommandPrimitive.Input
      ref={ref}
      className={`flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-[var(--theme-text-tertiary)] text-[var(--theme-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className = '', ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={`max-h-[340px] overflow-y-auto overflow-x-hidden p-1.5 custom-scrollbar ${className}`}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-8 text-center text-xs text-[var(--theme-text-tertiary)] font-medium"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className = '', ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={`overflow-hidden p-1 text-[var(--theme-text-primary)] [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--theme-text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider ${className}`}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

export const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className = '', ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={`-mx-1 my-1.5 h-px bg-[var(--theme-border-secondary)] ${className}`}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className = '', ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={`relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-[var(--theme-bg-tertiary)] data-[selected=true]:text-[var(--theme-text-primary)] data-[disabled=true]:opacity-50 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] ${className}`}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export const CommandShortcut = ({ className = '', ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={`ml-auto text-[10px] font-mono tracking-widest text-[var(--theme-text-tertiary)] bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] px-1.5 py-0.5 rounded shadow-2xs ${className}`}
      {...props}
    />
  );
};
CommandShortcut.displayName = 'CommandShortcut';
