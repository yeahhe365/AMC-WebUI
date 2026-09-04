import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it } from 'vitest';
import { usePortaledMenu } from './usePortaledMenu';

const MenuHost = ({ onAction }: { onAction: (value: string) => void }) => {
  const { isOpen, menuPosition, containerRef, buttonRef, menuRef, toggleMenu } = usePortaledMenu({
    constrainHeight: true,
  });

  return (
    <div ref={containerRef}>
      <button ref={buttonRef} type="button" onClick={toggleMenu}>
        Menu
      </button>
      {isOpen && (
        <div ref={menuRef} role="menu" style={menuPosition} data-testid="menu">
          {['alpha', 'beta', 'gamma'].map((value) => (
            <button key={value} role="menuitem" onClick={() => onAction(value)}>
              {value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

describe('usePortaledMenu keyboard support', () => {
  const renderer = setupProviderTestRenderer();

  const renderHost = () => {
    act(() => {
      renderer.render(<MenuHost onAction={() => {}} />);
    });
    const trigger = renderer.container.querySelector<HTMLButtonElement>('button:not([role="menuitem"])')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return trigger;
  };

  const menuItems = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));

  const pressKey = (key: string, options: KeyboardEventInit = {}) => {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
    });
  };

  it('closes the menu on Escape and returns focus to the trigger button', () => {
    const trigger = renderHost();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    trigger.focus();
    pressKey('Escape');

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus into the menu with ArrowDown and cycles through items', () => {
    renderHost();

    pressKey('ArrowDown');
    expect(document.activeElement).toBe(menuItems()[0]);

    pressKey('ArrowDown');
    expect(document.activeElement).toBe(menuItems()[1]);

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    expect(document.activeElement).toBe(menuItems()[0]);
  });

  it('wraps to the last item with ArrowUp from the first item', () => {
    renderHost();

    pressKey('ArrowUp');
    expect(document.activeElement).toBe(menuItems()[2]);

    pressKey('ArrowUp');
    expect(document.activeElement).toBe(menuItems()[1]);
  });

  it('jumps to the boundaries with Home and End', () => {
    renderHost();

    pressKey('End');
    expect(document.activeElement).toBe(menuItems()[2]);

    pressKey('Home');
    expect(document.activeElement).toBe(menuItems()[0]);
  });

  it('closes the menu on Tab without swallowing the default focus move', () => {
    renderHost();

    pressKey('Tab');

    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('ignores Escape while an IME composition is active', () => {
    renderHost();

    pressKey('Escape', { isComposing: true });

    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});
