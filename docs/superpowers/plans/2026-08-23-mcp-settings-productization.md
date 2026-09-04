# MCP Settings Productization — Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP settings product-level: filter/search/sort server list, per-server detail tabs (Settings/Tools/Prompts/Resources/Logs), static 200-entry log tail with 30s poll.

**Architecture:** Keep `McpSection` as orchestrator, add `FilterBar` derived state (filter+deferred search+sort up/down), introduce `DetailTabs` with 5 tabs driven by `capabilityStates[cardKey]` and new `fetchMcpLogs`/`fetchMcpPrompts`/`fetchMcpResources` calls; server adds `ServerLogBuffer` ring 200 per `serverId` and `GET /api/mcp/logs`.

**Tech Stack:** React 18 + Vite, Zustand `useMcpStatusStore`, Hono `mcpClient.ts`/`mcpRoutes.ts`, `@google/genai` types, `vitest` + `testing-library`, `lucide-react`, `shadcn` Tabs.

## Global Constraints

- Workspace root `/Volumes/WD_BLACK/Code/AMC-WebUI`, shell cwd `/Users/jones/Desktop`; use `pwd` to verify, never infer from DSH checkout.
- `danger-full-access`, approval prompts disabled.
- Build: `npm run build:docker` (`vite build && tsc -p server/tsconfig.json`), verify `http://127.0.0.1:8082` via `/usr/local/bin/docker compose build/up -d` (`WEB_PORT=8082`).
- Tests: `NODE_ENV=test npx vitest run` with `workdir=/Volumes/WD_BLACK/Code/AMC-WebUI`; `npm run test` from `/Users/jones/Desktop` fails `ENOENT`.
- i18n: single `useI18n` per component, pass `t` to children; alias `@/...` not `../`, no duplicate `from 'react'`, no JSX comments (`codeStyleBoundaries`).
- Commits: `git -c commit.gpgsign=false commit --signoff`.
- Keep `HIGH` default thinkingLevel, `ENABLE_MCP_STDIO=false`, `ENABLE_MCP_PRIVATE_HTTP=true` (already set for host.docker.internal), keep `mcpHttpSecurity.ts` SSRF guard.

---

## File Structure

- Modify: `server/src/mcpClient.ts` — add `ServerLogBuffer` `Map<string, {entries: McpLogEntry[], max:200}>` with `appendLog/getLogs`
- Modify: `server/src/mcpRoutes.ts` — add `GET /api/mcp/logs?serverId=` handler, wire to `mcpClient.getLogs`
- Modify: `src/services/api/mcpApi.ts` — add `McpLogEntry` type + `fetchMcpLogs(server, signal?)`
- Modify: `src/components/settings/sections/McpSection.tsx` — add FilterBar (filter/search/deferred/sort up/down), DetailTabs (5 tabs), Logs poll 30s, Prompts/Resources lists
- Create: `src/components/settings/sections/McpLogsTab.tsx` — presentational logs list (scroll, badges, Copy/Refresh)
- Create: `src/components/settings/sections/McpPromptsTab.tsx` — list prompts
- Create: `src/components/settings/sections/McpResourcesTab.tsx` — list resources/templates
- Modify: `src/i18n/translations/settings/mcp.ts` — add keys for filter/search/logs/prompts/resources/empty
- Test: `server/src/mcpClient.test.ts`, `server/src/mcpRoutes.test.ts`, `src/services/api/mcpApi.test.ts`, `src/components/settings/sections/McpSection.test.tsx`, `src/components/settings/sections/McpLogsTab.test.tsx`

---

### Task 1: Server log buffer + GET /api/mcp/logs + fetchMcpLogs

**Files:**

- Modify: `server/src/mcpClient.ts:10-40, 200-260`
- Modify: `server/src/mcpRoutes.ts:10-30, 100-160`
- Modify: `src/services/api/mcpApi.ts:1-30, 80-120`
- Test: `server/src/mcpClient.test.ts`, `server/src/mcpRoutes.test.ts`, `src/services/api/mcpApi.test.ts`

**Interfaces:**

- Consumes: `McpServerConfig`, existing `createMcpClientBridge`, `handleMcpRequest`
- Produces: `McpLogEntry {level:'debug'|'info'|'warn'|'error'|'stderr', message:string, timestamp:number}`, `mcpClient.getLogs(serverId:string): McpLogEntry[]`, `mcpClient.appendLog(serverId, level, message)`, `GET /api/mcp/logs?serverId=` → `{logs:McpLogEntry[]}`, `fetchMcpLogs(server, signal?): Promise<{logs}>`

