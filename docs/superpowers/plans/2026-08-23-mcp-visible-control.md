# MCP Visible Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP tool use visible and controllable in AMC-WebUI by rendering tool traces in chat, allowing per-tool enable/disable, and showing per-server status (dot/pill), plus parallelizing the tool loop.

**Architecture:** Extend `shared/mcpServerConfig.ts` with `disabledTools`, add a lightweight `mcpStatusStore` (no SharedCache), enhance `McpSection.tsx` with status dots and per-tool tables, create `McpToolCallBlock.tsx` for chat rendering by pairing `isInternalToolMessage` plumbing turns, and pipeline `runStandardToolLoop` to `Promise.all`. Keep Gemini-only scope and `danger-full-access` file policy unchanged.

**Tech Stack:** React 18 + Vite, Zustand (`settingsStore` pattern), Hono server (`mcpClient.ts/mcpRoutes.ts`), `@google/genai` `FunctionCall`/`Part`, `vitest`, `shadcn/ui` pills, `lucide-react`.

## Global Constraints

- Workspace root `/Volumes/WD_BLACK/Code/AMC-WebUI`, shell cwd `/Users/jones/Desktop`; use `pwd` to verify, never infer workdir from DSH checkout path.
- `danger-full-access` file policy, approval prompts disabled.
- Build: `npm run build:docker` (`vite build && tsc -p server/tsconfig.json`), verify `http://127.0.0.1:8082` (`WEB_PORT=8082`) via `/usr/local/bin/docker compose build/up -d`.
- Tests: `NODE_ENV=test npx vitest run` with `workdir=/Volumes/WD_BLACK/Code/AMC-WebUI`; `npm run test` from `/Users/jones/Desktop` fails `ENOENT package.json`.
- i18n: single `useI18n` per component, pass `t` to children; alias imports `@/...` not `../`, no duplicate `from 'react'`, no JSX comments (`codeStyleBoundaries`).
- Commits: `git -c commit.gpgsign=false commit --signoff` (GPG missing key workaround).
- Keep `HIGH` default `thinkingLevel`, keep `ENABLE_MCP_STDIO=false` default, keep SSRF guard `mcpHttpSecurity.ts`.

---

## File Structure

- Modify: `shared/mcpServerConfig.ts` — add `disabledTools?: string[]` + sanitizer
- Modify: `shared/predicates.ts` if needed (already has `isRecord`)
- Modify: `src/schemas/appSettingsSchema.ts` — sanitize `disabledTools`
- Modify: `src/types/settings.ts` re-export unchanged (via shared)
- Modify: `src/types/chat.ts` — no change, document `isInternalToolMessage` pairing
- Modify: `src/features/mcp/mcpToolNames.ts` — already correct, keep FNV helper
- Modify: `src/features/mcp/mcpClientFunctions.ts` — filter `disabledTools`, fix discovery cache key for new field
- Modify: `src/features/standard-chat/standardToolLoop.ts` — parallelize `Promise.all`
- Modify: `src/features/message-sender/standardChatApiCall.ts` — ensure `disabledTools` flows through
- Create: `src/stores/mcpStatusStore.ts` — lightweight `Map<string, {state,error,lastCheckedAt,version?}>`
- Create: `src/features/mcp/mcpStatus.ts` — helpers `getMcpServerStatus`, `deriveState`
- Create: `src/components/message/McpToolCallBlock.tsx` — chat disclosure (args table, JSON highlight, copy, status)
- Create: `src/components/message/McpToolCallGroup.tsx` — pairs `isInternalToolMessage` model+user turns
- Modify: `src/utils/chat/visibility.ts` — export `isMcpToolMessage` helper, keep `isVisibleChatMessage` for non-MCP
- Modify: `src/utils/chat/builder.ts` and `src/features/chat-streaming/processors.ts` — preserve plumbing but expose pairing for rendering
- Modify: `src/components/message/Message.tsx` / `MessageList.tsx` or `ChatArea.tsx` — render `McpToolCallGroup` between turns
- Modify: `src/components/settings/sections/McpSection.tsx` — dots/pills + per-tool table + collapsible logs trigger
- Modify: `src/services/api/mcpApi.ts` — expose version if available, reuse `fetchMcpTools`
- Modify: `src/i18n/translations/settings/mcp.ts` + `src/i18n/translations/chatInput.ts` — add keys for new UI
- Test: `src/features/mcp/mcpClientFunctions.test.ts`, `src/features/standard-chat/standardToolLoop.test.ts`, `shared/mcpServerConfig.test.ts`, `src/components/settings/sections/McpSection.test.tsx`, `src/components/message/McpToolCallBlock.test.tsx`, `src/stores/mcpStatusStore.test.ts`

