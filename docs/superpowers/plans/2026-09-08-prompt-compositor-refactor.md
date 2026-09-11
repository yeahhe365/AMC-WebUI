# Prompt Compositor Refactor Implementation Plan

Refactor AMC-WebUI prompt and tool instruction management from single-value string clobbering to layered composition. Separate user custom instructions from application feature protocols (Live Artifacts, BBox, HD Guide) and dynamic tool/media directives.

## Proposed Changes

### 1. Types and Defaults

- **File**: `src/types/settings.ts`
  - Add `VisionPromptMode = 'bbox' | 'hdGuide' | null`
  - Add `isLiveArtifactsEnabled?: boolean` and `visionPromptMode?: VisionPromptMode` to `ChatSettings` and `AppSettings`.
- **File**: `src/constants/settingsDefaults.ts`
  - Add `isLiveArtifactsEnabled: false` and `visionPromptMode: null` to `DEFAULT_CHAT_SETTINGS`.

### 2. Prompt Compositor Module

- **File**: `src/features/prompts/promptCompositor.ts`
  - Pure function `composeSystemInstruction(context)`:
    - Layer 1: User custom instruction (with legacy markers stripped if present)
    - Layer 2: Feature protocols (Live Artifacts, BBox, HD Guide)
    - Layer 3: Tool directives (Deep Search, Local Python)
    - Layer 4: Media locate directives (PDF/video timestamp markers)
    - Joining non-empty parts with `\n\n`.
  - Helper `stripFeatureMarkers(instruction: string)` to clean legacy embedded markers from user prompts.
- **File**: `src/features/prompts/promptCompositor.test.ts`
  - Comprehensive unit tests covering every combination, precedence, and legacy backward-compatibility.

### 3. API Request Assembly

- **File**: `src/features/message-sender/standardChatApiCall.ts`
  - Use `composeSystemInstruction` to build `effectiveSystemInstruction`.
  - Avoid wiping `baseInstruction` when media locate directives are active; let compositor handle safe composition.
- **File**: `src/services/api/generationConfig.ts`
  - Update prompt merging in `buildGenerationConfigFromOptions` to avoid double-appending Deep Search / Local Python if already handled by compositor.

### 4. Hook & Settings Decoupling

- **File**: `src/utils/media-nav/mediaNavSettings.ts`
  - When media navigation opens, only toggle `isLiveArtifactsEnabled: false` (or let compositor omit it) without wiping `systemInstruction` to `DEFAULT_SYSTEM_INSTRUCTION`.
- **File**: `src/utils/live-artifacts/liveArtifactsMode.ts`
  - Update `isLiveArtifactsModeFromSettings` to prioritize `isLiveArtifactsEnabled` boolean before falling back to string checks.
- **File**: `src/hooks/app/useAppPromptModes.ts`
  - Decouple `handleLoadLiveArtifactsPromptAndSave` and `setCodePromptModeSettings` so they update boolean flags instead of wiping the user's custom instruction.

### 5. Verification

- Run Vitest test suites:
  - `promptCompositor.test.ts`
  - `promptRegistry.test.ts`
  - `generationConfig.test.ts`
  - `useAppPromptModes.test.tsx`
  - `standardChatApiCall.test.ts`
