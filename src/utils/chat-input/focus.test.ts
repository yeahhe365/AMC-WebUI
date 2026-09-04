import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAT_INPUT_TEXTAREA_SELECTOR } from '@/constants/layout';
import { focusChatInput } from './focus';

describe('focusChatInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('focuses the chat input textarea after the delay', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    document.body.appendChild(textarea);
    const focusSpy = vi.spyOn(textarea, 'focus');

    focusChatInput(0);
    vi.runOnlyPendingTimers();

    expect(document.querySelector(CHAT_INPUT_TEXTAREA_SELECTOR)).toBe(textarea);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('places the caret at the end of the value when requested', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    textarea.value = '请使用 Live Artifacts\n';
    document.body.appendChild(textarea);
    const selectionSpy = vi.spyOn(textarea, 'setSelectionRange');

    focusChatInput(0, { caret: 'end' });
    vi.runOnlyPendingTimers();

    expect(selectionSpy).toHaveBeenCalledWith(textarea.value.length, textarea.value.length);
    expect(textarea.scrollTop).toBe(textarea.scrollHeight);
  });

  it('ignores delayed focus after the document has been torn down', () => {
    const originalDocument = document;
    focusChatInput(0);
    vi.stubGlobal('document', undefined);

    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
    vi.stubGlobal('document', originalDocument);
  });

  it('does not steal focus while the user is editing inside the history sidebar', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    document.body.appendChild(textarea);

    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-history-sidebar-root', 'true');
    const renameInput = document.createElement('input');
    sidebar.appendChild(renameInput);
    document.body.appendChild(sidebar);
    renameInput.focus();

    const focusSpy = vi.spyOn(textarea, 'focus');

    focusChatInput(0);
    vi.runOnlyPendingTimers();

    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(renameInput);
  });

  it('still focuses the chat input when focus is outside the sidebar', () => {
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    document.body.appendChild(textarea);

    const outsideInput = document.createElement('input');
    document.body.appendChild(outsideInput);
    outsideInput.focus();

    const focusSpy = vi.spyOn(textarea, 'focus');

    focusChatInput(0);
    vi.runOnlyPendingTimers();

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the chat input when a sidebar link is focused (New Chat click)', () => {
    // Regression: clicking the "New Chat" link in the sidebar makes the anchor
    // the activeElement. The guard must not treat a non-editable link as an
    // in-progress rename and swallow the focus.
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    textarea.value = 'hello';
    document.body.appendChild(textarea);

    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-history-sidebar-root', 'true');
    const newChatLink = document.createElement('a');
    newChatLink.setAttribute('href', '#');
    sidebar.appendChild(newChatLink);
    document.body.appendChild(sidebar);
    newChatLink.focus();

    const focusSpy = vi.spyOn(textarea, 'focus');

    focusChatInput(0);
    vi.runOnlyPendingTimers();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
  });

  it('does not steal focus while editing inside a sidebar contenteditable', () => {
    // jsdom cannot focus a contenteditable span (span.focus() leaves
    // activeElement on body), so this exercises the isContentEditable guard by
    // stubbing the property AND the focus, mirroring a real browser where the
    // editable span is the activeElement while its rename input is edited.
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-chat-input-textarea', 'true');
    document.body.appendChild(textarea);

    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-history-sidebar-root', 'true');
    const rename = document.createElement('span');
    rename.contentEditable = 'true';
    Object.defineProperty(rename, 'isContentEditable', { configurable: true, value: true });
    sidebar.appendChild(rename);
    document.body.appendChild(sidebar);

    // Pretend the browser focused the editable span.
    Object.defineProperty(document, 'activeElement', { configurable: true, value: rename });

    const focusSpy = vi.spyOn(textarea, 'focus');

    focusChatInput(0);
    vi.runOnlyPendingTimers();

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('silently returns when no chat textarea exists, even with a sidebar link focused', () => {
    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-history-sidebar-root', 'true');
    const newChatLink = document.createElement('a');
    newChatLink.setAttribute('href', '#');
    sidebar.appendChild(newChatLink);
    document.body.appendChild(sidebar);
    newChatLink.focus();

    expect(() => {
      focusChatInput(0);
      vi.runOnlyPendingTimers();
    }).not.toThrow();
  });
});