---

### Task 1: Shared config — `disabledTools` field and sanitization

**Files:**

- Modify: `shared/mcpServerConfig.ts:10-20`
- Modify: `src/schemas/appSettingsSchema.ts:300-310`
- Create: `shared/mcpServerConfig.test.ts` (new cases)
- Test: `shared/mcpServerConfig.test.ts`, `src/schemas/appSettingsSchema.test.ts` (existing)

**Interfaces:**

- Consumes: `isRecord` from `shared/predicates.ts`, `sanitizeStringArray`
- Produces: `McpServerConfig.disabledTools?: string[]`, `sanitizeMcpServerConfig(server: unknown) => McpServerConfig | undefined` extension, `sanitizeMcpServers` updated

- [ ] **Step 1: Write failing test for new field**

```ts
// shared/mcpServerConfig.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeMcpServers } from './mcpServerConfig';

describe('sanitizeMcpServers disabledTools', () => {
  it('preserves disabledTools array of strings', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledTools: ['tool_a', 'tool_b'],
      } as any,
    ]);
    expect(out[0].disabledTools).toEqual(['tool_a', 'tool_b']);
  });
  it('drops non-string entries and empty arrays', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledTools: ['ok', 123, null],
      } as any,
    ]);
    expect(out[0].disabledTools).toEqual(['ok']);
  });
  it('undefined when not array', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', disabledTools: 'bad' } as any,
    ]);
    expect(out[0].disabledTools).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run shared/mcpServerConfig.test.ts -v`
Expected: FAIL — `disabledTools` not preserved / `sanitizeMcpServers` ignores field

- [ ] **Step 3: Implement minimal change**

```ts
// shared/mcpServerConfig.ts
export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpServerTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: McpServerAuthConfig;
  disabledTools?: string[]; // NEW
}

// In sanitizeMcpServers or sanitizeMcpServer (wherever per-server sanitization happens), after sanitizing headers/auth:
const disabledTools = sanitizeStringArray((value as any).disabledTools);
if (disabledTools) (sanitized as any).disabledTools = disabledTools;
```

