import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it } from 'vitest';
import { useToastStore, toastSuccess, toastError, toastInfo } from '@/stores/toastStore';
import { ToastViewport } from './ToastViewport';
import { screen } from '@testing-library/react';

describe('ToastViewport', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  const renderViewport = () => {
    act(() => {
      renderer.render(<ToastViewport />);
    });
  };

  afterEach(() => {
    act(() => {
      useToastStore.setState({ toasts: [] });
    });
  });

  it('renders sonner toaster container', () => {
    renderViewport();
    const section = document.body.querySelector('section[aria-live="polite"]');
    expect(section).not.toBeNull();
  });

  it('renders dispatched toasts with appropriate messages', async () => {
    renderViewport();

    act(() => {
      toastSuccess('saved successfully');
      toastError('connection exploded');
      toastInfo('informational note');
    });

    expect(await screen.findByText('saved successfully')).toBeInTheDocument();
    expect(await screen.findByText('connection exploded')).toBeInTheDocument();
    expect(await screen.findByText('informational note')).toBeInTheDocument();
  });

  it('dismisses toast when store dismissToast is called', async () => {
    renderViewport();

    let id: string | number = '';
    act(() => {
      id = useToastStore.getState().showToast('stuck around');
    });

    expect(await screen.findByText('stuck around')).toBeInTheDocument();

    act(() => {
      useToastStore.getState().dismissToast(id);
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
