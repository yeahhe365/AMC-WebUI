import { type ChatSettings, type MediaResolution } from './settings';
import type { Part } from '@google/genai';

export interface VideoMetadata {
  startOffset?: string;
  endOffset?: string;
  fps?: number;
}

export type FileTransferStrategy = 'inline' | 'files-api' | 'remote-file-id' | 'auto';

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;

  // PRIMARY DATA SOURCE:
  // A standard Blob or File object.
  // This is stored in IndexedDB and used for API uploads.
  // It should ALWAYS be present for binary files.
  rawFile?: File | Blob;

  // UI DISPLAY:
  // A temporary `blob:` URL created via URL.createObjectURL(rawFile).
  // This is used for <img> tags and previews.
  // It is ephemeral and revoked on session unload.
  // It should NOT contain a Base64 data URI string.
  dataUrl?: string;

  textContent?: string;
  isProcessing?: boolean;
  progress?: number;
  error?: string;

  // Gemini Files API metadata for uploaded media and documents.
  fileUri?: string;
  fileApiName?: string;
  fileApiExpirationTime?: string;
  /** Fingerprint of the API key the file was uploaded (or last verified) with — Files API access is scoped to that key's project. */
  fileApiKeyFingerprint?: string;
  transferStrategy?: FileTransferStrategy;
  uploadState?: 'pending' | 'uploading' | 'processing_api' | 'active' | 'failed' | 'cancelled';
  /** When true, history replay emits a protocol omission note instead of file bytes. */
  omittedFromApiHistory?: boolean;
  abortController?: AbortController;
  uploadSpeed?: string;
  videoMetadata?: VideoMetadata;
  mediaResolution?: MediaResolution;
}

export interface PersistedSessionFileRecord {
  id: string;
  sessionId: string;
  messageId: string;
  name: string;
  type: string;
  rawFile: Blob;
}

export interface InputCommand {
  text: string;
  id: number;
  mode?: 'replace' | 'append' | 'quote' | 'insert';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'error';
  content: string;
  files?: UploadedFile[];
  timestamp: Date;
  thoughts?: string;
  isLoading?: boolean;
  generationStartTime?: Date;
  generationEndTime?: Date;
  thinkingTimeMs?: number;
  firstTokenTimeMs?: number;
  // True while the model is actively reasoning (interleaved code-execution
  // round trips and resumed thinking keep it true); the thinking strip keys
  // off this so re-entered thinking re-shows instead of staying collapsed.
  thinkingActive?: boolean;
  // Source of the thinking text, recorded the first time a thought arrives.
  // Third-party streams are forced into the flat strip (5-line scroll, no
  // titles) regardless of content, so a markdown header in third-party
  // reasoning can never masquerade as a Gemini sectioned stream.
  thinkingSource?: 'gemini' | 'third-party';
  promptTokens?: number;
  cachedPromptTokens?: number;
  completionTokens?: number;
  toolUsePromptTokens?: number;
  totalTokens?: number;
  thoughtTokens?: number;
  cumulativeTotalTokens?: number;
  audioSrc?: string;
  audioAutoplay?: boolean;
  groundingMetadata?: unknown;
  urlContextMetadata?: unknown;
  suggestions?: string[];
  isGeneratingSuggestions?: boolean;
  stoppedByUser?: boolean;
  thoughtSignatures?: string[];
  excludeFromContext?: boolean;
  apiParts?: Part[]; // Preserves raw API parts for either user or model turns.
  isInternalToolMessage?: boolean; // Hidden client-side tool plumbing turn used to rebuild API context.
  toolParentMessageId?: string; // Visible model message ID associated with an internal tool turn.
}

export type ContentPart = Part;

export interface ChatGroup {
  id: string;
  title: string;
  timestamp: number;
  isPinned?: boolean;
  isExpanded?: boolean;
  orderKey?: string;
}

export interface SavedChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  settings: ChatSettings;
  isPinned?: boolean;
  groupId?: string | null;
  createdTabId?: string; // for tab-isolated empty session reuse
  /**
   * Title origin:
   * - 'default': heuristic title or 'New Chat' (may be overwritten by auto-titling)
   * - 'auto': AI-generated title (never auto-titled again)
   * - 'manual': user-renamed / scenario / fork / copy title (never auto-titled again)
   * - undefined: legacy session — eligibility inferred from the heuristic (see isSessionAutoTitleEligible)
   */
  titleSource?: 'default' | 'auto' | 'manual';
}

export interface PreloadedMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

/**
 * Semantic category for a scenario. Drives the icon, accent color and the
 * category filter in the scenarios library. Defaults to `'custom'`.
 */
export type ScenarioCategory =
  'coding' | 'creative' | 'workplace' | 'academic' | 'roleplay' | 'system' | 'custom' | 'assistant';

export interface SavedScenario {
  id: string;
  title: string;
  messages: PreloadedMessage[];
  systemInstruction?: string;
  description?: string;
  category?: ScenarioCategory;
  emoji?: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  icon?: string;
}

export type AttachmentAction =
  'upload' | 'gallery' | 'camera' | 'recorder' | 'id' | 'url' | 'text' | 'screenshot' | 'folder' | 'zip';

export interface SideViewContent {
  type: 'html' | 'mermaid' | 'graphviz' | 'svg';
  content: string;
  language?: string;
  title?: string;
}