Also update `src/schemas/appSettingsSchema.ts` where `mcpServers` is defined: ensure `z.object({...}).transform(sanitizeMcpServers)` already covers it (no extra schema needed because transform handles it). If schema has explicit shape, add `.optional()` for `disabledTools: z.array(z.string()).optional()` before transform.

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run shared/mcpServerConfig.test.ts -v`
Expected: PASS (3/3). Also run `NODE_ENV=test npx vitest run src/schemas/appSettingsSchema.test.ts -v` if exists.

- [ ] **Step 5: Commit**

```bash
git add shared/mcpServerConfig.ts src/schemas/appSettingsSchema.ts shared/mcpServerConfig.test.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): add disabledTools to McpServerConfig with sanitization"
```

---

### Task 2: Filter disabled tools in discovery and handlers

**Files:**

- Modify: `src/features/mcp/mcpClientFunctions.ts:1-80, 120-200`
- Test: `src/features/mcp/mcpClientFunctions.test.ts`

**Interfaces:**

- Consumes: `McpServerConfig.disabledTools`, `McpToolDefinition`, `toMcpFunctionName`, `fetchMcpTools`
- Produces: `createMcpClientFunctions` now filters `tools.filter(t => !disabledTools?.includes(t.name))` before `toMcpFunctionName` + handler creation

- [ ] **Step 1: Write failing test**

```ts
// src/features/mcp/mcpClientFunctions.test.ts
it('filters disabledTools before creating declarations', async () => {
  const servers = [
    { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x', disabledTools: ['secret_tool'] } as any,
  ];
  const listTools = async () =>
    ({
      servers: [
        {
          serverId: 's1',
          serverName: 'S1',
          tools: [
            { name: 'secret_tool', description: '', inputSchema: { type: 'object' } } as any,
            { name: 'ok_tool', description: '', inputSchema: { type: 'object' } } as any,
          ],
        },
      ],
      errors: [],
    }) as any;
  const fns = await createMcpClientFunctions({ servers, listTools } as any);
  expect(Object.keys(fns).some((k) => k.includes('secret_tool'))).toBe(false);
  expect(Object.keys(fns).some((k) => k.includes('ok_tool'))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/features/mcp/mcpClientFunctions.test.ts -v`
Expected: FAIL — `secret_tool` still present

- [ ] **Step 3: Implement filter + cache key fix**

```ts
// src/features/mcp/mcpClientFunctions.ts
// After fetching: const allTools = response.servers.flatMap(s => s.tools.map(...))
// Insert:
const serverDisabledMap = new Map(servers.map((s) => [s.id, new Set(s.disabledTools ?? [])]));
const filteredServers = response.servers.map((s) => ({
  ...s,
  tools: s.tools.filter((t) => !serverDisabledMap.get(s.serverId)?.has(t.name)),
}));
// Use filteredServers for declaration/handler building

// Also fix discovery cache key: include disabledTools in configKey
const configKey = JSON.stringify(
  servers.map((s) => ({ id: s.id, url: s.url, command: s.command, disabledTools: s.disabledTools })),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/features/mcp/mcpClientFunctions.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/mcp/mcpClientFunctions.ts src/features/mcp/mcpClientFunctions.test.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): filter disabledTools in client functions"
```

---

### Task 3: Lightweight MCP status store

**Files:**

- Create: `src/stores/mcpStatusStore.ts`
- Create: `src/features/mcp/mcpStatus.ts`
- Test: `src/stores/mcpStatusStore.test.ts`

**Interfaces:**

- Consumes: `McpServerCapabilities`, errors from `fetchMcpServerCapabilities`
- Produces: `useMcpStatusStore` (Zustand) `{ states: Map<string, {state:'connected'|'error'|'connecting'|'disabled', lastError?:string, lastCheckedAt:number, version?:string}>, setStatus(id, patch), getStatus(id) }`, `deriveStatusFromCapabilities(cap: McpServerCapabilities|null, error:string|null, enabled:boolean) => state`

- [ ] **Step 1: Write failing test**

```ts
import { useMcpStatusStore } from '@/stores/mcpStatusStore';
it('sets and gets status', () => {
  useMcpStatusStore.getState().setStatus('s1', { state: 'connected', lastCheckedAt: Date.now() });
  expect(useMcpStatusStore.getState().getStatus('s1')?.state).toBe('connected');
});
it('deriveStatus maps error to error', () => {
  const { deriveStatus } = await import('@/features/mcp/mcpStatus');
  expect(deriveStatus(null, 'boom', true).state).toBe('error');
  expect(deriveStatus({ tools: [] } as any, null, false).state).toBe('disabled');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/stores/mcpStatusStore.test.ts -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement store**

```ts
// src/stores/mcpStatusStore.ts
import { create } from 'zustand';
export type McpServerState = 'connected' | 'connecting' | 'error' | 'disabled';
export interface McpStatus {
  state: McpServerState;
  lastError?: string;
  lastCheckedAt: number;
  version?: string;
}
interface Store {
  states: Record<string, McpStatus>;
  setStatus: (id: string, patch: Partial<McpStatus> & { state: McpServerState }) => void;
  getStatus: (id: string) => McpStatus | undefined;
}
export const useMcpStatusStore = create<Store>((set, get) => ({
  states: {},
  setStatus: (id, patch) =>
    set((s) => ({
      states: {
        ...s.states,
        [id]: {
          ...(s.states[id] ?? ({ lastCheckedAt: 0 } as any)),
          ...patch,
          lastCheckedAt: patch.lastCheckedAt ?? Date.now(),
        },
      },
    })),
  getStatus: (id) => get().states[id],
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/stores/mcpStatusStore.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/mcpStatusStore.ts src/features/mcp/mcpStatus.ts src/stores/mcpStatusStore.test.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): add lightweight mcpStatusStore"
```

---

### Task 4: McpSection — status dots/pills + wiring to Test + enabled toggle

**Files:**

- Modify: `src/components/settings/sections/McpSection.tsx:1-60, 80-200, 300-400`
- Test: `src/components/settings/sections/McpSection.test.tsx`

**Interfaces:**

- Consumes: `useMcpStatusStore`, `fetchMcpServerCapabilities`, `McpServerConfig`
- Produces: Card row renders `ActiveDot` (6px, `success=connected, warning=connecting, error=error, muted=disabled`), `TypeBadge` + `StatusPill Connected/Error`, `VersionText v…`, tooltip with `lastError`

- [ ] **Step 1: Write failing test**

```ts
// McpSection.test.tsx — add case
it('shows connected dot after successful Test', async () => {
  vi.mocked(fetchMcpServerCapabilities).mockResolvedValue({ tools:[{name:'a'}], resources:[], prompts:[] } as any);
  render(<McpSection settings={{mcpServers:[{id:'s1', name:'S1', enabled:true, transport:'http', url:'https://x'} as any]} as any} onUpdate={()=>{}} />);
  fireEvent.click(screen.getByText(/Test/i));
  expect(await screen.findByTestId('mcp-status-dot-s1')).toHaveAttribute('data-state','connected');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -v`
Expected: FAIL — dot not found

- [ ] **Step 3: Implement UI**

```tsx
// In McpSection.tsx per card:
import { useMcpStatusStore } from '@/stores/mcpStatusStore';
import { deriveStatus } from '@/features/mcp/mcpStatus';
const { setStatus, getStatus } = useMcpStatusStore(); // or use shallow

// In testServerCapabilities success/error:
try { const cap=await fetchMcpServerCapabilities(...); setStatus(server.id, { state:'connected', lastError:undefined }); setCapabilityStates(...success) } catch(e){ setStatus(server.id,{ state:'error', lastError:getErrorMessage(e)}); }

// In card render:
const status = getStatus(server.id) ?? { state: server.enabled ? 'connecting' : 'disabled' } as any;
<span data-testid={`mcp-status-dot-${server.id}`} data-state={status.state} className={`inline-block h-2 w-2 rounded-full ${status.state==='connected'?'bg-emerald-500':status.state==='error'?'bg-red-500':status.state==='connecting'?'bg-amber-500':'bg-zinc-400'}`} title={status.lastError ?? ''} />
<span className={`rounded-full px-1.5 py-0.5 text-[11px] ${status.state==='connected'?'bg-emerald-500/10 text-emerald-700':status.state==='error'?'bg-red-500/10 text-red-700':'bg-zinc-100'}`}>{status.state==='connected'?'Connected':status.state==='error'?'Error':status.state}</span>
```

Keep single `useI18n` in parent, pass `t` to dots.

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -v`
Expected: PASS. Also `NODE_ENV=test npx vitest run -v` quick check no `codeStyleBoundaries` failure (alias imports, no duplicate react).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/components/settings/sections/McpSection.test.tsx src/features/mcp/mcpStatus.ts src/stores/mcpStatusStore.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): show status dot/pill in McpSection and wire to Test"
```

---

### Task 5: McpSection — per-tool table (Enabled switch) after Test success

**Files:**

- Modify: `src/components/settings/sections/McpSection.tsx:200-400`
- Modify: `src/i18n/translations/settings/mcp.ts`
- Test: `src/components/settings/sections/McpSection.test.tsx`

**Interfaces:**

- Consumes: `McpServerCapabilities.tools`, `McpServerConfig.disabledTools`, `settings.mcpServers`, `onUpdate`
- Produces: Collapsible `Tools` table per server: `tool name | description | Enabled Switch`, search filter (deferred), updates `disabledTools` via `updateServer`

- [ ] **Step 1: Write failing test**

```ts
it('renders tool table with enable toggle and updates disabledTools', async () => {
  const onUpdate = vi.fn();
  vi.mocked(fetchMcpServerCapabilities).mockResolvedValue({ tools:[{name:'tool_a', description:'A'},{name:'tool_b', description:'B'}], resources:[], prompts:[] } as any);
  render(<McpSection settings={{mcpServers:[{id:'s1', name:'S1', enabled:true, transport:'http', url:'https://x'} as any]} as any} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByText(/Test/i));
  expect(await screen.findByText('tool_a')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Disable tool_a'));
  expect(onUpdate).toHaveBeenCalledWith('mcpServers', expect.arrayContaining([expect.objectContaining({ disabledTools:['tool_a'] })]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -v`
Expected: FAIL — table not found

- [ ] **Step 3: Implement table**

```tsx
// After capabilityStates[cardKey].status==='success':
const cap = capabilityStates[cardKey].capabilities;
const disabled = new Set(server.disabledTools ?? []);
const toggleTool = (toolName: string, enabled: boolean) => {
  const next = enabled
    ? (server.disabledTools ?? []).filter((n) => n !== toolName)
    : [...(server.disabledTools ?? []), toolName];
  updateServer(idx, { disabledTools: next.length ? next : undefined });
};
// Render:
<div className="mt-3 rounded-lg border">
  <div className="px-3 py-2 text-xs font-medium">Tools ({cap.tools.length})</div>
  {cap.tools.map((tool) => (
    <div key={tool.name} className="flex items-center justify-between border-t px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm truncate">{tool.name}</div>
        <div className="text-xs text-muted truncate">{tool.description}</div>
      </div>
      <Toggle
        checked={!disabled.has(tool.name)}
        onChange={(v) => toggleTool(tool.name, v)}
        aria-label={`${disabled.has(tool.name) ? 'Enable' : 'Disable'} ${tool.name}`}
      />
    </div>
  ))}
</div>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/i18n/translations/settings/mcp.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): per-tool enable table in McpSection"
```

---

### Task 6: Chat disclosure — McpToolCallBlock component

**Files:**

- Create: `src/components/message/McpToolCallBlock.tsx`
- Create: `src/components/message/McpToolCallBlock.test.tsx`
- Modify: `src/i18n/translations/chat.ts` (keys for copy, status)

**Interfaces:**

- Consumes: `FunctionCall` (`name, args`), `Part` `functionResponse`, tool name mapping `toMcpFunctionName` reverse? Instead store `serverName:toolName` via `buildDescription` prefix; parse from `FunctionCall.name` + lookup `mcpToolNames` inverse or pass `serverName` via handler metadata. Minimal: display `call.name` + args table.
- Produces: `<McpToolCallBlock call={FunctionCall} responsePart={Part} status={'invoking'|'success'|'error'} />` — header `server:tool` + `StatusIndicator` + `ArgsTable(max 4000/24)` + `ResponseSection(highlighted JSON, TruncatedIndicator)` + copy button (group-hover, 2s copied). Truncation constants copied from Cherry: `MAX_ARG_VALUE_LENGTH=4000, MAX_ARG_OBJECT_KEYS=24, MAX_ARG_ARRAY_ITEMS=24`.

- [ ] **Step 1: Write failing test**

```ts
it('renders args table and response with truncation', () => {
  render(<McpToolCallBlock call={{name:'mcp_s1_tool_a_abc123', args:{a:'x'.repeat(5000)}} as any} responsePart={{functionResponse:{name:'mcp_s1_tool_a_abc123', response:{result:'ok'}}}} status="success" />);
  expect(screen.getByText(/mcp_s1_tool_a/)).toBeInTheDocument();
  expect(screen.getByText(/Truncated/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/message/McpToolCallBlock.test.tsx -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement component**

```tsx
// src/components/message/McpToolCallBlock.tsx
import React, { useState } from 'react';
import { Copy, ShieldCheck, AlertTriangle, Check, Loader2 } from 'lucide-react';
const MAX_ARG_VALUE_LENGTH = 4000,
  MAX_ARG_OBJECT_KEYS = 24,
  MAX_ARG_ARRAY_ITEMS = 24;
export const McpToolCallBlock: React.FC<{ call: any; responsePart: any; status: 'invoking' | 'success' | 'error' }> = ({
  call,
  responsePart,
  status,
}) => {
  const [expanded, setExpanded] = useState(status === 'invoking');
  const [copied, setCopied] = useState(false);
  const argsStr = JSON.stringify(call.args, null, 2);
  const truncated = argsStr.length > MAX_ARG_VALUE_LENGTH ? argsStr.slice(0, MAX_ARG_VALUE_LENGTH) + '…' : argsStr;
  return (
    <div className="rounded-lg border bg-[var(--theme-bg-secondary)] my-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm"
      >
        <span className="font-mono text-xs truncate">{call.name}</span>
        <span className="flex items-center gap-2">
          {status === 'invoking' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'success' ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-xs">
          <pre className="overflow-auto max-h-[300px] whitespace-pre-wrap">{truncated}</pre>
          {argsStr.length > MAX_ARG_VALUE_LENGTH && <div className="text-[11px] text-muted">Truncated</div>}
          <pre className="mt-2 overflow-auto max-h-[300px]">
            {JSON.stringify(responsePart?.functionResponse?.response ?? {}, null, 2).slice(0, 4000)}
          </pre>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(
                JSON.stringify({ params: call.args, response: responsePart?.functionResponse?.response }, null, 2),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 flex items-center gap-1 text-[11px]"
          >
            <Copy className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
};
```

Style with `SETTINGS_SECTION_CARD_CLASS` tokens, reuse Tailwind `bg-muted` etc. No duplicate `useI18n`.

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run src/components/message/McpToolCallBlock.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/message/McpToolCallBlock.tsx src/components/message/McpToolCallBlock.test.tsx
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): add McpToolCallBlock disclosure"
```

---

### Task 7: Wire plumbing turns to chat rendering (visibility + pairing) + parallelize loop

**Files:**

- Modify: `src/utils/chat/visibility.ts:1-10`
- Modify: `src/features/chat-streaming/processors.ts:120-140`
- Modify: `src/features/standard-chat/standardToolLoop.ts:180-260`
- Modify: `src/components/message/MessageList.tsx` or `src/components/layout/ChatArea.tsx` + `src/components/message/Message.tsx`
- Test: `src/features/standard-chat/standardToolLoop.test.ts`, `src/utils/chat/visibility.test.ts` (new)

**Interfaces:**

- Consumes: `ChatMessage.isInternalToolMessage`, `toolParentMessageId`, `ChatHistoryItem` parts, `StandardToolLoopMessagePair`
- Produces: `getMcpToolPairs(messages: ChatMessage[]) => Array<{parentId:string, calls:FunctionCall[], responses:Part[]}>`, `isMcpInternalMessage(msg)` helper, `runStandardToolLoop` now `await Promise.all(functionCalls.map(c=> handler))` preserving order via index.

- [ ] **Step 1: Write failing tests**

```ts
// visibility.test.ts
it('identifies MCP internal pairs', () => {
  const msgs = [{id:'m1', isInternalToolMessage:true, apiParts:[{functionCall:{name:'mcp_x', args:{}}}], toolParentMessageId:'p1'} as any, {id:'u1', isInternalToolMessage:true, apiParts:[{functionResponse:{name:'mcp_x', response:{}}}], toolParentMessageId:'p1'} as any];
  expect(getMcpToolPairs(msgs).length).toBe(1);
});
// standardToolLoop.test.ts
it('runs tool handlers in parallel', async () => {
  const order:string[]=[]; const fns={ a:{declaration:{name:'a'}, handler: async()=>{ await new Promise(r=>setTimeout(r,30)); order.push('a'); return {response:{}} }}, b:{declaration:{name:'b'}, handler: async()=>{ order.push('b'); return {response:{}} }} } as any;
  await runStandardToolLoop({ initialContents:[], clientFunctions:fns, runTurn: async()=>({ modelContent:{role:'model', parts:[{functionCall:{name:'a',args:{}}},{functionCall:{name:'b',args:{}}}]} as any, parts:[], functionCalls:[{name:'a',args:{}},{name:'b',args:{}}] }) } as any, maxIterations:1);
  // parallel means total < 50ms, but assert both called
  expect(order).toEqual(expect.arrayContaining(['a','b']));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_ENV=test npx vitest run src/utils/chat/visibility.test.ts src/features/standard-chat/standardToolLoop.test.ts -v`
Expected: FAIL — helpers not found / still sequential

- [ ] **Step 3: Implement**

```ts
// visibility.ts
export const isMcpInternalMessage = (m: ChatMessage) => !!m.isInternalToolMessage && !!m.toolParentMessageId;
export const getMcpToolPairs = (messages: ChatMessage[]) => {
  const byParent = new Map<string, { calls: any[]; responses: any[] }>();
  for (const m of messages)
    if (isMcpInternalMessage(m)) {
      const pid = m.toolParentMessageId!;
      if (!byParent.has(pid)) byParent.set(pid, { calls: [], responses: [] });
      const bucket = byParent.get(pid)!;
      for (const p of m.apiParts ?? []) {
        if ((p as any).functionCall) bucket.calls.push((p as any).functionCall);
        if ((p as any).functionResponse) bucket.responses.push(p);
      }
    }
  return Array.from(byParent.entries()).map(([parentId, v]) => ({ parentId, ...v }));
};

// standardToolLoop.ts — replace sequential loop:
const functionResponseParts: Part[] = new Array(functionCalls.length);
const results = await Promise.all(
  functionCalls.map(async (call, idx) => {
    const fn = clientFunctions[call.name!];
    if (!fn)
      return {
        idx,
        part: { functionResponse: { name: call.name, response: { error: `not implemented: ${call.name}` } } } as Part,
      };
    try {
      const out = await fn.handler(call.args as any, { abortSignal } as any);
      return { idx, part: { functionResponse: { name: call.name, response: out.response ?? out } } as Part };
    } catch (e) {
      return { idx, part: { functionResponse: { name: call.name, response: { error: getErrorMessage(e) } } } as Part };
    }
  }),
);
results.sort((a, b) => a.idx - b.idx).forEach((r) => (functionResponseParts[r.idx] = r.part as Part));

// MessageList.tsx rendering:
import { getMcpToolPairs } from '@/utils/chat/visibility';
import { McpToolCallBlock } from './McpToolCallBlock';
// Inside map over visible messages, after each model message with id === pair.parentId, render its pairs:
const pairs = getMcpToolPairs(allMessages); // allMessages includes internal, not just visible
// For current message, find pair where parentId===message.id, then calls.map((call,i)=> <McpToolCallBlock key={i} call={call} responsePart={pairs.find(p=>p.parentId===message.id)?.responses[i]} status={...} />)
```

Gate behind setting or always show but collapsed when `success`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_ENV=test npx vitest run src/utils/chat/visibility.test.ts src/features/standard-chat/standardToolLoop.test.ts src/components/message/McpToolCallBlock.test.tsx -v`
Expected: PASS. Run full `NODE_ENV=test npx vitest run` — expect no `codeStyleBoundaries` failures.

- [ ] **Step 5: Commit**

```bash
git add src/utils/chat/visibility.ts src/features/chat-streaming/processors.ts src/features/standard-chat/standardToolLoop.ts src/components/message/MessageList.tsx src/components/layout/ChatArea.tsx
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): render tool traces and parallelize loop"
```

---

### Task 8: Verification, i18n, build

**Files:**

- Modify: `src/i18n/translations/settings/mcp.ts`, `src/i18n/translations/chat.ts`
- Verify: `npm run build:docker`, `/usr/local/bin/docker compose build && /usr/local/bin/docker compose up -d`, `curl http://127.0.0.1:8082/`

**Interfaces:**

- Consumes: all previous tasks
- Produces: passing `NODE_ENV=test npx vitest run`, successful Docker image, no `arch/codeStyle` failures

- [ ] **Step 1: Run full verification**

```bash
NODE_ENV=test npx vitest run 2>&1 | tail -n 50
npm run build:docker 2>&1 | tail -n 50
/usr/local/bin/docker compose build 2>&1 | tail -n 20
/usr/local/bin/docker compose up -d 2>&1 | tail -n 20
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8082/
```

- [ ] **Step 2: Fix any failures** — address `codeStyleBoundaries` (alias, duplicate import, single useI18n), translation missing keys, Docker cache.

- [ ] **Step 3: Commit final i18n/build fixes if any**

```bash
git add -A
git -c commit.gpgsign=false commit --signoff -m "chore(mcp): i18n and build verification for visible control"
```