- [ ] **Step 1: Write failing test `server/src/mcpClient.test.ts` for ring 200**

```ts
import { describe, it, expect } from 'vitest';
import { createMcpClientBridge } from './mcpClient';
describe('ServerLogBuffer', () => {
  it('retains last 200 and evicts oldest', () => {
    const bridge = createMcpClientBridge({ allowPrivateHttp: true } as any);
    for (let i = 0; i < 210; i++) (bridge as any).appendLog('s1', 'info', `msg-${i}`);
    const logs = (bridge as any).getLogs('s1');
    expect(logs.length).toBe(200);
    expect(logs[0].message).toBe('msg-10');
    expect(logs[199].message).toBe('msg-209');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run server/src/mcpClient.test.ts -t "ServerLogBuffer" -v`
Expected: FAIL `appendLog is not a function` / `getLogs is not a function`

- [ ] **Step 3: Implement minimal ServerLogBuffer in `server/src/mcpClient.ts`**

```ts
// top, near imports
export type McpLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'stderr';
export interface McpLogEntry {
  level: McpLogLevel;
  message: string;
  timestamp: number;
}
// inside createMcpClientBridge, before return:
const logBuffers = new Map<string, McpLogEntry[]>();
const appendLog = (serverId: string, level: McpLogLevel, message: string) => {
  const arr = logBuffers.get(serverId) ?? [];
  arr.push({ level, message, timestamp: Date.now() });
  if (arr.length > 200) arr.splice(0, arr.length - 200);
  logBuffers.set(serverId, arr);
};
const getLogs = (serverId: string): McpLogEntry[] => [...(logBuffers.get(serverId) ?? [])];
// append on error paths: after catch in listTools/callTool, call appendLog(serverId,'error',getErrorMessage(e))
// expose in returned bridge: { ..., appendLog, getLogs }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run server/src/mcpClient.test.ts -t "ServerLogBuffer" -v`
Expected: PASS 1/1

- [ ] **Step 5: Write failing test for `mcpRoutes` GET /api/mcp/logs**

```ts
// server/src/mcpRoutes.test.ts
import { describe, it, expect } from 'vitest';
import { handleMcpRequest } from './mcpRoutes';
it('GET /api/mcp/logs returns 200 ring', async () => {
  const bridge = { getLogs: () => [{ level: 'info', message: 'hi', timestamp: Date.now() }] } as any;
  const res = await handleMcpRequest(new Request('http://localhost/api/mcp/logs?serverId=s1'), {
    getLogs: bridge.getLogs,
  } as any);
  // Actually test via real handleMcpRequest wiring: use helper that calls GET
});
```

Simplified: use existing `mcpRoutes.test.ts` helper `makeRequest('GET','/api/mcp/logs?serverId=s1')` and assert `res.status===200` and `body.logs.length===1`.

- [ ] **Step 6: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run server/src/mcpRoutes.test.ts -t "GET /api/mcp/logs" -v`
Expected: FAIL 404 or 405

- [ ] **Step 7: Implement `GET /api/mcp/logs` in `server/src/mcpRoutes.ts`**

```ts
// in handleMcpRequest dispatcher, add before 404:
if (url.pathname === '/api/mcp/logs' && method === 'GET') {
  const serverId = url.searchParams.get('serverId')?.trim();
  if (!serverId) return Response.json({ error: 'serverId required' }, { status: 400 });
  const logs = mcpClient.getLogs(serverId);
  return Response.json({ logs });
}
```

Also add branch for `url.pathname === '/api/mcp/logs'` to allowed list.

- [ ] **Step 8: Write failing test for `src/services/api/mcpApi.test.ts` fetchMcpLogs**

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchMcpLogs } from './mcpApi';
it('fetches logs', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ logs: [{ level: 'info', message: 'hi', timestamp: 1 }] }),
  } as any);
  const res = await fetchMcpLogs({ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'http://x' } as any);
  expect(res.logs[0].message).toBe('hi');
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/services/api/mcpApi.test.ts -t "fetches logs" -v`
Expected: FAIL `fetchMcpLogs is not a function`

- [ ] **Step 10: Implement `fetchMcpLogs` in `src/services/api/mcpApi.ts`**

