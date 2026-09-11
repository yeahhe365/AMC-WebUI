import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './AlertDialog';

describe('AlertDialog primitive', () => {
  it('renders alert dialog with proper role and accessibility', () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toBeNull();
    expect(screen.getByText('Are you absolutely sure?')).not.toBeNull();
    expect(screen.getByText('This action cannot be undone.')).not.toBeNull();
  });

  it('triggers cancel callback on cancel click', () => {
    const onCancel = vi.fn();
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const cancelBtn = screen.getByText('Cancel');
    act(() => {
      fireEvent.click(cancelBtn);
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('triggers action callback on confirm click', () => {
    const onAction = vi.fn();
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onAction}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const confirmBtn = screen.getByText('Confirm');
    act(() => {
      fireEvent.click(confirmBtn);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
