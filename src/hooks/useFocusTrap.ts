import { useEffect, useRef, type RefObject } from 'react';
import { useWindowContext } from '@/contexts/WindowContext';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const win = element.ownerDocument?.defaultView ?? window;
    const style = win.getComputedStyle(element);

    return (
      !element.closest('[inert]') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });

interface UseFocusTrapOptions {
  document?: Document;
  restoreFocusTo?: HTMLElement | null;
}

/**
 * Traps keyboard focus inside a container while it is active: Tab cycles between
 * the container's focusable elements, the first one receives initial focus, and
 * on close focus is returned to the element that opened it.
 */
export const useFocusTrap = (
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  options: UseFocusTrapOptions = {},
) => {
  const { document: contextDocument } = useWindowContext();
  const targetDocument = options.document ?? contextDocument;
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container) {
      return undefined;
    }

    const previouslyFocusedElement = targetDocument.activeElement as HTMLElement | null;
    previouslyFocusedElementRef.current = previouslyFocusedElement;

    const focusTarget = () => {
      const [firstFocusable] = getFocusableElements(container);
      (firstFocusable ?? container).focus();
    };

    focusTarget();
    targetDocument.defaultView?.requestAnimationFrame(focusTarget);

    return () => {
      const restoreTarget = options.restoreFocusTo?.isConnected
        ? options.restoreFocusTo
        : previouslyFocusedElementRef.current;

      if (restoreTarget?.isConnected) {
        restoreTarget.focus();
        targetDocument.defaultView?.requestAnimationFrame(() => {
          if (restoreTarget.isConnected) {
            restoreTarget.focus();
          }
        });
      }
      previouslyFocusedElementRef.current = null;
    };
  }, [enabled, ref, targetDocument, options.restoreFocusTo]);

  useEffect(() => {
    const container = ref.current;
    if (!enabled || !container) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = targetDocument.activeElement;

      if (!container.contains(activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    targetDocument.addEventListener('keydown', handleKeyDown);

    return () => {
      targetDocument.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, ref, targetDocument]);
};
