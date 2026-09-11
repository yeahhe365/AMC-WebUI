import { describe, expect, it, afterEach } from 'vitest';
import { isMacPlatform, getModifierKeySymbol, getAltKeySymbol, getSaveShortcutHint } from './platform';

describe('platform utility', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  });

  const mockNavigator = (platform: string, userAgent: string) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { platform, userAgent },
      configurable: true,
    });
  };

  describe('isMacPlatform', () => {
    it('detects Mac platform from platform property', () => {
      mockNavigator('MacIntel', 'Mozilla/5.0');
      expect(isMacPlatform()).toBe(true);
    });

    it('detects Mac platform from userAgent property', () => {
      mockNavigator('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
      expect(isMacPlatform()).toBe(true);
    });

    it('detects iOS/iPad platforms', () => {
      mockNavigator('iPhone', '');
      expect(isMacPlatform()).toBe(true);

      mockNavigator('iPad', '');
      expect(isMacPlatform()).toBe(true);
    });

    it('returns false for Windows and Linux', () => {
      mockNavigator('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      expect(isMacPlatform()).toBe(false);

      mockNavigator('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)');
      expect(isMacPlatform()).toBe(false);
    });
  });

  describe('shortcut symbols and hints', () => {
    it('returns Mac symbols on Mac platform', () => {
      mockNavigator('MacIntel', '');
      expect(getModifierKeySymbol()).toBe('⌘');
      expect(getAltKeySymbol()).toBe('⌥');
      expect(getSaveShortcutHint()).toBe('⌘ Enter');
    });

    it('returns PC symbols on Windows platform', () => {
      mockNavigator('Win32', '');
      expect(getModifierKeySymbol()).toBe('Ctrl');
      expect(getAltKeySymbol()).toBe('Alt');
      expect(getSaveShortcutHint()).toBe('Ctrl+Enter');
    });
  });
});
