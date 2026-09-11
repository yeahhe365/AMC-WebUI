import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './Dialog';

describe('Dialog primitive', () => {
  it('opens and closes via trigger and close button', () => {
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open Settings</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings Modal</DialogTitle>
            <DialogDescription>Adjust your preferences.</DialogDescription>
          </DialogHeader>
          <div>Dialog Body</div>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button">Done</button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText('Settings Modal')).toBeNull();

    const trigger = screen.getByText('Open Settings');
    act(() => {
      fireEvent.click(trigger);
    });

    expect(screen.getByText('Settings Modal')).not.toBeNull();
    expect(screen.getByText('Adjust your preferences.')).not.toBeNull();
    expect(screen.getByText('Dialog Body')).not.toBeNull();

    const closeBtn = screen.getByText('Done');
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByText('Settings Modal')).toBeNull();
  });

  it('closes when pressing Escape key', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escape Test</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByText('Escape Test')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
