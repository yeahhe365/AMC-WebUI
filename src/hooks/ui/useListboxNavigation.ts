import { useRef, useState, type KeyboardEvent, type RefObject } from 'react';

export type ListboxMoveDirection = 1 | -1;

export interface UseListboxNavigationOptions {
  /**
   * Compute the highlighted index right before the listbox opens.
   * Runs while the listbox is still closed, matching the original
   * `openWithInitialActiveOption` / `setPickerOpen(true)` ordering:
   * set the active index first, then flip `isOpen`.
   */
  getInitialActiveIndex: () => number;
  /** Next highlighted index for ArrowDown/ArrowUp while open. */
  getRelativeActiveIndex: (currentIndex: number, direction: ListboxMoveDirection) => number;
  /** Target index for Home while open. */
  getFirstActiveIndex: () => number;
  /** Target index for End while open. */
  getLastActiveIndex: () => number;
  /** Confirm the currently highlighted item on Enter/Space while open. */
  onSelectActiveIndex: (index: number) => void;
}

export interface UseListboxNavigationResult {
  isOpen: boolean;
  activeIndex: number;
  isOpenRef: RefObject<boolean>;
  activeIndexRef: RefObject<number>;
  /** Set the initial highlight, then open (mirrors the duplicated state machines). */
  open: () => void;
  close: () => void;
  /**
   * Shared key dispatch: ArrowUp/ArrowDown/Home/End/Enter/Space/Escape.
   * Consumers keep their own entry guards (e.g. `disabled`, `defaultPrevented`)
   * by wrapping this handler, exactly like the original components did.
   */
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Shared dropdown-listbox keyboard navigation state machine extracted from
 * Select and ModelPicker. Owns the mirrored `isOpen`/`activeIndex` state +
 * refs and the key dispatch skeleton; per-component strategies (skipping
 * disabled options, selectable-only moves, boundary targets, selection) are
 * injected so both call sites keep their exact original behavior.
 */
export const useListboxNavigation = (options: UseListboxNavigationOptions): UseListboxNavigationResult => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const isOpenRef = useRef(false);
  const activeIndexRef = useRef(-1);

  const setOpenState = (nextIsOpen: boolean) => {
    isOpenRef.current = nextIsOpen;
    setIsOpen(nextIsOpen);
  };

  const setActiveOptionIndex = (nextIndex: number) => {
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  const open = () => {
    setActiveOptionIndex(options.getInitialActiveIndex());
    setOpenState(true);
  };

  const close = () => {
    setOpenState(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpenRef.current) {
        open();
        return;
      }
      setActiveOptionIndex(options.getRelativeActiveIndex(activeIndexRef.current, 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpenRef.current) {
        open();
        return;
      }
      setActiveOptionIndex(options.getRelativeActiveIndex(activeIndexRef.current, -1));
      return;
    }

    if (event.key === 'Home' && isOpenRef.current) {
      event.preventDefault();
      setActiveOptionIndex(options.getFirstActiveIndex());
      return;
    }

    if (event.key === 'End' && isOpenRef.current) {
      event.preventDefault();
      setActiveOptionIndex(options.getLastActiveIndex());
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpenRef.current) {
        open();
        return;
      }

      options.onSelectActiveIndex(activeIndexRef.current);
      return;
    }

    if (event.key === 'Escape' && isOpenRef.current) {
      event.preventDefault();
      close();
    }
  };

  return {
    isOpen,
    activeIndex,
    isOpenRef,
    activeIndexRef,
    open,
    close,
    handleKeyDown,
  };
};
