import { act } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { setupStoreStateReset } from '@/test/stores/reset';
import { GoogleMapsLocationModal } from './GoogleMapsLocationModal';
import * as geolocation from '@/utils/geolocation';

describe('GoogleMapsLocationModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial location and preset cities when open', () => {
    act(() => {
      renderer.root.render(
        <GoogleMapsLocationModal
          isOpen={true}
          onClose={vi.fn()}
          location={{
            latitude: 39.9042,
            longitude: 116.4074,
            name: 'Beijing',
          }}
          onSave={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain('Maps Location Context');
    expect(document.body.textContent).toContain('Popular Cities');

    const nameInput = document.body.querySelector<HTMLInputElement>('input[placeholder="如：北京、办公室、家"]');
    expect(nameInput?.value).toBe('Beijing');

    const latInput = document.body.querySelector<HTMLInputElement>('input[placeholder="39.9042"]');
    expect(latInput?.value).toBe('39.9042');

    const lngInput = document.body.querySelector<HTMLInputElement>('input[placeholder="116.4074"]');
    expect(lngInput?.value).toBe('116.4074');
  });

  it('selects a preset city and updates coordinate inputs', () => {
    act(() => {
      renderer.root.render(
        <GoogleMapsLocationModal isOpen={true} onClose={vi.fn()} location={undefined} onSave={vi.fn()} />,
      );
    });

    // Find and click the Tokyo preset button
    const presetButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'));
    const tokyoButton = presetButtons.find((btn) => btn.textContent?.includes('东京'));
    expect(tokyoButton).toBeDefined();

    act(() => {
      tokyoButton?.click();
    });

    const latInput = document.body.querySelector<HTMLInputElement>('input[placeholder="39.9042"]');
    const lngInput = document.body.querySelector<HTMLInputElement>('input[placeholder="116.4074"]');
    const nameInput = document.body.querySelector<HTMLInputElement>('input[placeholder="如：北京、办公室、家"]');

    expect(latInput?.value).toBe('35.6762');
    expect(lngInput?.value).toBe('139.6503');
    expect(nameInput?.value).toBe('东京');
  });

  it('saves custom coordinates and closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <GoogleMapsLocationModal isOpen={true} onClose={onClose} location={undefined} onSave={onSave} />,
      );
    });

    const latInput = document.body.querySelector<HTMLInputElement>('input[placeholder="39.9042"]');
    const lngInput = document.body.querySelector<HTMLInputElement>('input[placeholder="116.4074"]');
    const nameInput = document.body.querySelector<HTMLInputElement>('input[placeholder="如：北京、办公室、家"]');

    const setInputValue = (input: HTMLInputElement, value: string) => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    act(() => {
      if (latInput) setInputValue(latInput, '31.2304');
      if (lngInput) setInputValue(lngInput, '121.4737');
      if (nameInput) setInputValue(nameInput, 'Shanghai');
    });

    const saveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((btn) =>
      btn.textContent?.includes('Save & Apply'),
    );
    expect(saveButton).toBeDefined();

    act(() => {
      saveButton?.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      latitude: 31.2304,
      longitude: 121.4737,
      name: 'Shanghai',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears location on clear click', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    act(() => {
      renderer.root.render(
        <GoogleMapsLocationModal
          isOpen={true}
          onClose={onClose}
          location={{
            latitude: 39.9042,
            longitude: 116.4074,
            name: 'Beijing',
          }}
          onSave={onSave}
        />,
      );
    });

    const clearButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((btn) =>
      btn.textContent?.includes('Clear Location'),
    );
    expect(clearButton).toBeDefined();

    act(() => {
      clearButton?.click();
    });

    expect(onSave).toHaveBeenCalledWith(undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fetches browser location when clicking Use Current Location', async () => {
    vi.spyOn(geolocation, 'requestBrowserLocation').mockResolvedValue({
      latitude: 22.5431,
      longitude: 114.0579,
      name: '当前位置',
    });

    act(() => {
      renderer.root.render(
        <GoogleMapsLocationModal isOpen={true} onClose={vi.fn()} location={undefined} onSave={vi.fn()} />,
      );
    });

    const currentLocButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((btn) =>
      btn.textContent?.includes('Use Current Location'),
    );
    expect(currentLocButton).toBeDefined();

    await act(async () => {
      currentLocButton?.click();
    });

    const latInput = document.body.querySelector<HTMLInputElement>('input[placeholder="39.9042"]');
    const lngInput = document.body.querySelector<HTMLInputElement>('input[placeholder="116.4074"]');
    expect(latInput?.value).toBe('22.5431');
    expect(lngInput?.value).toBe('114.0579');
  });
});
