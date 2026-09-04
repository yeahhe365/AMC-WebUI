import { describe, expect, it } from 'vitest';
import {
  CHAT_INPUT_BUTTON_CLASS,
  ICON_BUTTON_CLASS,
  MESSAGE_BLOCK_BUTTON_CLASS,
  MODAL_CLOSE_BUTTON_CLASS,
  MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS,
  SETTINGS_DANGER_SOLID_BUTTON_CLASS,
  SMALL_ICON_BUTTON_CLASS,
  SMALL_ICON_BUTTON_ROUND_CLASS,
  SMALL_ICON_DANGER_BUTTON_CLASS,
} from './buttonClasses';

describe('CHAT_INPUT_BUTTON_CLASS', () => {
  it('keeps compact tap targets stable by avoiding scale transforms', () => {
    expect(CHAT_INPUT_BUTTON_CLASS).not.toContain('hover:scale');
    expect(CHAT_INPUT_BUTTON_CLASS).not.toContain('active:scale');
  });

  it('keeps compact input buttons neatly sized at 36px square', () => {
    expect(CHAT_INPUT_BUTTON_CLASS).toContain('h-9');
    expect(CHAT_INPUT_BUTTON_CLASS).toContain('w-9');
  });

  it('uses color-only transitions so composer controls do not feel sluggish', () => {
    expect(CHAT_INPUT_BUTTON_CLASS).toContain('transition-colors');
    expect(CHAT_INPUT_BUTTON_CLASS).not.toContain('transition-all');
  });
});

describe('MESSAGE_BLOCK_BUTTON_CLASS', () => {
  it('keeps compact message block buttons at least 44px square for touch', () => {
    expect(MESSAGE_BLOCK_BUTTON_CLASS).toContain('min-h-11');
    expect(MESSAGE_BLOCK_BUTTON_CLASS).toContain('min-w-11');
  });

  it('shows a visible focus ring for keyboard users', () => {
    expect(MESSAGE_BLOCK_BUTTON_CLASS).toContain('focus-visible:ring-2');
    expect(MESSAGE_BLOCK_BUTTON_CLASS).toContain('focus-visible:ring-[var(--theme-border-focus)]');
  });
});

describe('icon button helper classes', () => {
  it('keeps modal and utility icon buttons centralized', () => {
    expect(ICON_BUTTON_CLASS).toContain('rounded-lg');
    expect(MODAL_CLOSE_BUTTON_CLASS).toContain('rounded-full');
    expect(MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS).toContain('hover:text-[var(--theme-text-danger)]');
    expect(SMALL_ICON_BUTTON_CLASS).toContain('rounded-md');
    expect(SMALL_ICON_BUTTON_ROUND_CLASS).toContain('rounded-full');
    expect(SMALL_ICON_DANGER_BUTTON_CLASS).toContain('hover:text-[var(--theme-text-danger)]');
  });
});

describe('SETTINGS_DANGER_SOLID_BUTTON_CLASS', () => {
  it('builds the solid danger action from theme tokens, not hardcoded reds', () => {
    expect(SETTINGS_DANGER_SOLID_BUTTON_CLASS).toContain('bg-[var(--theme-bg-danger)]');
    expect(SETTINGS_DANGER_SOLID_BUTTON_CLASS).toContain('hover:bg-[var(--theme-bg-danger-hover)]');
    expect(SETTINGS_DANGER_SOLID_BUTTON_CLASS).not.toMatch(/(?:^|\s)(?:from|to|bg)-red-\d/);
  });
});
