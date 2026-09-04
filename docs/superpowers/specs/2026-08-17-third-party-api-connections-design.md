# Third-party API connections

Date: 2026-08-17  
Status: draft, awaiting review before implementation plan

Chooser decisions (canvas `third-party-api-chooser`):

| Decision                              | Choice                                                          |
| ------------------------------------- | --------------------------------------------------------------- |
| Audience                              | Official vendor keys **and** gateways                           |
| Settings shape                        | **B. Connection list + templates** (Gemini stays its own block) |
| Fetch `/models` then import           | Yes                                                             |
| Same template, multiple connections   | Yes                                                             |
| Protocol picker on custom connections | OpenAI-compatible **or** Anthropic                              |
| Extra request headers                 | Yes (advanced)                                                  |
| Azure / Vertex in v1                  | **No**                                                          |

## 1. Goal

Replace the closed 8-slot provider map (`openai` … `custom`) with an open **connection** list. Official presets still exist, but only as **create templates**. Unused vendors do not occupy the settings page. Two NewAPI gateways, OpenRouter, and a direct Anthropic key can all exist at once.

Gemini native (Live, Files API, tools, proxy URL) stays a separate block on the same API tab. It is not a third-party connection in v1.

## 2. Non-goals (v1)

- Azure OpenAI (deployment name, `api-version`) and Vertex AI.
- Treating Gemini `generateContent` / Live as a third-party connection.
- Encrypting keys at rest (they already live in the IndexedDB settings blob).
- Redesigning the Models tab’s Gemini catalog editor.
- Moving Files API strategy off the API tab (leave it; do not expand it).

## 3. Target mental model

A **connection** is one reachable endpoint:

- user-visible name (`家里 NewAPI`, `OpenRouter`)
- wire protocol (`openai-compatible` \| `anthropic`)
- base URL (no `/chat/completions` or `/models` suffix)
- credentials (newline/comma-separated keys, rotated **per connection**)
- optional extra headers
- model catalog (`id` + display name)
- enabled flag

A **template** only pre-fills protocol, default base URL, logo, and a starter model list. Creating from the OpenAI template twice yields two connections.

A **session** routes by `(connectionId, modelId)`. Never by “first enabled list that contains this model id.”

## 4. Data model

Replace `ThirdPartyApiSettings.providers: Record<ThirdPartyProviderId, ThirdPartyProviderConfig>` with:

```ts
type ThirdPartyApiProtocol = 'openai-compatible' | 'anthropic';

type ThirdPartyTemplateId =
  'openai' | 'deepseek' | 'anthropic' | 'openrouter' | 'qwen' | 'kimi' | 'glm' | 'custom-openai' | 'custom-anthropic';

interface ThirdPartyConnection {
  id: string; // stable; see migration
  name: string;
  templateId: ThirdPartyTemplateId;
  protocol: ThirdPartyApiProtocol;
  apiKey: string | null;
  baseUrl: string | null;
  extraHeaders: Record<string, string>; // empty object if unused
  modelId: string; // connection-test / fallback model
  models: ModelOption[];
  enabled: boolean;
}

interface ThirdPartyApiSettings {
  connections: ThirdPartyConnection[];
}
```

Keep `THIRD_PARTY_TEMPLATE_IDS` (today’s vendor ids, plus split custom) as the template catalog only. Do not keep a persisted record keyed by those ids.

`ChatSettings.providerId`:

- `gemini-native` → Gemini route
- any other non-empty string → look up `connections.find(c => c.id === providerId)`
- `normalizeProviderId` **must accept arbitrary connection ids** (UUIDs). Today it drops anything not in the 8-id union, which would silently re-route new connections to Gemini.

Legacy session tag `openai-compatible` still normalizes away (treat as missing → Gemini / modelId fallback), same as today.

`ModelOption.providerId` on catalog entries is the **connection id**, not the template id.

Default settings: `thirdPartyApi: { connections: [] }`. No ghost OpenAI/DeepSeek rows.

### 4.1 Proxy header vs connection id

Docker `THIRD_PARTY_ROUTES` is keyed by template names (`openai`, `deepseek`, …). Browser requests must send:

- `x-third-party-provider`: **templateId** (map `custom-openai` / `custom-anthropic` → `custom`, unknown → `custom`)
- `x-third-party-base-url`: connection `baseUrl` (existing BYOK path)
- connection `id` is **not** the proxy route key

## 5. Migration

Run inside `sanitizeThirdPartyApiSettings` (load and save), idempotent.

