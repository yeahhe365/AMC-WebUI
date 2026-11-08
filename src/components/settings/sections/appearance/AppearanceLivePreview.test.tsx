import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { AppearanceLivePreview } from './AppearanceLivePreview';
import type { AppSettings } from '@/types';

// The preview suspends on a lazily imported markdown renderer. Warming the module
// keeps the first assertion from racing the import, which is far slower than the
// default waitFor budget on a cold, parallel test run.
beforeAll(async () => {
  await import('@/components/message/StandardMarkdownRenderer');
});

const baseSettings: AppSettings = {
  themeId: 'onyx',
  baseFontSize: 16,
  showMessageTokenStats: true,
} as AppSettings;

describe('AppearanceLivePreview', () => {
  it('renders live preview with user message and code block by default', async () => {
    const { container } = renderWithProviders(<AppearanceLivePreview settings={baseSettings} />, {
      language: 'en',
    });

    expect(container.textContent).toContain('Live Preview');
    expect(container.textContent).toContain('Write a Python function to generate Fibonacci numbers');
    await waitFor(() => expect(container.textContent).toContain('def fibonacci'));
    expect(container.textContent).toContain('64 tokens');

    const avatar = container.querySelector('img[src="/assets/assistant-avatar.png"]');
    expect(avatar).not.toBeNull();
    expect(container.textContent).toContain('Gemini 3.8 Flash');
  });

  it('renders custom model display name reactively from settings', () => {
    const customModelSettings: AppSettings = {
      ...baseSettings,
      modelId: 'gemini-3.7-flash',
    };

    const { container } = renderWithProviders(<AppearanceLivePreview settings={customModelSettings} />, {
      language: 'en',
    });

    expect(container.textContent).toContain('Gemini 3.7 Flash');
  });

  it('updates font size reactively according to settings', () => {
    const customSettings: AppSettings = {
      ...baseSettings,
      baseFontSize: 22,
    };

    const { container } = renderWithProviders(<AppearanceLivePreview settings={customSettings} />, {
      language: 'en',
    });

    const userBubble = container.querySelector('div[style*="font-size: 22px"]');
    expect(userBubble).not.toBeNull();
  });

  it('allows toggling between code tab and typography text tab', async () => {
    const { container } = renderWithProviders(<AppearanceLivePreview settings={baseSettings} />, {
      language: 'en',
    });

    // Code is visible initially
    await waitFor(() => expect(container.textContent).toContain('def fibonacci'));

    // Click typography tab
    const textTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Typography'),
    );
    expect(textTabBtn).toBeDefined();

    act(() => {
      fireEvent.click(textTabBtn!);
    });

    // Should now show typography text sample instead of python code
    await waitFor(() => expect(container.textContent).toContain('Markdown formatting with'));
    expect(container.textContent).not.toContain('def fibonacci');
  });

  it('hides token stats when showMessageTokenStats is false', () => {
    const noStatsSettings: AppSettings = {
      ...baseSettings,
      showMessageTokenStats: false,
    };

    const { container } = renderWithProviders(<AppearanceLivePreview settings={noStatsSettings} />, {
      language: 'en',
    });

    expect(container.textContent).not.toContain('64 tokens');
  });

  it('applies serif font-family to typography sample when configured', () => {
    const { container } = renderWithProviders(
      <AppearanceLivePreview settings={{ ...baseSettings, readingFontFamily: 'serif' }} />,
      { language: 'en' },
    );

    const textTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Typography'),
    );
    act(() => {
      fireEvent.click(textTabBtn!);
    });

    const textSample = container.querySelector('div[style*="--app-font-reading: var(--app-font-serif)"]');
    expect(textSample).not.toBeNull();
  });
});