```ts
export interface McpLogEntry {
  level: string;
  message: string;
  timestamp: number;
}
export const fetchMcpLogs = async (server: McpServerConfig, signal?: AbortSignal): Promise<{ logs: McpLogEntry[] }> => {
  const res = await fetch(`/api/mcp/logs?serverId=${encodeURIComponent(server.id)}`, { signal });
  if (!res.ok) throw new Error(await readResponseErrorMessage(res));
  return res.json();
};
```

- [ ] **Step 11: Run all three suites to verify they pass**

Run: `NODE_ENV=test npx vitest run server/src/mcpClient.test.ts server/src/mcpRoutes.test.ts src/services/api/mcpApi.test.ts -v`
Expected: PASS (new tests 3/3, existing mcp tests still PASS)

- [ ] **Step 12: Commit**

```bash
git add server/src/mcpClient.ts server/src/mcpRoutes.ts src/services/api/mcpApi.ts server/src/mcpClient.test.ts server/src/mcpRoutes.test.ts src/services/api/mcpApi.test.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): server log buffer 200 + GET /api/mcp/logs + fetchMcpLogs"
```

---

### Task 2: Filter/search/sort bar in McpSection

**Files:**

- Modify: `src/components/settings/sections/McpSection.tsx:1-30, 70-130, 272-330`
- Modify: `src/i18n/translations/settings/mcp.ts:1-20`
- Test: `src/components/settings/sections/McpSection.test.tsx`

**Interfaces:**

- Consumes: `settings.mcpServers`, `cardKeys`, `states` for dot, `t`
- Produces: derived `filteredServers` + `filteredAndSorted` + `moveServer(id, dir)` + `FilterBar` UI, `matchKeywords(search, server)` helper

- [ ] **Step 1: Write failing tests**

```ts
// McpSection.test.tsx
it('filters by transport http', async () => {
  const settings = {
    ...DEFAULT,
    mcpServers: [
      { id: 's1', name: 'HTTP', enabled: true, transport: 'http', url: 'https://x' } as any,
      { id: 's2', name: 'STDIO', enabled: true, transport: 'stdio', command: 'npx' } as any,
    ],
  };
  const { container } = await renderMcpSection({ settings });
  fireEvent.change(screen.getByLabelText(/Filter/), { target: { value: 'http' } });
  expect(container.textContent).toContain('HTTP');
  expect(container.textContent).not.toContain('STDIO');
});
it('searches by name deferred', async () => {
  // type "http" into search, expect only HTTP visible after deferred
});
it('sorts up/down', async () => {
  const onUpdate = vi.fn();
  // render two servers, click up on second, expect onUpdate called with reordered [s2,s1]
});
```

Add `Filter` select `aria-label="MCP filter"` and `search input placeholder "Search servers"` and `up/down buttons aria-label="Move s2 up"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "filters by transport" -v`
Expected: FAIL `Unable to find label Filter`

- [ ] **Step 3: Implement FilterBar in `src/components/settings/sections/McpSection.tsx`**

