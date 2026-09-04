import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { useWindowContext } from '@/contexts/WindowContext';
import { useClickOutside } from '@/hooks/useClickOutside';

interface UsePortaledMenuOptions {
  menuWidth?: number;
  gap?: number;
  buttonMargin?: number;
  constrainHeight?: boolean;
  minHeight?: number;
}

export const usePortaledMenu = ({
  menuWidth = 240,
  gap = 8,
  buttonMargin = 10,
  constrainHeight = false,
  minHeight = 150,
}: UsePortaledMenuOptions = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { window: targetWindow } = useWindowContext();

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const computeMenuPosition = useCallback((): CSSProperties => {
    if (!buttonRef.current || !targetWindow) {
      return {};
    }

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = targetWindow.innerWidth;
    const viewportHeight = targetWindow.innerHeight;
    const nextPosition: CSSProperties = {
      position: 'fixed',
      zIndex: 9999,
    };

    if (buttonRect.left + menuWidth > viewportWidth - buttonMargin) {
      nextPosition.left = buttonRect.right - menuWidth;
      nextPosition.transformOrigin = 'bottom right';
    } else {
      nextPosition.left = buttonRect.left;
      nextPosition.transformOrigin = 'bottom left';
    }

    nextPosition.bottom = viewportHeight - buttonRect.top + gap;

    if (constrainHeight) {
      const availableHeight = buttonRect.top - buttonMargin;
      nextPosition.maxHeight = `${Math.max(minHeight, availableHeight)}px`;
      nextPosition.overflowY = 'auto';
    }

    return nextPosition;
  }, [buttonMargin, constrainHeight, gap, menuWidth, minHeight, targetWindow]);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const stopPropagation = (event: Event) => event.stopPropagation();
    const menuElement = menuRef.current;

    menuElement.addEventListener('mousedown', stopPropagation);
    menuElement.addEventListener('touchstart', stopPropagation);

    return () => {
      menuElement.removeEventListener('mousedown', stopPropagation);
      menuElement.removeEventListener('touchstart', stopPropagation);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !targetWindow) return;

    const updatePosition = () => {
      setMenuPosition(computeMenuPosition());
    };

    targetWindow.addEventListener('resize', updatePosition);
    targetWindow.addEventListener('scroll', updatePosition, true);

    return () => {
      targetWindow.removeEventListener('resize', updatePosition);
      targetWindow.removeEventListener('scroll', updatePosition, true);
    };
  }, [computeMenuPosition, isOpen, targetWindow]);

  useEffect(() => {
    if (!isOpen || !targetWindow) return;

    const getMenuItems = (): HTMLElement[] =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [role="menuitem"]:not([disabled])') ??
          [],
      );

    const focusMenuItem = (items: HTMLElement[], index: number) => {
      const item = items[index];
      if (item) item.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        return;
      }

      if (event.key === 'Tab') {
        setIsOpen(false);
        return;
      }

      const navigationKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!navigationKeys.includes(event.key)) return;

      const items = getMenuItems();
      if (items.length === 0) return;

      event.preventDefault();
      const activeIndex = items.indexOf(targetWindow.document.activeElement as HTMLElement);

      if (event.key === 'Home') {
        focusMenuItem(items, 0);
        return;
      }
      if (event.key === 'End') {
        focusMenuItem(items, items.length - 1);
        return;
      }

      if (activeIndex === -1) {
        focusMenuItem(items, event.key === 'ArrowDown' ? 0 : items.length - 1);
        return;
      }

      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusMenuItem(items, (activeIndex + delta + items.length) % items.length);
    };

    targetWindow.document.addEventListener('keydown', handleKeyDown);
    return () => {
      targetWindow.document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, targetWindow]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setMenuPosition(computeMenuPosition());
      }
      return next;
    });
  }, [computeMenuPosition]);

  return {
    isOpen,
    menuPosition,
    containerRef,
    buttonRef,
    menuRef,
    targetWindow,
    closeMenu,
    toggleMenu,
  };
};
