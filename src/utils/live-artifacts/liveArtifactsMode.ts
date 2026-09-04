import type { LiveArtifactsPromptMode } from '@/types';
import { isLiveArtifactsSystemInstruction } from '@/features/prompts/promptRegistry';

/**
 * Determine if Live Artifacts mode is active from the app settings and
 * current chat settings. This is a convenience wrapper for CommonComponentData.
 *
 * Marker recognition is delegated to promptRegistry.isLiveArtifactsSystemInstruction
 * so every caller (this, useAppPromptModes, ...) agrees on which markers count —
 * including legacy Live Artifacts / Canvas markers. This only adds the
 * override-prompt comparisons on top of that shared baseline.
 */
export function isLiveArtifactsModeFromSettings(args: {
  systemInstruction?: string | null;
  promptMode?: LiveArtifactsPromptMode | null;
  liveArtifactsSystemPrompt?: string | null;
  liveArtifactsSystemPrompts?: Partial<Record<LiveArtifactsPromptMode, string>> | null;
}): boolean {
  const { systemInstruction, promptMode, liveArtifactsSystemPrompt, liveArtifactsSystemPrompts } = args;

  if (!systemInstruction) return false;

  if (isLiveArtifactsSystemInstruction(systemInstruction)) {
    return true;
  }

  if (promptMode && liveArtifactsSystemPrompts) {
    const overridePrompt = liveArtifactsSystemPrompts[promptMode];
    if (overridePrompt?.trim() && systemInstruction.trim() === overridePrompt.trim()) {
      return true;
    }
  }

  if (liveArtifactsSystemPrompt?.trim() && systemInstruction.trim() === liveArtifactsSystemPrompt.trim()) {
    return true;
  }

  return false;
}