1. If input already has `connections` (array), sanitize that array and **ignore** `providers`.
2. Else if input has `providers` (legacy map):
   - Walk the eight old ids in the current fixed order.
   - Materialize a connection when **any** of: `enabled === true`, non-empty `apiKey`, `baseUrl` differs from that id’s default, or `models` differs from that id’s default.
   - Connection `id` = old provider id (`openai`, `custom`, …) so existing sessions keep routing.
   - `name` = current label (OpenAI, Custom, …).
   - `templateId`: `custom` → `custom-openai` (old custom was openai-compatible only); others keep their id.
   - `extraHeaders`: `{}`.
   - Skip untouched default disabled slots so the new UI stays empty for fresh users who never opened third-party.
3. Also keep `migrateLegacyOpenAICompatibleInput` (flat `openaiCompatible*` → `providers.openai`) **before** this step, so the oldest shape still lands.

After one successful save, persisted settings contain only `connections`.

Disabled-but-migrated connections remain in the list (user can enable). Sessions whose `providerId` points at a skipped (never-migrated) id resolve as **unavailable third-party**, not silent Gemini.

## 6. Routing

`resolveChatApiRoute`:

1. `providerId === gemini-native` or missing Gemini-family modelId with no connection hit → Gemini (keep current Gemini-id protection so a connection cannot shadow `gemini-*` / `gemma-*` when `providerId` is absent).
2. `providerId` set and not Gemini → find connection by **id**. If missing or `enabled === false`, return a third-party route marked **unavailable** (UI: picker shows the name + “不可用”; send is blocked with a clear error). Do **not** fall back to Gemini.
3. Legacy sessions with no `providerId`: scan **enabled** connections for `models[].id === modelId`. If two match, prefer the first in list order and **write `providerId` back** on the next model-select or send prepare so the session becomes explicit.

Header model pick always writes `(providerId: connection.id, modelId)`. Keyboard cycle uses the same composite, never id-only inference.

## 7. Keys, rotation, usage

- `parseApiKeys` stays (newline / comma).
- Rotation index is **per connection**, plus a dedicated Gemini slot. Stop using a single `chatApiKeyLastUsedIndex` for both pools.
  - Suggested localStorage shape: `chatApiKeyLastUsedIndexByTarget` = `{ "__gemini__": number, [connectionId]: number }`.
- `logService.recordApiKeyUsage` for third-party must **not** require `useCustomApiConfig`. Record `connectionId` (and masked key) so Log Viewer can group by connection.
- Duplicate DOM id `api-key-input`: each instance gets a unique `id` (`gemini-api-key-input`, `connection-{id}-api-key-input`).

## 8. Settings UI (API tab)

Keep order: Gemini block → third-party connections → Files strategy.

### Gemini block

Unchanged behavior: custom-config toggle, keys, proxy, Live note, Gemini connection test.

### Third-party block

**Empty state:** short help + primary **添加连接**.

**List:** only existing connections. Each row: name, protocol pill, template logo, Ready / 未配置 / 已关闭, expand chevron, enable toggle.

**Add connection:** dialog or popover of templates (OpenAI, DeepSeek, Anthropic, OpenRouter, Qwen, Kimi, GLM, 自定义 OpenAI 兼容, 自定义 Anthropic). Choosing one appends a connection with unique `id` (`crypto.randomUUID()`), unique default name (`OpenRouter`, then `OpenRouter 2`, …), and template defaults. Expand the new row.

**Expanded row:**

1. Name (editable)
2. Key (existing `ApiKeyInput`, unique id)
3. Base URL + existing suffix warnings + request URL preview (`…/chat/completions` or Anthropic messages URL)
4. Protocol: radio or select, **always visible** (not only on custom). Changing protocol updates URL preview and which send/test/fetch helper runs. Built-in templates start with their default protocol; user may override (e.g. a “DeepSeek” card pointed at an Anthropic-compatible proxy).
5. Model catalog editor
6. Advanced (collapsed): extra header name/value rows; add/remove
7. Test connection using this connection’s `modelId` (or first catalog id)

Remove the eight always-visible vendor cards.

Copy to delete: i18n strings that still describe a global “OpenAI-compatible mode” vs Gemini (`settingsOpenAICompatibleToggleHelp`, search catalog `settingsApiModeLabel` / `settingsApiModeThirdParty`). Replace with connection-oriented labels.

### Model catalog editor

Wire `onFetchModelsForImportPreview` in the production panel (today the editor supports it; `ThirdPartyApiSettingsPanel` does not pass it).

