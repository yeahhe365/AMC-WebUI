import { describe, expect, it } from 'vitest';
import { applyMediaNavKindToSettings, hasActiveMediaNavSettings } from './mediaNavSettings';
import { DEFAULT_APP_SETTINGS, DEFAULT_SYSTEM_INSTRUCTION } from '@/constants/settingsDefaults';

describe('mediaNavSettings', () => {
  describe('hasActiveMediaNavSettings', () => {
    it('returns false when all media nav settings are false or undefined', () => {
      expect(hasActiveMediaNavSettings({})).toBe(false);
      expect(
        hasActiveMediaNavSettings({
          isPdfNavEnabled: false,
          isVideoNavEnabled: false,
          isAudioNavEnabled: false,
          isImageNavEnabled: false,
        }),
      ).toBe(false);
    });

    it('returns true when any media nav mode is enabled', () => {
      expect(hasActiveMediaNavSettings({ isPdfNavEnabled: true })).toBe(true);
      expect(hasActiveMediaNavSettings({ isVideoNavEnabled: true })).toBe(true);
      expect(hasActiveMediaNavSettings({ isAudioNavEnabled: true })).toBe(true);
      expect(hasActiveMediaNavSettings({ isImageNavEnabled: true })).toBe(true);
    });
  });

  describe('applyMediaNavKindToSettings', () => {
    it('enables the requested kind and disables all other kinds', () => {
      const initial = {
        ...DEFAULT_APP_SETTINGS,
        isPdfNavEnabled: true,
        isVideoNavEnabled: false,
        isAudioNavEnabled: false,
        isImageNavEnabled: false,
      };

      const updated = applyMediaNavKindToSettings(initial, 'video');
      expect(updated.isVideoNavEnabled).toBe(true);
      expect(updated.isPdfNavEnabled).toBe(false);
      expect(updated.isAudioNavEnabled).toBe(false);
      expect(updated.isImageNavEnabled).toBe(false);
    });

    it('disables all kinds when null is passed', () => {
      const initial = {
        ...DEFAULT_APP_SETTINGS,
        isPdfNavEnabled: true,
        isVideoNavEnabled: false,
        isAudioNavEnabled: false,
        isImageNavEnabled: false,
      };

      const updated = applyMediaNavKindToSettings(initial, null);
      expect(updated.isPdfNavEnabled).toBe(false);
      expect(updated.isVideoNavEnabled).toBe(false);
      expect(updated.isAudioNavEnabled).toBe(false);
      expect(updated.isImageNavEnabled).toBe(false);
    });

    it('resets Live Artifacts system instruction to default when enabling a media kind', () => {
      const initial = {
        ...DEFAULT_APP_SETTINGS,
        systemInstruction: '[Live Artifacts Protocol]',
      };

      const updated = applyMediaNavKindToSettings(initial, 'image');
      expect(updated.isImageNavEnabled).toBe(true);
      expect(updated.systemInstruction).toBe(DEFAULT_SYSTEM_INSTRUCTION);
    });

    it('preserves custom system instruction when enabling a media kind', () => {
      const customInstruction = 'Custom instructions for AI';
      const initial = {
        ...DEFAULT_APP_SETTINGS,
        systemInstruction: customInstruction,
      };

      const updated = applyMediaNavKindToSettings(initial, 'audio');
      expect(updated.isAudioNavEnabled).toBe(true);
      expect(updated.systemInstruction).toBe(customInstruction);
    });

    it('preserves other media kinds when preserveOtherMediaKinds is true', () => {
      const initial = {
        ...DEFAULT_APP_SETTINGS,
        isPdfNavEnabled: true,
        isVideoNavEnabled: false,
        isAudioNavEnabled: false,
        isImageNavEnabled: false,
      };

      const updated = applyMediaNavKindToSettings(initial, 'image', { preserveOtherMediaKinds: true });
      expect(updated.isPdfNavEnabled).toBe(true);
      expect(updated.isImageNavEnabled).toBe(true);
      expect(updated.isVideoNavEnabled).toBe(false);
      expect(updated.isAudioNavEnabled).toBe(false);
    });
  });
});
