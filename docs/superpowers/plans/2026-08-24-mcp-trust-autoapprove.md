# MCP Trust & Auto-Approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cherry-parity trust gate and per-tool dual control (Enabled + Auto-Approve) to AMC-WebUI MCP settings and runtime loop.

**Architecture:** Extend `shared/mcpServerConfig.ts` with `disabledAutoApproveTools?: string[]` and `isTrusted?: boolean` (sanitized), surface a 3-column tool table (Enable | Auto-Approve `ShieldCheck`) in `McpSection.tsx` Tools tab with deferred intra-tab search, gate server enable and non-auto-approved tool calls via a confirm dialog (`useMcpServerTrust` hook), and respect both arrays in `mcpClientFunctions`/`standardToolLoop`.

**Tech Stack:** React 18 + Vite + Zustand, Hono `mcpClient/mcpRoutes`, `@google/genai` types, `vitest`, `shadcn/ui` + `lucide-react ShieldCheck`, `loggerService`.

## Global Constraints

- Workspace root `/Volumes/WD_BLACK/Code/AMC-WebUI`, shell cwd `/Users/jones/Desktop`; never infer workdir from DSH checkout.
- `danger-full-access`, approval prompts disabled.
- Build: `npm run build:docker` (`vite build && tsc -p server/tsconfig.json`), verify `http://127.0.0.1:8082` via `/usr/local/bin/docker compose build --no-cache` + `up -d` (`WEB_PORT=8082`, `ENABLE_MCP_PRIVATE_HTTP=true`).
- Tests: `NODE_ENV=test npx vitest run` with `workdir=/Volumes/WD_BLACK/Code/AMC-WebUI`.
- i18n: single `useI18n` per component, alias `@/`, no duplicate `from 'react'`, no JSX comments (`codeStyleBoundaries`).
- Commits: `git -c commit.gpgsign=false commit --signoff`.
- Keep `HIGH` default thinkingLevel, `ENABLE_MCP_STDIO=false`, SSRF guard `mcpHttpSecurity.ts`.

---

## File Structure

- Modify: `shared/mcpServerConfig.ts` — add `disabledAutoApproveTools`, `isTrusted` + sanitizers
- Modify: `shared/mcpServerConfig.test.ts` — new cases
- Modify: `src/schemas/appSettingsSchema.ts` — sanitize new fields
- Modify: `src/features/mcp/mcpClientFunctions.ts` — respect `disabledAutoApproveTools` in tool metadata, fix cache key
- Create: `src/features/mcp/mcpTrust.ts` — `isTrustedServer`, `needsApproval`, trust helpers
- Create: `src/hooks/useMcpServerTrust.ts` — `ensureServerTrusted(server, update)` confirm flow
- Modify: `src/components/settings/sections/McpSection.tsx` — 3-col Tools table (Enable | ShieldCheck Auto-Approve) + intra-tab search + trust gate on enable toggle
- Modify: `src/components/settings/sections/McpSection.test.tsx` — new cases
- Modify: `src/features/standard-chat/standardToolLoop.ts` — gate non-auto-approved calls (log/warn scaffold; no blocking popup in Web yet)
- Modify: `src/i18n/translations/settings/mcp.ts` — keys for auto-approve, trust
- Modify: `src/i18n/translations/chat.ts` — keys for ShieldCheck tooltip
- Verify: `npm run build:docker`, docker, `codeStyleBoundaries`, `i18n:check`

---

### Task 1: Shared config — `disabledAutoApproveTools` + `isTrusted`

**Files:**

- Modify: `shared/mcpServerConfig.ts:22,108-115`
- Modify: `src/schemas/appSettingsSchema.ts:177-185`
- Modify: `shared/mcpServerConfig.test.ts`

**Interfaces:**

- Consumes: `sanitizeStringArray`, `isRecord`
- Produces: `McpServerConfig.disabledAutoApproveTools?: string[]`, `McpServerConfig.isTrusted?: boolean`

- [ ] **Step 1: Write failing test**

```ts
// shared/mcpServerConfig.test.ts add
describe('sanitizeMcpServers trust fields', () => {
  it('preserves disabledAutoApproveTools', () => {
    const out = sanitizeMcpServers([
      {
        id: 'a',
        name: 'A',
        enabled: true,
        transport: 'http',
        url: 'https://x',
        disabledAutoApproveTools: ['t1'],
      } as any,
    ]);
    expect(out[0].disabledAutoApproveTools).toEqual(['t1']);
  });
  it('preserves isTrusted boolean', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', isTrusted: true } as any,
    ]);
    expect(out[0].isTrusted).toBe(true);
  });
  it('drops non-boolean isTrusted', () => {
    const out = sanitizeMcpServers([
      { id: 'a', name: 'A', enabled: true, transport: 'http', url: 'https://x', isTrusted: 'yes' } as any,
    ]);
    expect(out[0].isTrusted).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run shared/mcpServerConfig.test.ts -v`
