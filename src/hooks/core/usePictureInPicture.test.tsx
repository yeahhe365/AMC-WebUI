import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render/renderer';
import { usePictureInPicture } from './usePictureInPicture';

const createPipWindow = () => {
  const pipDocument = document.implementation.createHTMLDocument('PiP');
  const listeners = new Map<string, EventListener>();

  return {
    document: pipDocument,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    close: vi.fn(() => {
      listeners.get('pagehide')?.(new Event('pagehide'));
    }),
  } as unknown as Window;
};

describe('usePictureInPicture', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <style id="theme-variables">:root { --theme-bg-primary: #fff; }</style>
      <link rel="stylesheet" href="/assets/index.css">
      <link rel="modulepreload" href="/assets/react-vendor.js">
      <script type="module" src="/assets/index-production.js"></script>
      <script type="module" src="/src/index.tsx"></script>
      <script>window.__runtime = true;</script>
    `;

    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: vi.fn(),
      },
    });
  });

  it('copies stylesheet resources into the PiP window without copying executable scripts', async () => {
    const pipWindow = createPipWindow();
    const requestWindow = vi.mocked(window.documentPictureInPicture!.requestWindow);
    requestWindow.mockResolvedValue(pipWindow);
    const setIsHistorySidebarOpenTransient = vi.fn();
    const { result, unmount } = renderHook(() => usePictureInPicture(true, setIsHistorySidebarOpenTransient));

    await act(async () => {
      await result.current.togglePip();
    });

    expect(pipWindow.document.head.querySelector('style#theme-variables')).not.toBeNull();
    expect(pipWindow.document.head.querySelector('link[rel="stylesheet"]')).not.toBeNull();
    expect(pipWindow.document.head.querySelector('link[rel="modulepreload"]')).not.toBeNull();
    expect(pipWindow.document.head.querySelector('script')).toBeNull();

    unmount();
  });
});
