import type { ChatSettings } from '@/types';
import type { MediaNavKind } from '@/stores/mediaNavStore';
import { isLiveArtifactsSystemInstruction } from '@/features/prompts/promptRegistry';
import { DEFAULT_SYSTEM_INSTRUCTION } from '@/constants/settingsDefaults';

/**
 * Returns true if any media navigation mode is currently enabled in settings.
 */
export const hasActiveMediaNavSettings = (settings: Partial<ChatSettings>): boolean =>
  Boolean(
    settings.isPdfNavEnabled || settings.isVideoNavEnabled || settings.isAudioNavEnabled || settings.isImageNavEnabled,
  );

export interface ApplyMediaNavOptions {
  /** If true, keep other already-enabled media navigation flags active (for multi-media sessions). Default is false. */
  preserveOtherMediaKinds?: boolean;
}

/**
 * Immutably updates ChatSettings with an active media navigation kind (or none if null).
 * When options.preserveOtherMediaKinds is true, enables the requested kind while preserving other active kinds.
 * Mutually exclusive Live Artifacts system instruction is reset to default when enabling any media kind.
 */
export const applyMediaNavKindToSettings = <T extends ChatSettings>(
  prev: T,
  kind: MediaNavKind | null,
  options?: ApplyMediaNavOptions,
): T => {
  if (kind === null) {
    return {
      ...prev,
      isPdfNavEnabled: false,
      isVideoNavEnabled: false,
      isAudioNavEnabled: false,
      isImageNavEnabled: false,
    };
  }

  const preserve = Boolean(options?.preserveOtherMediaKinds);

  return {
    ...prev,
    isPdfNavEnabled: kind === 'pdf' ? true : preserve ? Boolean(prev.isPdfNavEnabled) : false,
    isVideoNavEnabled: kind === 'video' ? true : preserve ? Boolean(prev.isVideoNavEnabled) : false,
    isAudioNavEnabled: kind === 'audio' ? true : preserve ? Boolean(prev.isAudioNavEnabled) : false,
    isImageNavEnabled: kind === 'image' ? true : preserve ? Boolean(prev.isImageNavEnabled) : false,
    isLiveArtifactsEnabled: false,
    ...(isLiveArtifactsSystemInstruction(prev.systemInstruction)
      ? { systemInstruction: DEFAULT_SYSTEM_INSTRUCTION }
      : {}),
  };
};