```ts
// top state
const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'http' | 'sse' | 'stdio'>('all');
const [search, setSearch] = useState('');
const deferredSearch = useDeferredValue(search);
const [sortOrder, setSortOrder] = useState<string[]>(() => servers.map((s) => s.id));
useEffect(() => {
  setSortOrder((prev) => {
    const ids = servers.map((s) => s.id);
    const next = ids.filter((id) => !prev.includes(id)).concat(prev.filter((id) => ids.includes(id)));
    return ids.length === prev.length && ids.every((id, i) => id === prev[i]) ? prev : ids;
  });
}, [servers.map((s) => s.id).join(',')]);
const matchKeywords = (q: string, s: McpServerConfig) => {
  if (!q.trim()) return true;
  const hay = `${s.name} ${s.id} ${s.transport} ${s.url ?? ''} ${s.command ?? ''}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
};
const filtered = servers.filter((s) => {
  if (filter === 'enabled' && !s.enabled) return false;
  if (filter === 'disabled' && s.enabled) return false;
  if (filter === 'http' && s.transport !== 'http') return false;
  if (filter === 'sse' && s.transport !== 'sse') return false;
  if (filter === 'stdio' && s.transport !== 'stdio') return false;
  return matchKeywords(deferredSearch, s);
});
const filteredAndSorted = [...filtered].sort((a, b) => sortOrder.indexOf(a.id) - sortOrder.indexOf(b.id));
const moveServer = (id: string, dir: -1 | 1) => {
  const idx = sortOrder.indexOf(id);
  const next = [...sortOrder];
  const j = idx + dir;
  if (j < 0 || j >= next.length) return;
  [next[idx], next[j]] = [next[j], next[idx]];
  setSortOrder(next);
  const reordered = next.map((nid) => servers.find((s) => s.id === nid)!).filter(Boolean);
  onUpdate('mcpServers', reordered);
};
// JSX before list: <div className="flex gap-2"><select aria-label="MCP filter" value={filter} onChange={e=>setFilter(e.target.value as any)}><option value="all">All</option>...` + `<input placeholder="Search servers" value={search} onChange={e=>setSearch(e.target.value)} />` + render filteredAndSorted.map with up/down buttons
```

Add i18n keys `settingsMcpFilterAll/Enabled/Disabled/Http/Sse/Stdio`, `settingsMcpSearchPlaceholder`, `settingsMcpMoveUp/Down` to `mcp.ts` (7 langs).

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "filters by transport|searches|sorts" -v`
Expected: PASS 3/3. Also `NODE_ENV=test npx vitest run src/test/architecture/codeStyleBoundaries.test.ts -v` 29/29.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/i18n/translations/settings/mcp.ts src/components/settings/sections/McpSection.test.tsx
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): filter/search/sort bar for MCP server list"
```

---

### Task 3: Detail tabs — Prompts/Resources lists (read-only)

**Files:**

- Create: `src/components/settings/sections/McpPromptsTab.tsx`
- Create: `src/components/settings/sections/McpResourcesTab.tsx`
- Modify: `src/components/settings/sections/McpSection.tsx:330-450`
- Modify: `src/i18n/translations/settings/mcp.ts`
- Test: `src/components/settings/sections/McpSection.test.tsx`

**Interfaces:**

- Consumes: `capabilities: McpServerCapabilities` (already from `fetchMcpServerCapabilities`), `t`, `McpResourceDefinition`, `McpPromptDefinition`
- Produces: `<McpPromptsTab prompts={capabilities.prompts} />`, `<McpResourcesTab resources={capabilities.resources} templates={capabilities.resourceTemplates} />`

- [ ] **Step 1: Write failing tests**

```ts
it('renders prompts tab list', async () => {
  fetchMcpServerCapabilitiesMock.mockResolvedValue({ tools:[], prompts:[{name:'p1',description:'d1',arguments:[{name:'arg1'}]}], resources:[], resourceTemplates:[], errors:[] } as any);
  const { container } = await renderMcpSection({...});
  fireEvent.click(await screen.findByText('Test'));
  fireEvent.click(screen.getByRole('tab', {name:/Prompts/}));
  expect(await screen.findByText('p1')).toBeInTheDocument();
  expect(screen.getByText('arg1')).toBeInTheDocument();
});
it('renders resources tab list', async () => { /* similar for resources */ });
```

Add `role="tab"` via custom Tabs (`button role="tab"`) or use Radix Tabs.

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "prompts tab" -v`
Expected: FAIL `Unable to find role tab Prompts`

- [ ] **Step 3: Create `McpPromptsTab.tsx`**

