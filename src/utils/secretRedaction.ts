import type { AppSettings, ChatSettings, ThirdPartyConnection } from '@/types';

/**
 * Placeholder written into exported files in place of API key material.
 * Exports (settings JSON, chat history JSON) are meant to be shareable, so no
 * raw key may ever appear in them; the import path replaces this sentinel with
 * the locally stored value where possible.
 */
export const REDACTED_SECRET_SENTINEL = '__REDACTED_SECRET__';

/**
 * 凭据字段的**单一清单**：`AppSettings` 里任何一个"导出即等于交出密钥"的字段
 * 都必须登记在这里，`redactExportedAppSettings` / `restoreRedactedSecrets` 都只
 * 遍历这份清单，不再逐个字段手写。
 *
 * 用编译期护栏锁住：`CREDENTIAL_FIELD_COVERAGE` 的类型是从 `keyof AppSettings`
 * 里按"名字像凭据 + 取值是字符串"推导出来的，漏登记一个新字段会直接编译报错。
 */
export const APP_SETTINGS_CREDENTIAL_FIELDS = [
  'apiKey',
  'lockedApiKey',
  'serverAccessPassword',
  'liveApiKey',
  'tokenCalculatorApiKey',
  'embeddingApiKey',
] as const satisfies readonly (keyof AppSettings)[];

type AppSettingsCredentialField = (typeof APP_SETTINGS_CREDENTIAL_FIELDS)[number];

/**
 * AppSettings 中"名字像凭据且取值是字符串"的字段。
 * 取值类型过滤掉了 `maxOutputTokens`(number)、`showMessageTokenStats`(boolean)、
 * `missingApiKey`(boolean) 这类同名的非凭据字段。
 */
type CredentialishAppSettingsField = {
  [K in keyof AppSettings]-?: K extends string
    ? Exclude<AppSettings[K], null | undefined> extends string
      ? Lowercase<K> extends
          | `${string}apikey${string}`
          | `${string}password${string}`
          | `${string}secret${string}`
          | `${string}token${string}`
        ? K
        : never
      : never
    : never;
}[keyof AppSettings];

/** 编译期护栏：新增凭据字段却忘了登记 → 这里缺 key → 编译失败。 */
const CREDENTIAL_FIELD_COVERAGE: Record<CredentialishAppSettingsField, AppSettingsCredentialField> = {
  apiKey: 'apiKey',
  lockedApiKey: 'lockedApiKey',
  serverAccessPassword: 'serverAccessPassword',
  liveApiKey: 'liveApiKey',
  tokenCalculatorApiKey: 'tokenCalculatorApiKey',
  embeddingApiKey: 'embeddingApiKey',
};

const redactCredentialFields = (settings: AppSettings): AppSettings => {
  const redacted: AppSettings = { ...settings };
  for (const field of APP_SETTINGS_CREDENTIAL_FIELDS) {
    if (redacted[field]) {
      redacted[field] = REDACTED_SECRET_SENTINEL;
    }
  }
  return redacted;
};

const restoreCredentialFields = (imported: AppSettings, current: AppSettings): AppSettings => {
  const restored: AppSettings = { ...imported };
  for (const field of APP_SETTINGS_CREDENTIAL_FIELDS) {
    if (restored[field] === REDACTED_SECRET_SENTINEL) {
      restored[field] = current[field] ?? null;
    }
  }
  return restored;
};

const redactConnectionApiKey = (connection: ThirdPartyConnection): ThirdPartyConnection => ({
  ...connection,
  apiKey: connection.apiKey ? REDACTED_SECRET_SENTINEL : connection.apiKey,
});

export const redactExportedAppSettings = (settings: AppSettings): AppSettings => {
  const redacted = redactCredentialFields(settings);
  return {
    ...redacted,
    thirdPartyApi: {
      ...redacted.thirdPartyApi,
      connections: (redacted.thirdPartyApi?.connections ?? []).map(redactConnectionApiKey),
    },
  };
};

/**
 * Re-import counterpart to `redactExportedAppSettings`: a redacted credential
 * keeps the locally stored value, and a redacted connection key keeps the local
 * key of the same connection (matched by id). Unknown connections get null
 * rather than a sentinel that would later be sent to a provider as a key.
 */
export const restoreRedactedSecrets = (imported: AppSettings, current: AppSettings): AppSettings => {
  const restored = restoreCredentialFields(imported, current);
  return {
    ...restored,
    thirdPartyApi: {
      ...restored.thirdPartyApi,
      connections: (restored.thirdPartyApi?.connections ?? []).map((connection) => {
        if (connection.apiKey !== REDACTED_SECRET_SENTINEL) {
          return connection;
        }
        const existing = current.thirdPartyApi?.connections.find((candidate) => candidate.id === connection.id);
        return { ...connection, apiKey: existing?.apiKey ?? null };
      }),
    },
  };
};

export const redactExportedSessionSettings = (settings: ChatSettings): ChatSettings => ({
  ...settings,
  lockedApiKey: settings.lockedApiKey ? REDACTED_SECRET_SENTINEL : settings.lockedApiKey,
});

// 这份护栏只在类型层面生效，这里显式消费一次，避免被 noUnusedLocals 判成死代码。
void CREDENTIAL_FIELD_COVERAGE;
