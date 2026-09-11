import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Z_INDEX_MODAL_BACKDROP } from '@/constants/layout';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export type DialogOverlayProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;

export const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, DialogOverlayProps>(
  ({ className = '', ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`radix-dialog-overlay fixed inset-0 ${Z_INDEX_MODAL_BACKDROP} bg-black/60 backdrop-blur-xs ${className}`}
      {...props}
    />
  ),
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showCloseButton?: boolean;
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className = '', children, showCloseButton = true, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <div
        className={`fixed inset-0 ${Z_INDEX_MODAL_BACKDROP} flex items-center justify-center p-4 pointer-events-none`}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={`radix-dialog-content pointer-events-auto relative w-full max-w-lg bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-2xl shadow-2xl p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] overflow-hidden ${className}`}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
              aria-label="Close"
            >
              <X size={18} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col space-y-1.5 text-left mb-4 ${className}`} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2.5 gap-2 sm:gap-0 mt-6 ${className}`}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-bold text-[var(--theme-text-primary)] leading-tight tracking-tight ${className}`}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-sm text-[var(--theme-text-secondary)] leading-relaxed ${className}`}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