```tsx
import React from 'react';
export const McpPromptsTab: React.FC<{
  prompts: { name: string; description?: string; arguments?: { name: string }[] }[];
  t: (k: string) => string;
}> = ({ prompts, t }) => {
  if (!prompts.length)
    return <div className="p-4 text-sm text-[var(--theme-text-secondary)]">{t('settingsMcpEmptyPrompts')}</div>;
  return (
    <div className="divide-y">
      {prompts.map((p) => (
        <div key={p.name} className="px-3 py-2">
          <div className="text-sm font-medium">{p.name}</div>
          <div className="text-xs text-[var(--theme-text-secondary)]">{p.description}</div>
          {p.arguments?.length ? (
            <div className="text-xs font-mono">args: {p.arguments.map((a) => a.name).join(', ')}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Create `McpResourcesTab.tsx`**

```tsx
import React from 'react';
export const McpResourcesTab: React.FC<{ resources: any[]; templates: any[]; t: any }> = ({
  resources,
  templates,
  t,
}) => {
  const all = [...resources, ...templates];
  if (!all.length)
    return <div className="p-4 text-sm text-[var(--theme-text-secondary)]">{t('settingsMcpEmptyResources')}</div>;
  return (
    <div className="divide-y">
      {all.map((r) => (
        <div key={r.uri || r.name} className="px-3 py-2">
          <div className="text-sm font-mono truncate">{r.uri || r.name}</div>
          <div className="text-xs">
            {r.name} {r.mimeType}
          </div>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 5: Modify `McpSection.tsx` to add Tabs shell**

```tsx
// state: const [activeTabs, setActiveTabs] = useState<Record<string,string>>({});
// in card render, after Tools table: <div className="mt-3 flex gap-1 border-b"><button role="tab" aria-selected={active===`settings`} onClick={()=>setActiveTabs({...activeTabs,[stateKey]:'settings'})}>Settings</button>...Prompts...Resources...Logs</div>
// conditional render: {activeTabs[stateKey]==='prompts' && <McpPromptsTab prompts={capabilities?.prompts ?? []} t={t} />}
// similar for resources, logs
```

Add keys `settingsMcpTabSettings/Tools/Prompts/Resources/Logs`, `settingsMcpEmptyPrompts/Resources` to `mcp.ts` (7 langs).

- [ ] **Step 6: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "prompts tab|resources tab" -v`
Expected: PASS 2/2. Full `McpSection.test.tsx` 16→18 tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/components/settings/sections/McpPromptsTab.tsx src/components/settings/sections/McpResourcesTab.tsx src/i18n/translations/settings/mcp.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): detail tabs prompts/resources read-only"
```

---

### Task 4: Logs tab static (poll 30s, copy, refresh) + verification

**Files:**

- Create: `src/components/settings/sections/McpLogsTab.tsx`
- Modify: `src/components/settings/sections/McpSection.tsx:440-520`
- Test: `src/components/settings/sections/McpSection.test.tsx`, `src/services/api/mcpApi.test.ts`
- Verify: `npm run build:docker`, `/usr/local/bin/docker compose build/up -d`, `curl http://127.0.0.1:8082/`

**Interfaces:**

- Consumes: `fetchMcpLogs`, `McpLogEntry`, `t`
- Produces: `<McpLogsTab serverId={server.id} />` with `Copy` + `Refresh`, `useEffect` poll 30s when active

- [ ] **Step 1: Write failing test for logs tab**

```ts
it('renders logs tab and refreshes', async () => {
  const fetchLogsMock = vi
    .fn()
    .mockResolvedValue({ logs: [{ level: 'info', message: 'hello', timestamp: Date.now() }] });
  vi.mocked(fetchMcpLogs).mockImplementation(fetchLogsMock);
  // render, click Test success, click Logs tab, expect hello, click Refresh expect second call
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "logs tab" -v`
Expected: FAIL `Unable to find role tab Logs`

- [ ] **Step 3: Create `McpLogsTab.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { fetchMcpLogs, type McpLogEntry } from '@/services/api/mcpApi';
export const McpLogsTab: React.FC<{ server: any; t: any }> = ({ server, t }) => {
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchMcpLogs(server);
      setLogs(r.logs);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    return () => clearInterval(id);
  }, [server.id]);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button onClick={() => navigator.clipboard.writeText(logs.map((l) => `[${l.level}] ${l.message}`).join('\n'))}>
          <Copy />
          Copy
        </button>
      </div>
      <div className="max-h-[200px] overflow-auto font-mono text-xs divide-y">
        {logs.map((l, i) => (
          <div key={i} className="px-2 py-1">
            <span
              className={`px-1 rounded text-[10px] ${l.level === 'error' ? 'bg-red-500/10 text-red-600' : l.level === 'warn' ? 'bg-amber-500/10' : 'bg-zinc-100'}`}
            >
              {l.level}
            </span>{' '}
            {l.message}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Modify `McpSection.tsx` to wire logs tab**

```tsx
// in activeTab==='logs' render: <McpLogsTab server={server} t={t} />
// ensure fetchMcpLogs imported
```

- [ ] **Step 5: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -t "logs tab" -v`
Expected: PASS. Also `NODE_ENV=test npx vitest run src/test/architecture/codeStyleBoundaries.test.ts -v` 29/29.

- [ ] **Step 6: Verify build + docker**

Run: `npm run build:docker 2>&1 | tail -n 20`
Expected: `built in Xs` + `tsc` 0
Run: `/usr/local/bin/docker compose build 2>&1 | tail -n 20`
Expected: `Image amc-webui-web Built`
Run: `/usr/local/bin/docker compose up -d 2>&1 | tail -n 10` then `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8082/` → `200`

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/components/settings/sections/McpLogsTab.tsx src/i18n/translations/settings/mcp.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): logs tab static 200 with 30s poll"
```
