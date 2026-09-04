export type SyncMessage =
  | { type: 'SETTINGS_UPDATED' }
  | { type: 'SESSIONS_UPDATED' }
  | { type: 'GROUPS_UPDATED' }
  | { type: 'SESSION_CONTENT_UPDATED'; sessionId: string }
  | {
      type: 'SESSION_LOADING';
      sessionId: string;
      isLoading: boolean;
      /** Tab that owns the generation; used for stale cleanup and abort routing. */
      originId?: string;
      ts?: number;
    }
  | { type: 'ABORT_GENERATION'; sessionId: string; originId: string }
  | { type: 'PERSISTED_STATE_UPDATED'; storageKey: string; originId: string }
  | { type: 'SESSION_COMPLETED'; sessionId: string; outcome: 'success' | 'error' }
  | { type: 'SESSION_VIEWED'; sessionId: string };
