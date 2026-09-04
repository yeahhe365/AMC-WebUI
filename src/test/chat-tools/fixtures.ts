import { vi } from 'vitest';
import type { ChatToolToggleStates, ToggleableChatToolId } from '@/types/chatTools';

type ChatToolEnabledFlags = Partial<Record<ToggleableChatToolId, boolean>>;
const TOGGLEABLE_CHAT_TOOL_IDS = [
  'googleSearch',
  'googleMaps',
  'deepSearch',
  'codeExecution',
  'localPython',
  'urlContext',
  'alwaysKeepThinking',
] as const;

// Mirrors useChatInputToolStates: every toggleable tool gets an onToggle, so
// menu/slash availability filtering (not missing handlers) decides visibility.
export const createChatToolToggleStates = (overrides: ChatToolToggleStates = {}): ChatToolToggleStates => ({
  googleSearch: { isEnabled: false, onToggle: vi.fn() },
  googleMaps: { isEnabled: false, onToggle: vi.fn() },
  deepSearch: { isEnabled: false, onToggle: vi.fn() },
  codeExecution: { isEnabled: false, onToggle: vi.fn() },
  localPython: { isEnabled: false, onToggle: vi.fn() },
  urlContext: { isEnabled: false, onToggle: vi.fn() },
  alwaysKeepThinking: { isEnabled: false, onToggle: vi.fn() },
  ...overrides,
});

export const createChatToolToggleStatesFromFlags = (enabled: ChatToolEnabledFlags = {}): ChatToolToggleStates =>
  createChatToolToggleStates(
    TOGGLEABLE_CHAT_TOOL_IDS.reduce<ChatToolToggleStates>((states, toolId) => {
      states[toolId] = { isEnabled: !!enabled[toolId], onToggle: vi.fn() };
      return states;
    }, {}),
  );
