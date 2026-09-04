# MCP Cherry-Studio Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the top gaps vs Cherry Studio: runtime tool-approval gate, usable resources/prompts, multimodal tool results, per-server timeout/longRunning, liveness checks, settings UX batch, composer MCP picker, `?mcp=` share-install.

**Architecture:** All state stays in the existing AppSettings `mcpServers[]` (new optional fields only). Approval gate wraps MCP handlers at declaration-build time (`createMcpClientFunctions`) with a promise-based dialog via a small zustand store. Server-side pool gains ping-before-reuse; callTool options come from new config fields parsed in `parseMcpServer`.

**Tech Stack:** Vite/React 18/zustand/Tailwind/lucide-react; server Node http + @modelcontextprotocol/sdk; vitest via `node scripts/run-vitest.mjs run <files>`.

## Global Constraints

- No git commits this session (user decision).
- i18n: every new UI string needs all 7 languages in `src/i18n/translations/settings/mcp.ts` (+ `chat.ts` for composer); zh/ja use full-width punctuation (`…` not `...`).
- Tests must assert CSS classes not inline mask styles; custom `Select` pattern for dropdowns.
- Verify loop: `pnpm typecheck` → targeted vitest → `pnpm build` → docker compose up --build → curl :8082.

---

### Task 1 — Config fields `timeout` / `longRunning`

**Files:** Modify `shared/mcpServerConfig.ts`, `shared/mcpServerConfig.test.ts`, `src/schemas/appSettingsSchema.ts`.
**Interfaces (produced):**

- `McpServerConfig.timeout?: number` — seconds, integer 1..3600, dropped otherwise.
- `McpServerConfig.longRunning?: boolean`.
- exported `sanitizeMcpTimeout(value: unknown): number | undefined`.

- [x] RED: tests — timeout preserved as int; float/string/negative/0/>3600 dropped; longRunning coerced strict-boolean; both survive schema round-trip.
- [x] GREEN: implement sanitizer + wire into both sanitizers (`sanitizeMcpServerConfig` and inline `sanitizeMcpServers`).

### Task 2 — Server: timeout passthrough, ping-before-reuse, log redaction, env denylist

**Files:** Modify `server/src/mcpClient.ts`, `server/src/mcpRoutes.ts`, `server/src/mcpTypes.ts` (if bridge types), tests in `server/src/mcpClient.test.ts` / `mcpRoutes` tests if present.
**Interfaces:**

- `callTool(server, toolName, args)` uses `{timeout:(server.timeout??60)*1000, resetTimeoutOnProgress: !!server.longRunning, maxTotalTimeout: longRunning?600000:undefined}`.
- `connect` timeout = `Math.max(MCP_REQUEST_TIMEOUT_MS, (server.timeout??0)*1000)` when set.
- Reused session idle >30s gets `client.ping({timeout:5000})`; failure → drop & reconnect (no throw to caller beyond normal retry path).
- `redactSensitiveText(line)` exported from `server/src/mcpRedact.ts`: masks `Bearer xxx`, `sk-…`, `api[_-]?key=…`, `token=…` query values; applied inside `appendLog`.
- stdio env denylist in `parseMcpServer`: keys `/^NODE_OPTIONS$|^LD_PRELOAD$|^LD_LIBRARY_PATH$|^DYLD_/i` → parse error "refuses environment variables".

- [x] RED+GREEN per behavior (fingerprint unchanged; denylist error surfaces in batch errors).

### Task 3 — Model-side result summary + multimodal block rendering

**Files:** Create `src/features/mcp/mcpResultSummary.ts` + test; Modify `src/features/mcp/mcpClientFunctions.ts` (handler wraps `summarizeMcpResultForModel`), `src/components/message/McpToolCallBlock.tsx` (+ test).
**Interfaces:**

- `summarizeMcpResultForModel(result: unknown): unknown` — CallToolResult `{content:[{type:'text'|'image'|'audio'|'resource'|…}]}`: text kept; image/audio/blob/resource replaced by `{type:'text', text:'[Image delivered to user]'}` style placeholders (localized-independent English tag like Cherry); non-content shapes pass through.
- Block renders `content[]` segments: text pretty-printed; image inline `<img src=data:...>`; other → muted placeholder chip. Fallback legacy stringify unchanged.

