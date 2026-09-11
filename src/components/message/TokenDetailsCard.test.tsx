import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { TokenDetailsCard } from './TokenDetailsCard';
import type { ChatMessage } from '@/types';

const message: ChatMessage = {
  id: 'message-1',
  role: 'model',
  content: 'Hello',
  timestamp: new Date('2026-04-17T00:00:00.000Z'),
  promptTokens: 120,
  cachedPromptTokens: 40,
  toolUsePromptTokens: 12,
  completionTokens: 80,
  thoughtTokens: 7,
  totalTokens: 219,
  cumulativeTotalTokens: 5000,
};

describe('TokenDetailsCard', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    useSettingsStore.setState({ language: 'en' as SupportedLanguage });
  });

  it('renders usage segments with exact counts', () => {
    act(() => {
      renderer.root.render(
        <TokenDetailsCard
          message={message}
          modelTps={42.1}
          endToEndTps={30.5}
          elapsedSeconds={2.5}
          ttftSeconds={0.32}
        />,
      );
    });

    const text = renderer.container.textContent ?? '';
    expect(text).toContain('42.1 Tokens/s');
    expect(text).toContain('30.5 Tokens/s');
    expect(text).toContain('0.32s');
    expect(text).toContain('2.5s');
    expect(text).toContain('5,000');
  });

  it('omits rows without data', () => {
    act(() => {
      renderer.root.render(
        <TokenDetailsCard message={{ ...message, thoughtTokens: undefined, toolUsePromptTokens: undefined }} />,
      );
    });

    const text = renderer.container.textContent ?? '';
    expect(text).not.toContain('0.32s');
    expect(text).not.toContain('Tokens/s');
  });

  it('renders model info header, primary metrics, and cost like Cherry Studio', () => {
    act(() => {
      renderer.root.render(
        <TokenDetailsCard
          message={message}
          modelId="gemini-3.6-flash"
          modelName="Gemini 3.6 Flash"
          providerName="Google"
          modelTps={50.0}
        />,
      );
    });

    const text = renderer.container.textContent ?? '';
    expect(text).toContain('Gemini 3.6 Flash');
    expect(text).toContain('Google');
    expect(text).toContain('Input');
    expect(text).toContain('Output');
    expect(text).toContain('50.0 Tokens/s');

    // Cost row should be rendered
    const costRow = renderer.container.querySelector('[data-testid="message-cost"]');
    expect(costRow).not.toBeNull();
    expect(costRow?.textContent).toContain('Cost');
    expect(costRow?.textContent).toContain('Locally estimated');
  });

  it('expands and collapses runtime breakdown when clicking More details', () => {
    act(() => {
      renderer.root.render(
        <TokenDetailsCard message={{ ...message, thinkingTimeMs: 500 }} elapsedSeconds={3.0} ttftSeconds={0.8} />,
      );
    });

    // Before clicking, breakdown should be collapsed
    expect(renderer.container.querySelector('[data-testid="message-performance-breakdown"]')).toBeNull();

    // Click "More details" button
    const toggleButton = renderer.container.querySelector('button');
    expect(toggleButton).not.toBeNull();
    act(() => {
      toggleButton?.click();
    });

    // Breakdown should now be visible
    const breakdown = renderer.container.querySelector('[data-testid="message-performance-breakdown"]');
    expect(breakdown).not.toBeNull();
    const text = breakdown?.textContent ?? '';
    expect(text).toContain('Waiting');
    expect(text).toContain('Reasoning');
    expect(text).toContain('Text generation');
  });
});
