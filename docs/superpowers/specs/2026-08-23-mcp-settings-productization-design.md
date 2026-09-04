# MCP Settings Productization — Batch 1 Design

**Date:** 2026-08-23
**Scope:** Settings page only (logs static 200 + resources/prompts read-only + filter/search/sort). Composer insertion and trust/approval deferred to Batch 2.
**Base:** `src/components/settings/sections/McpSection.tsx` 630 LOC, `shared/mcpServerConfig.ts`, `src/stores/mcpStatusStore.ts`, `src/services/api/mcpApi.ts`, `server/src/mcpClient.ts` + `mcpRoutes.ts`.

## Goal

Bring AMC-WebUI MCP settings from config panel to Cherry-level product: filterable server list, per-server detail tabs (Settings / Tools / Prompts / Resources / Logs), static log tail, without introducing Electron-only deps (inMemory, DXT, OAuth callback).

## Non-Goals (Batch 2)

- Composer `mcpPrompt/mcpResource/mcpStatus` pickers
- Per-tool `disabledAutoApproveTools` + ShieldCheck + approval popup
- OAuth discovery, DXT/MCPB upload, inMemory builtin servers, `@dnd-kit` drag
- Real-time SSE log push (use 30s poll instead)

## Architecture

```
SettingsContent
  └─ McpSection (orchestrator, keeps cardKeys + capabilityStates + states)
       ├─ Header: title + Add Server
       ├─ ImportBar: 一键导入 Browser Bridge + 从 JSON 导入 (existing)
       ├─ FilterBar: Select(all/enabled/disabled/http/sse/stdio) + CollapsibleSearchBar(28→200px, useDeferredValue) + Sort up/down (replaces DND)
       ├─ Virtuoso/List: McpServerCard per server (dot/pill already done)
       └─ DetailTabs (when expanded): Tabs line variant
            ├─ Settings: existing controlled inputs (transport/url/headers/auth/command/args/env) — keep as is, no react-hook-form in Batch 1
            ├─ Tools: existing per-tool Enabled table (already done) — add search within tab
            ├─ Prompts: list {name, description, args[]} from fetchMcpPrompts, capability-gated, empty EmptyState
            ├─ Resources: list {uri, name, mimeType} + templates, paginated fetch via fetchMcpResources
            └─ Logs: ring 200 per server, GET /api/mcp/logs?serverId, Copy + Refresh + 30s auto-poll (pause when tab hidden)
Server
  ├─ mcpClient.ts: add ServerLogBuffer Map<serverId, Ring200> appended on listTools/callTool/transport errors
  ├─ mcpRoutes.ts: new GET /api/mcp/logs, POST /api/mcp/tools already returns resources/prompts counts — extend to return version if available
  └─ mcpApi.ts: add fetchMcpLogs(serverId)
```

Keep single `useI18n` in McpSection, pass `t` to tabs. Alias imports `@/`, no duplicate `from 'react'`, no JSX comments.

## Components & Interfaces

**McpSection.tsx** (add ~200 LOC, stays <900 LOC):

- State: `filter: 'all'|...`, `search: string`, `deferredSearch = useDeferredValue(search)`, `sortOrder: string[]` (order of ids, up/down handlers), `activeTab: Record<cardKey, 'settings'|'tools'|'prompts'|'resources'|'logs'>`, `logs: Record<serverId, LogEntry[]>`, `logsLoading`.
- Helpers: `filteredServers = servers.filter(byFilter).filter(matchKeywords(deferredSearch, name+description+tags+provider))` where `matchKeywords` lowercases and splits on space.
- `filteredAndSorted = filteredServers.sort(by sortOrder index)`; `moveServer(id, dir)` swaps in `sortOrder` and calls `onUpdate('mcpServers', reordered)`.
- `useEffect` for logs poll: when `activeTab[cardKey]==='logs'` fetch `fetchMcpLogs` every 30s via `setInterval`, cleanup on tab change/unmount, pause when `document.hidden`.

**McpLogsTab.tsx** (new, 80 LOC):

- Props `{serverId, t}`; renders `ScrollArea max-h-[200px] font-mono text-xs` with level badges `debug/info/warn/error/stderr` colors, `Copy` button, `Refresh` button, EmptyState.

**McpPromptsTab.tsx / McpResourcesTab.tsx** (new, each 60 LOC):

- Props `{capabilities, t}`; if `capabilities.prompts` empty show `EmptyState preset="no-resource"` else list. No fetch inside tab — parent passes `capabilities` from `fetchMcpServerCapabilities` (already includes prompts/resources counts; for full lists use `fetchMcpPrompts/Resources` when tab activated, 50 limit).

**ServerLogBuffer** (in `server/src/mcpClient.ts`, 40 LOC):

- `Map<string, {entries: LogEntry[], max:200}>`, `append(serverId, level, message, timestamp)`, `getLogs(serverId): LogEntry[]`, evict oldest when >200.

**mcpRoutes.ts** (20 LOC):

- `GET /api/mcp/logs?serverId=` → `mcpClient.getLogs(serverId)` → `{logs}`; 400 if missing, 403 if private http without flag (reuse existing guard), 1MiB limit not needed.

**mcpApi.ts** (15 LOC):

- `export interface McpLogEntry {level:string, message:string, timestamp:number}`; `fetchMcpLogs(server: McpServerConfig): Promise<{logs:McpLogEntry[]}>`.

## Data Flow

1. User opens Settings → McpSection reads `settings.mcpServers` (IndexedDB via settingsStore).
2. Filter/search/sort derived client-side, no server round-trip.
3. Click `Test` → `fetchMcpServerCapabilities` → `capabilities` stored in `capabilityStates[cardKey]` + `setStatus` + auto-populate `logs` buffer entry `info: fetched N tools`.
4. Expand DetailTabs → `activeTab` switches; if `prompts/resources/logs` fetch dedicated endpoints (cached via existing 30s discovery cache for prompts/resources, new 30s poll for logs).
5. Logs appended server-side on every `listTools/callTool` error + transport stderr; client polls `GET /api/mcp/logs`.

## Error Handling

- `parseImportJson` already tolerates `//` comments; keep.
- `fetchMcpServerCapabilities` failure → `capabilityState error` + `setStatus error` + log entry `error: getErrorMessage(e)`.
- `fetchMcpLogs` failure → show `Alert` with retry, do not clear existing logs.
- Empty states: `servers.length===0` → dashed card; `filteredServers.length===0` → `EmptyState` with `Clear filters`; `tools/prompts/resources/logs` empty → `EmptyState`.
- Sort: if `sortOrder` contains stale ids (deleted server), filter to existing ids before sort.

## Testing

- `McpSection.test.tsx` add: filter by transport/state, search deferred, sort up/down, logs tab renders and polls, prompts/resources empty/full, filter empty state.
- `server/src/mcpClient.test.ts` add: ServerLogBuffer ring 200 eviction, append ordering.
- `server/src/mcpRoutes.test.ts` add: GET /api/mcp/logs returns 200 ring, 400 missing id, private http guard.
- `src/services/api/mcpApi.test.ts` add: fetchMcpLogs parses logs array.
- Architecture: `codeStyleBoundaries` alias/duplicate/useI18n, `i18n:check` 1166+.

## Success Criteria

- Settings MCP list filterable/searchable/sortable without extra deps
- Each server card expandable to 5 tabs; Tools already works, Prompts/Resources show counts and lists, Logs shows last 200 with Copy/Refresh and 30s poll
- No regression: existing 16 McpSection tests + 29 architecture tests stay green, `build:docker` + `docker compose up -d` + `curl 200` pass
