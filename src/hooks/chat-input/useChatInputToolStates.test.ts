import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSettings } from '@/types';
import { createAppSettings, createChatSettings } from '@/test/data/factories';
import { renderHook } from '@/test/render/renderer';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getNextSettingsForToolToggle, useChatInputToolStates } from './useChatInputToolStates';

const settings = (overrides: Partial<ChatSettings> = {}): ChatSettings =>
  createChatSettings({ modelId: 'gemma-3-27b-it', ...overrides });

describe('getNextSettingsForToolToggle — keep thinking', () => {
  it('enables alwaysKeepThinkingInContext when off', () => {
    const next = getNextSettingsForToolToggle(settings(), 'alwaysKeepThinking');
    expect(next.alwaysKeepThinkingInContext).toBe(true);
  });

  it('disables alwaysKeepThinkingInContext when on', () => {
    const next = getNextSettingsForToolToggle(settings({ alwaysKeepThinkingInContext: true }), 'alwaysKeepThinking');
    expect(next.alwaysKeepThinkingInContext).toBe(false);
  });

  it('clears hideThinkingInContext when enabling keep (mutual exclusion)', () => {
    const next = getNextSettingsForToolToggle(
      settings({ hideThinkingInContext: true, alwaysKeepThinkingInContext: false }),
      'alwaysKeepThinking',
    );
    expect(next.alwaysKeepThinkingInContext).toBe(true);
    expect(next.hideThinkingInContext).toBe(false);
  });

  it('leaves hideThinkingInContext untouched when disabling keep', () => {
    const next = getNextSettingsForToolToggle(
      settings({ hideThinkingInContext: true, alwaysKeepThinkingInContext: true }),
      'alwaysKeepThinking',
    );
    expect(next.alwaysKeepThinkingInContext).toBe(false);
    // Only the enable direction enforces the mutex; disabling keep keeps hide as-is.
    expect(next.hideThinkingInContext).toBe(true);
  });

  it('does not touch other tool settings', () => {
    const next = getNextSettingsForToolToggle(
      settings({ isDeepSearchEnabled: true, isUrlContextEnabled: true, alwaysKeepThinkingInContext: false }),
      'alwaysKeepThinking',
    );
    expect(next.isDeepSearchEnabled).toBe(true);
    expect(next.isUrlContextEnabled).toBe(true);
  });
});

// Regression: the tool gates must mirror the ACTIVE SESSION's routing key
// (providerId), not a global appSettings mode. When a chat switch leaves a
// global mode stale, a global-based gate would hide badges on sessions that
// actually route Gemini-native — or show them on third-party sessions.
describe('useChatInputToolStates — Gemini tool gates follow session providerId', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeSessionId: 'session-1',
      savedSessions: [],
      activeMessages: [],
    });
  });

  const renderToolStates = (overrides: Partial<ChatSettings>) =>
    renderHook(() =>
      useChatInputToolStates({
        currentChatSettings: createChatSettings(overrides),
        isLoading: false,
        onStopGenerating: vi.fn(),
      }),
    );

  it('hides Gemini tools on a third-party session', () => {
    const { result } = renderToolStates({
      providerId: 'openai',
      isDeepSearchEnabled: true,
      isGoogleSearchEnabled: true,
      isCodeExecutionEnabled: true,
    });

    expect(result.current.deepSearch!.isEnabled).toBe(false);
    expect(result.current.googleSearch!.isEnabled).toBe(false);
    expect(result.current.codeExecution!.isEnabled).toBe(false);
  });

  it('shows Gemini tools on a Gemini-native session even when a global mode points third-party', () => {
    // Set the global appSettings to the OPPOSITE of the session: if the gate were
    // ever reverted to read the global store, this assertion would fail.
    useSettingsStore.setState({
      appSettings: createAppSettings({ providerId: 'openai' }),
    });

    const { result } = renderToolStates({
      providerId: 'gemini-native',
      isDeepSearchEnabled: true,
      isUrlContextEnabled: true,
    });

    expect(result.current.deepSearch!.isEnabled).toBe(true);
    expect(result.current.urlContext!.isEnabled).toBe(true);
  });
});