Expected: FAIL — fields undefined

- [ ] **Step 3: Implement minimal change**

```ts
// shared/mcpServerConfig.ts
export interface McpServerConfig {
  // ... existing
  disabledTools?: string[];
  disabledAutoApproveTools?: string[]; // NEW
  isTrusted?: boolean; // NEW
}
// in sanitizeMcpServerConfig after disabledTools:
const disabledAutoApproveTools = sanitizeStringArray((value as Record<string, unknown>).disabledAutoApproveTools);
if (disabledAutoApproveTools) (server as McpServerConfig).disabledAutoApproveTools = disabledAutoApproveTools;
if (typeof (value as Record<string, unknown>).isTrusted === 'boolean')
  (server as McpServerConfig).isTrusted = (value as Record<string, unknown>).isTrusted as boolean;
```

Same in `src/schemas/appSettingsSchema.ts` inside sanitizer.

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx vitest run shared/mcpServerConfig.test.ts -v`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add shared/mcpServerConfig.ts src/schemas/appSettingsSchema.ts shared/mcpServerConfig.test.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): add disabledAutoApproveTools and isTrusted to config"
```

---

### Task 2: Trust helper + client functions respect

**Files:**

- Create: `src/features/mcp/mcpTrust.ts`
- Create: `src/features/mcp/mcpTrust.test.ts`
- Modify: `src/features/mcp/mcpClientFunctions.ts`

**Interfaces:**

- Consumes: `McpServerConfig`
- Produces: `isTrustedServer(server) => boolean`, `needsApproval(server, toolName) => boolean` (`!disabledTools && trusted===false || disabledAutoApproveTools includes`)

- [ ] **Step 1: Write failing test**

```ts
// mcpTrust.test.ts
import { needsApproval } from './mcpTrust';
it('needs approval when not trusted', () => {
  expect(needsApproval({ isTrusted: false, disabledTools: [], disabledAutoApproveTools: [] } as any, 't1')).toBe(true);
});
it('needs approval when auto-approve disabled', () => {
  expect(needsApproval({ isTrusted: true, disabledAutoApproveTools: ['t1'] } as any, 't1')).toBe(true);
});
it('no approval when trusted and auto-approve enabled', () => {
  expect(needsApproval({ isTrusted: true, disabledAutoApproveTools: [] } as any, 't1')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/features/mcp/mcpTrust.test.ts -v`
Expected: FAIL module not found

- [ ] **Step 3: Implement**

```ts
// mcpTrust.ts
import type { McpServerConfig } from '@shared/mcpServerConfig';
export const isTrustedServer = (s: McpServerConfig) => s.isTrusted === true;
export const needsApproval = (s: McpServerConfig, toolName: string) => {
  if (!s.isTrusted) return true;
  return (s.disabledAutoApproveTools ?? []).includes(toolName);
};
```

Also update `mcpClientFunctions.ts` cache key to include `disabledAutoApproveTools` + `isTrusted`.

- [ ] **Step 4: Run test**

Run: `NODE_ENV=test npx vitest run src/features/mcp/mcpTrust.test.ts src/features/mcp/mcpClientFunctions.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/mcp/mcpTrust.ts src/features/mcp/mcpTrust.test.ts src/features/mcp/mcpClientFunctions.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): trust helpers and cache key"
```

---

### Task 3: McpSection — 3-col Tools table + intra-tab search + trust gate

**Files:**

- Modify: `src/components/settings/sections/McpSection.tsx`
- Modify: `src/i18n/translations/settings/mcp.ts`
- Test: `src/components/settings/sections/McpSection.test.tsx`

**Interfaces:**

- Consumes: `McpServerConfig`, capability tools, `t`
- Produces: Tools tab header search `CollapsibleSearchBar` (or plain input), columns `Tool | Enabled Switch | Auto-Approve ShieldCheck Switch (disabled when !enabled)`, trust confirm before enabling non-trusted server

- [ ] **Step 1: Write failing test**

