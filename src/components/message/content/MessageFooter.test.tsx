import { act } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { createChatMessage } from '@/test/data/factories';
import { useSettingsStore } from '@/stores/settingsStore';
import { MessageFooter } from './MessageFooter';

describe('MessageFooter', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  afterEach(() => {
    useSettingsStore.setState((state) => ({
      appSettings: { ...state.appSettings, showMessageTokenStats: true },
    }));
  });

  it('sends a follow-up when the suggestion itself is clicked', () => {
    const onSuggestionClick = vi.fn();
    const onSuggestionFill = vi.fn();

    renderer.render(
      <MessageFooter
        message={createChatMessage({
          role: 'model',
          suggestions: ['Show a concrete example'],
        })}
        onSuggestionClick={onSuggestionClick}
        onSuggestionFill={onSuggestionFill}
      />,
    );

    const suggestionButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Show a concrete example',
    );

    act(() => {
      suggestionButton?.click();
    });

    expect(onSuggestionClick).toHaveBeenCalledWith('Show a concrete example');
    expect(onSuggestionFill).not.toHaveBeenCalled();
  });

  it('shows a hover-revealed fill button above each suggestion that only fills the input', () => {
    const onSuggestionClick = vi.fn();
    const onSuggestionFill = vi.fn();

    renderer.render(
      <MessageFooter
        message={createChatMessage({
          role: 'model',
          suggestions: ['Compare both options'],
        })}
        onSuggestionClick={onSuggestionClick}
        onSuggestionFill={onSuggestionFill}
      />,
    );

    const fillButton = renderer.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Fill suggestion into input"]',
    );

    expect(fillButton).not.toBeNull();
    expect(fillButton?.className).toContain('group-hover/suggestion:opacity-100');

    act(() => {
      fillButton?.click();
    });

    expect(onSuggestionFill).toHaveBeenCalledWith('Compare both options');
    expect(onSuggestionClick).not.toHaveBeenCalled();
  });

  it('hides token stats when the setting is off', () => {
    useSettingsStore.setState((state) => ({
      appSettings: { ...state.appSettings, showMessageTokenStats: false },
    }));

    renderer.render(
      <MessageFooter
        message={createChatMessage({
          role: 'model',
          promptTokens: 120,
          completionTokens: 80,
          totalTokens: 200,
          generationStartTime: new Date('2026-04-17T00:00:00.000Z'),
          generationEndTime: new Date('2026-04-17T00:00:01.000Z'),
        })}
      />,
    );

    expect(renderer.container.textContent).not.toContain('t/s');
  });

  it('shows nothing under user messages even with session totals', () => {
    renderer.render(
      <MessageFooter
        message={createChatMessage({
          role: 'user',
          cumulativeTotalTokens: 5000,
        })}
      />,
    );

    expect(renderer.container.textContent).toBe('');
  });

  it('shows nothing under user messages without session totals', () => {
    renderer.render(<MessageFooter message={createChatMessage({ role: 'user' })} />);

    expect(renderer.container.textContent).toBe('');
  });
});