- Button **获取模型列表** enabled when key + base URL present and protocol is `openai-compatible`.
- Anthropic v1: no standard `/v1/models` in the same shape — hide fetch, keep manual id + batch paste.
- Fetch uses that connection’s key, base URL, templateId header, extra headers.
- Preview → checkbox import (existing manager modal). Do not auto-replace the whole list.

## 9. Header model picker

`buildProviderAwareModelList` / `modelCatalog`:

- Group **per connection name**, not per template. Two NewAPI connections are two groups even if both are `custom-openai`.
- Enabled connections with zero models do not appear.
- Enabled connections with no key still appear, with a “未配置密钥” affordance; send already fails — keep the badge, do not hide the models (user may be filling keys next).
- Unavailable connection (deleted/disabled) still used by the active session: show the current model in a disabled/error group, prompt to pick another.

Third-party entries do not show Live / Files / Search as available. Keep using existing capability helpers; do not pretend Gemini tools exist on OpenAI-compatible routes.

## 10. Extra headers

- UI: advanced rows, `Record<string, string>`, trim keys, drop empty.
- Direct browser fetch: merge onto `createRequestInit` / Anthropic equivalent.
- Docker proxy: do not rely on the browser setting arbitrary headers through `/api/openai`. Send `x-third-party-extra-headers` as JSON. Proxy parses, allowlists, applies to **upstream** only.
- Allowlist v1: `http-referer`, `referer`, `x-title`, `x-openrouter-title`, plus `x-*` except `x-api-key`, `x-third-party-*`. Never forward `host`, `cookie`, `authorization` from this map.
- Reject header names that are not `^[A-Za-z0-9-]+$`.

## 11. Errors and unavailable connections

| Situation             | Behavior                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Connection missing    | Session stays on old `(providerId, modelId)`; composer error: connection removed; do not rewrite to Gemini |
| Connection disabled   | Same, copy says disabled                                                                                   |
| No key                | Existing “API Key not configured.”, already translated                                                     |
| Fetch models fails    | Inline error on the connection card; catalog unchanged                                                     |
| Test connection fails | Existing tester error; does not disable the connection                                                     |

## 12. Tests that must move with the design

- `sanitizeThirdPartyApiSettings`: legacy map → connections; already-connections pass-through; skip default empty slots.
- `normalizeProviderId`: UUID and `openai` both survive; `openai-compatible` still dropped.
- `resolveChatApiRoute`: explicit connection id wins; disabled/missing does not become Gemini; two connections sharing `gpt-4o` stay distinct when `providerId` is set.
- `getKeyForRequest`: rotation index isolated per connection vs Gemini.
- `ThirdPartyApiSettingsPanel`: empty state; add from template; fetch models callback invoked; unique key input ids.
- Architecture guard in `namingStructureOptimizations.test.ts` currently requires `THIRD_PARTY_PROVIDER_IDS` and `updateThirdPartyProviderConfig` in the panel — retarget to templates + `updateThirdPartyConnection`.
- `thirdPartyProxy`: extra-headers JSON forwarding; `x-third-party-provider` still a template key, not a UUID.
- Session model select writes connection id.

## 13. Implementation order

1. Types + sanitize/migration + `normalizeProviderId` + route lookup (no UI yet; existing UI still works if we keep a compatibility adapter — prefer a thin adapter `connectionsToLegacyMap` **only** if it unblocks a split PR; otherwise switch store + UI in one slice).
2. Key rotation namespace + usage logging ungated for third-party.
3. Connection list UI + add-template dialog; delete eight-card layout.
4. Wire fetch models; protocol control; URL preview.
5. Extra headers UI + proxy allowlist.
6. Header picker grouping by connection; unavailable session state.
7. i18n / settings search catalog cleanup.

Preferred shipping: one feature branch, stacked commits matching 1–7, not a permanent compatibility map in the UI.

## 14. Risks

- `normalizeProviderId` + Zod `z.enum(CHAT_PROVIDER_IDS)` will strip UUIDs until both are widened. Do this in commit 1.
- Architecture tests pin old identifiers; update in the same PR as the panel rewrite.
- Server route table stays template-keyed; mixing that up with connection UUID would break Docker proxy BYOK.

## 15. Success criteria

- Fresh install: API tab shows Gemini + empty third-party + add button; no eight disabled cards.
- User can add two custom OpenAI-compatible connections with different URLs and use both in different chats.
- Official OpenAI + OpenRouter + Anthropic can be enabled together.
- Fetch models on OpenRouter imports a subset without wiping hand-added ids that were not selected.
- Existing sessions with `providerId: "openai"` still send after migration if that slot had been configured.
- Gemini Live / Files / proxy behavior unchanged.