- [x] RED+GREEN.

### Task 4 — Runtime approval gate

**Files:** Create `src/features/mcp/toolApproval.ts` (+test), `src/stores/mcpApprovalStore.ts`, `src/components/message/McpToolApprovalDialog.tsx` (+test); Modify `src/features/mcp/mcpClientFunctions.ts` (options.requestApproval), `src/features/message-sender/standardChatApiCall.ts` (supply callback), mount dialog near chat root.
**Interfaces:**

- `type McpApprovalDecision = 'allow-once'|'allow-session'|'deny'`
- `requiresApproval(server, toolName): boolean` (pure: in `disabledAutoApproveTools`)
- session set: `isSessionApproved(key)`, `rememberSessionApproval(key)`, `resetSessionApprovals()`, key `${serverId}::${toolName}`
- `requestApproval(req): Promise<McpApprovalDecision>` from store (`openApprovalRequest`) resolved by dialog buttons; abortSignal → resolve 'deny'.
- Handler flow: requires && !sessionApproved → await callback; deny → throw Error('User denied tool execution.'); allow-session → remember.

- [x] RED+GREEN (decision fn pure tests; dialog interaction test; handler wrap test with fake requestApproval).

### Task 5 — Resources/Prompts activation

**Files:** Modify `src/services/api/mcpApi.ts` (+test), `McpResourcesTab.tsx`, `McpPromptsTab.tsx`, `McpSection.tsx` (pass server + wire refresh), i18n mcp.ts ×7.
**Interfaces:**

- `fetchMcpResource(server, uri) => Promise<{result:{contents:Array<{uri,text?,mimeType?,blob?}>}}|null>` POST `/api/mcp/resource {server,uri}`.
- `fetchMcpPrompt(server, promptName, args) => Promise<{result:{messages:Array<{role?,content?}>}}|null>` POST `/api/mcp/prompt {server,promptName,args}`.
- Resources tab rows expandable → Read button → preview first 4000 chars + Copy; Prompts tab → Use button → args inputs (required marked) → Get → show message text → Copy.
- Errors surface inline in tab (existing pattern).

- [x] RED+GREEN (api wrappers with mocked fetch; tabs render/read flows).

### Task 6 — Composer MCP picker

**Files:** Create `src/stores/mcpRuntimeStore.ts` (+test), `src/components/chat/input/McpPickerMenu.tsx`(name may adapt to composer structure); Modify chat input actions area, `standardChatApiCall.ts` filter intersect, i18n chat.ts ×7.
**Interfaces:** store `{masterEnabled:boolean; selectedIds:string[]|null; toggleMaster(); toggleServer(id)}` non-persisted session scope; null = all enabled servers.

- [x] RED+GREEN.

### Task 7 — Settings UX batch

**Files:** Create `src/components/settings/sections/mcp/McpToolSchemaView.tsx` (+test), marketplace links data+grid inside McpSection; Modify McpSection trust confirm → themed dialog with config preview; auto-test after import JSON success and after enabling a server; Tools tab row expandable to schema view.

- [x] RED+GREEN (schema view recursion/depth cap render test; import auto-test via spy).

### Task 8 — Share-install `?mcp=`

**Files:** Create `src/features/mcp/importMcpServers.ts` (+test) — move `normalizeImportedServer`/`parseImportJson` from McpSection (re-export shim), `src/hooks/useMcpShareInstall.ts` + dialog component mounted at app root.

- [x] RED+GREEN (parser accepts base64url of `{mcpServers:{…}}`/array/single; invalid ignored silently).

### Task 9 — i18n sweep

- [x] All keys ×7 languages; `translationCoverage.test.ts` green.

### Task 10 — Verification & deploy

- [x] typecheck; targeted vitest files; `pnpm build`; docker compose up -d --build; curl 200; Playwright smoke shots (approval dialog, resources read, picker menu).
