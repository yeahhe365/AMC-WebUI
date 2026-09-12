import type { ChatSettings } from './settings';

export type ChatToolId =
  'deepSearch' | 'googleSearch' | 'googleMaps' | 'codeExecution' | 'urlContext' | 'alwaysKeepThinking' | 'tokenCount';

export type ToggleableChatToolId = Extract<
  ChatToolId,
  'deepSearch' | 'googleSearch' | 'googleMaps' | 'codeExecution' | 'urlContext' | 'alwaysKeepThinking'
>;

export interface ChatToolToggleState {
  isEnabled: boolean;
  onToggle?: () => void;
}

export type ChatToolToggleStates = Partial<Record<ToggleableChatToolId, ChatToolToggleState>>;

export interface ChatToolUtilityActions {
  onCountTokens: () => void;
}

export type ChatToolSettingKey = Extract<
  keyof ChatSettings,
  | 'isDeepSearchEnabled'
  | 'isGoogleSearchEnabled'
  | 'isGoogleMapsEnabled'
  | 'isCodeExecutionEnabled'
  | 'isUrlContextEnabled'
  | 'alwaysKeepThinkingInContext'
>;
