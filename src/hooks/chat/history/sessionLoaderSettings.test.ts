import { describe, expect, it } from 'vitest';

import { MediaResolution, type ChatSettings, type SavedChatSession } from '@/types';
import { createAppSettings, createChatSettings, createSavedChatSession } from '@/test/data/factories';

import { createSettingsForNewChat, resolveNewTabTemplate } from './sessionLoaderSettings';

const LIVE_ARTIFACTS_PROMPT = '[Live Artifacts Protocol - zh]\nLive Artifacts prompt';

describe('createSettingsForNewChat', () => {
  it('inherits Live Artifacts systemInstruction from app settings for new chats', () => {
    const appSettings = createAppSettings({
      systemInstruction: LIVE_ARTIFACTS_PROMPT,
      modelId: 'gemini-3-flash-preview',
    });

    const settings = createSettingsForNewChat({
      appSettings,
      savedSessions: [],
    });

    expect(settings.systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT);
  });

  it('keeps app Live Artifacts systemInstruction when a template session only supplies model flags', () => {
    const appSettings = createAppSettings({
      systemInstruction: LIVE_ARTIFACTS_PROMPT,
      modelId: 'gemini-3-flash-preview',
    });
    const templateSession = createSavedChatSession({
      id: 'template',
      title: 'Previous Chat',
      timestamp: Date.now(),
      messages: [],
      settings: createChatSettings({
        modelId: 'gemini-3-pro-preview',
        systemInstruction: '',
        isGoogleSearchEnabled: true,
      }),
    });

    const settings = createSettingsForNewChat({
      appSettings,
      savedSessions: [templateSession],
    });

    expect(settings.systemInstruction).toBe(LIVE_ARTIFACTS_PROMPT);
    expect(settings.modelId).toBe('gemini-3-pro-preview');
    expect(settings.isGoogleSearchEnabled).toBe(true);
  });

  it('fully inherits all template settings including Maps, Pyodide, Keep Thinking and mediaResolution', () => {
    const appSettings = createAppSettings({
      modelId: 'gemini-3-flash-preview',
      isGoogleSearchEnabled: false,
    });
    const templateSession = createSavedChatSession({
      id: 'template',
      title: 'Previous Chat',
      timestamp: Date.now(),
      messages: [],
      settings: createChatSettings({
        modelId: 'gemini-3-pro-preview',
        isGoogleSearchEnabled: true,
        isGoogleMapsEnabled: true,
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: true,
        isUrlContextEnabled: true,
        isDeepSearchEnabled: true,
        alwaysKeepThinkingInContext: true,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        thinkingLevel: 'HIGH',
        ttsVoice: 'Aoede',
      }),
    });

    const settings: ChatSettings = createSettingsForNewChat({
      appSettings,
      savedSessions: [templateSession],
    });

    expect(settings.modelId).toBe('gemini-3-pro-preview');
    expect(settings.isGoogleSearchEnabled).toBe(true);
    expect(settings.isGoogleMapsEnabled).toBe(true);
    expect(settings.isCodeExecutionEnabled).toBe(true);
    expect(settings.isLocalPythonEnabled).toBe(true);
    expect(settings.isUrlContextEnabled).toBe(true);
    expect(settings.isDeepSearchEnabled).toBe(true);
    expect(settings.alwaysKeepThinkingInContext).toBe(true);
    expect(settings.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_HIGH);
    expect(settings.thinkingLevel).toBe('HIGH');
    expect(settings.ttsVoice).toBe('Aoede');
  });
});

const makeSession = (id: string, modelId = 'gemini-3-flash-preview'): SavedChatSession =>
  createSavedChatSession({
    id,
    title: `${id} title`,
    timestamp: 1000,
    messages: [],
    settings: createChatSettings({ modelId }),
  });

describe('resolveNewTabTemplate', () => {
  const dbSession = makeSession('session-from', 'gemini-3-pro-preview');

  it('prefers the ?from session when the snapshot matches it, using snapshot settings', () => {
    const snapshot = {
      sessionId: 'session-from',
      settings: createChatSettings({ modelId: 'gemini-3-flash-preview' }),
      ts: 1,
    };

    const template = resolveNewTabTemplate({
      fromSessionId: 'session-from',
      snapshot,
      sortedSessions: [dbSession, makeSession('other', 'gemini-2.5-flash-preview')],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('session-from');
    expect(template!.settings.modelId).toBe('gemini-3-flash-preview');
  });

  it('uses the DB session settings when the snapshot points elsewhere', () => {
    const snapshot = { sessionId: 'unrelated', settings: createChatSettings({ modelId: 'gemini-2.0-flash' }), ts: 1 };

    const template = resolveNewTabTemplate({
      fromSessionId: 'session-from',
      snapshot,
      sortedSessions: [dbSession],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('session-from');
    expect(template!.settings.modelId).toBe('gemini-3-pro-preview');
  });

  it('falls back to the snapshot session when ?from is absent and the session exists', () => {
    const snapshot = {
      sessionId: 'snap-session',
      settings: createChatSettings({ modelId: 'gemini-3-flash-preview' }),
      ts: 1,
    };

    const template = resolveNewTabTemplate({
      fromSessionId: null,
      snapshot,
      sortedSessions: [dbSession, makeSession('snap-session', 'gemini-3-pro-preview')],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('snap-session');
    expect(template!.settings.modelId).toBe('gemini-3-flash-preview');
  });

  it('synthesizes a temporary template when the snapshot session was deleted', () => {
    const snapshot = {
      sessionId: 'deleted-session',
      settings: createChatSettings({ modelId: 'gemini-3-flash-preview' }),
      ts: 1,
    };

    const template = resolveNewTabTemplate({
      fromSessionId: null,
      snapshot,
      sortedSessions: [dbSession],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('deleted-session');
    expect(template!.title).toBe('New Chat');
    expect(template!.messages).toEqual([]);
    expect(template!.settings.modelId).toBe('gemini-3-flash-preview');
  });

  it('falls through to the most recent session when neither ?from nor snapshot is present', () => {
    const template = resolveNewTabTemplate({
      fromSessionId: null,
      snapshot: null,
      sortedSessions: [makeSession('recent'), dbSession],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('recent');
  });

  it('resolves the ?from session even when the snapshot session does not exist in the list', () => {
    const snapshot = { sessionId: 'ghost-snap', settings: createChatSettings({ modelId: 'gemini-2.0-flash' }), ts: 1 };

    const template = resolveNewTabTemplate({
      fromSessionId: 'session-from',
      snapshot,
      sortedSessions: [dbSession],
    });

    expect(template).toBeDefined();
    expect(template!.id).toBe('session-from');
    expect(template!.settings.modelId).toBe('gemini-3-pro-preview');
  });

  it('returns undefined when no session source exists at all', () => {
    const template = resolveNewTabTemplate({
      fromSessionId: null,
      snapshot: null,
      sortedSessions: [],
    });

    expect(template).toBeUndefined();
  });
});
