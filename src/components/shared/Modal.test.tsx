import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  const renderer = setupTestRenderer();

  it('uses Tailwind v4 compatible default backdrop classes', () => {
    act(() => {
      renderer.root.render(
        <Modal isOpen onClose={() => {}} ariaLabel="Test dialog">
          <div>Content</div>
        </Modal>,
      );
    });

    const backdrop = document.querySelector('[data-modal-backdrop="true"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain('bg-black/60');
    expect(backdrop?.className).not.toContain('bg-opacity-60');
  });

  it('labels the dialog, moves focus inside, traps tab focus, and restores focus on close', () => {
    const onClose = vi.fn();
    const launcher = document.createElement('button');
    launcher.textContent = 'Open modal';
    document.body.appendChild(launcher);
    launcher.focus();

    act(() => {
      renderer.root.render(
        <Modal isOpen onClose={onClose} ariaLabel="Accessible dialog">
          <button type="button">First action</button>
          <button type="button">Second action</button>
        </Modal>,
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    const [firstAction, secondAction] = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-label')).toBe('Accessible dialog');
    expect(document.activeElement).toBe(firstAction);

    firstAction?.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(secondAction);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(firstAction);

    act(() => {
      renderer.root.render(
        <Modal isOpen={false} onClose={onClose} ariaLabel="Accessible dialog">
          <button type="button">First action</button>
          <button type="button">Second action</button>
        </Modal>,
      );
    });

    expect(document.activeElement).toBe(launcher);
    launcher.remove();
  });

  it('waits for the exit animation event before unmounting', () => {
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <Modal isOpen onClose={onClose}>
          <div>Content</div>
        </Modal>,
      );
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      renderer.root.render(
        <Modal isOpen={false} onClose={onClose}>
          <div>Content</div>
        </Modal>,
      );
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const animatedSurface = document.querySelector('.modal-exit-animation');
    expect(animatedSurface).not.toBeNull();

    act(() => {
      animatedSurface?.dispatchEvent(new Event('animationend', { bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lets the topmost nested dialog own Escape and Tab', () => {
    const parentClose = vi.fn();
    const childClose = vi.fn();

    act(() => {
      renderer.root.render(
        <>
          <Modal isOpen onClose={parentClose} ariaLabel="Parent dialog">
            <button type="button">Parent action</button>
          </Modal>
          <Modal isOpen onClose={childClose} ariaLabel="Child dialog">
            <button type="button">Child first</button>
            <button type="button">Child last</button>
          </Modal>
        </>,
      );
    });

    const childDialog = document.querySelector('[aria-label="Child dialog"]');
    const [childFirst, childLast] = Array.from(childDialog?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    childLast?.focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(childFirst);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(childClose).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
  });
});
