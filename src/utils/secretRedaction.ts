import type { AppSettings, ChatSettings, ThirdPartyConnection } from '@/types';

/**
 * Placeholder written into exported files in place of API key material.
 * Exports (settings JSON, chat history JSON) are meant to be shareable, so no
 * raw key may ever appear in them; the import path replaces this sentinel with
 * the locally stored value where possible.
 */
export const REDACTED_SECRET_SENTINEL = '__REDACTED_SECRET__';

const redactConnectionApiKey = (connection: ThirdPartyConnection): ThirdPartyConnection => ({
  ...connection,
  apiKey: connection.apiKey ? REDACTED_SECRET_SENTINEL : connection.apiKey,
});

export const redactExportedAppSettings = (settings: AppSettings): AppSettings => ({
  ...settings,
  apiKey: settings.apiKey ? REDACTED_SECRET_SENTINEL : settings.apiKey,
  thirdPartyApi: {
    ...settings.thirdPartyApi,
    connections: (settings.thirdPartyApi?.connections ?? []).map(redactConnectionApiKey),
  },
});

/**
 * Re-import counterpart to `redactExportedAppSettings`: a redacted Gemini key
 * keeps the locally stored key, and a redacted connection key keeps the local
 * key of the same connection (matched by id). Unknown connections get null
 * rather than a sentinel that would later be sent to a provider as a key.
 */
export const restoreRedactedSecrets = (imported: AppSettings, current: AppSettings): AppSettings => ({
  ...imported,
  apiKey: imported.apiKey === REDACTED_SECRET_SENTINEL ? (current.apiKey ?? null) : imported.apiKey,
  thirdPartyApi: {
    ...imported.thirdPartyApi,
    connections: (imported.thirdPartyApi?.connections ?? []).map((connection) => {
      if (connection.apiKey !== REDACTED_SECRET_SENTINEL) {
        return connection;
      }
      const existing = current.thirdPartyApi?.connections.find((candidate) => candidate.id === connection.id);
      return { ...connection, apiKey: existing?.apiKey ?? null };
    }),
  },
});

export const redactExportedSessionSettings = (settings: ChatSettings): ChatSettings => ({
  ...settings,
  lockedApiKey: settings.lockedApiKey ? REDACTED_SECRET_SENTINEL : settings.lockedApiKey,
});