```ts
it('renders auto-approve toggle and disables when tool disabled', async () => {
  // mock capabilities with 2 tools, render Tools tab, expect ShieldCheck switches
  // disable tool_a via first switch, expect auto-approve switch becomes disabled
});
it('asks trust confirm when enabling non-trusted server', async () => {
  // server isTrusted false, click enable toggle -> expect confirm dialog called, on confirm sets isTrusted true + enabled true
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx -v`
Expected: FAIL — no ShieldCheck

- [ ] **Step 3: Implement**

```tsx
// McpSection.tsx Tools tab
const [toolQuery, setToolQuery] = useState('');
const deferredToolQuery = useDeferredValue(toolQuery);
// filter cap.tools by name/description includes deferredToolQuery
// header: <input placeholder={t('settingsMcpToolSearchPlaceholder')} value={toolQuery} onChange={e=>setToolQuery(e.target.value)} />
// row: 3 cols
const handleToggleAutoApprove = (toolName: string, autoApprove: boolean) => {
  const next = autoApprove
    ? (server.disabledAutoApproveTools ?? []).filter((n) => n !== toolName)
    : [...(server.disabledAutoApproveTools ?? []), toolName];
  updateServer(idx, { disabledAutoApproveTools: next.length ? next : undefined });
};
// row render:
<div className="grid grid-cols-[1fr_96px_96px] items-center">
  <div>{tool.name}</div>
  <Toggle
    checked={!disabled.has(tool.name)}
    aria-label={`Enable ${tool.name}`}
    onChange={(v) => toggleTool(tool.name, v)}
  />
  <button
    disabled={disabled.has(tool.name)}
    aria-label={`Auto-approve ${tool.name}`}
    onClick={() => handleToggleAutoApprove(tool.name, isAutoApproved)}
  >
    <ShieldCheck className={isAutoApproved ? 'text-emerald-600' : 'text-zinc-400'} />
  </button>
</div>;
// enable gate:
const ensureTrusted = async (server: McpServerConfig) => {
  if (server.isTrusted) return true;
  const ok = window.confirm(t('settingsMcpTrustConfirm'));
  if (!ok) return false;
  updateServer(idx, { isTrusted: true, enabled: true });
  return true;
};
```

Add i18n keys `settingsMcpAutoApprove`, `settingsMcpAutoApproveEnabled/Disabled`, `settingsMcpTrustConfirm`, `settingsMcpToolSearchPlaceholder` (7 langs).

- [ ] **Step 4: Run test**

Run: `NODE_ENV=test npx vitest run src/components/settings/sections/McpSection.test.tsx src/features/mcp/mcpTrust.test.ts -v`
Expected: PASS, `codeStyleBoundaries 29/29`

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/McpSection.tsx src/i18n/translations/settings/mcp.ts src/components/settings/sections/McpSection.test.tsx
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): dual control table and trust gate in McpSection"
```

---

### Task 4: Tool loop approval scaffold + verification

**Files:**

- Modify: `src/features/standard-chat/standardToolLoop.ts` (log when needsApproval true)
- Modify: `src/components/message/McpToolCallBlock.tsx` (show ShieldCheck when auto-approved)
- Verify: build + docker

**Interfaces:**

- Consumes: `needsApproval`
- Produces: Tool call block shows `ShieldCheck` badge when server isTrusted and tool not in disabledAutoApproveTools; loop logs `needsApproval` for future popup

- [ ] **Step 1: Write failing test for block badge**

```ts
it('shows ShieldCheck when auto-approved', () => {
  render(<McpToolCallBlock call={{name:'mcp_s1_t1', args:{}}} responsePart={null} status="success" autoApproved />);
  expect(screen.getByTestId('mcp-shield')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement**

```tsx
// McpToolCallBlock props add autoApproved?: boolean
{
  autoApproved && <ShieldCheck data-testid="mcp-shield" className="h-3 w-3 text-emerald-600" />;
}
// standardToolLoop: before handler call, if needsApproval(server, toolName) logService.warn('tool needs approval', {toolName})
```

- [ ] **Step 3: Verify**

Run: `NODE_ENV=test npx vitest run 2>&1 | tail -n 30`
Run: `npm run build:docker 2>&1 | tail -n 20`
Run: `/usr/local/bin/docker compose build --no-cache 2>&1 | tail -n 20` && `/usr/local/bin/docker compose up -d 2>&1 | tail -n 20` && `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8082/`

- [ ] **Step 4: Commit**

```bash
git add src/components/message/McpToolCallBlock.tsx src/features/standard-chat/standardToolLoop.ts
git -c commit.gpgsign=false commit --signoff -m "feat(mcp): show auto-approve badge and loop scaffold"
```
