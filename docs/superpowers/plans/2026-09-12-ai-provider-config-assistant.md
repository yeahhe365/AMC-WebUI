# AI 服务商配置助手（PR1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页提供一个自然语言对话面板，让用户通过聊天新增/编辑第三方 API 连接，且 API Key 永不进入模型上下文。

**Architecture:** 复用现成的 `runStandardToolLoop`（纯函数：`initialContents` + `clientFunctions` + `runTurn`）作为 agent 循环，`runTurn` 直接对接 `generateContentTurnApi`（Gemini 原生通道）。工具的写入范围被限制为"第三方连接"，所有写入经 `providerPatch` 纯函数裁决（新增/补全/覆盖/拒绝），再通过 `useSettingsStore.setAppSettings` → `sanitizeThirdPartyApiSettings` 落盘。密钥不进模型：工具参数 schema 里没有 `apiKey`，缺密钥时 handler 挂起等待用户在密钥卡片里输入。

**Tech Stack:** TypeScript、React 18、zustand、Vitest（`node scripts/run-vitest.mjs`）、`@google/genai`（FunctionDeclaration / Type）、Tailwind + CSS 变量主题。

**Spec:** `docs/superpowers/specs/2026-09-12-ai-provider-config-assistant-design.md`

**范围说明:** 本计划只覆盖 spec 的 **PR1（最小闭环）**：`providerPatch` + 通道 + `list_templates` / `list_connections` / `create_connection` / `update_connection` + 面板骨架 + 变更卡片 + 密钥卡片 + 红队测试。PR2（审批弹窗、撤销、`test_connection`、`fetch_models`）与 PR3（空态打磨、e2e、设置搜索条目）在 PR1 落地后各自单独出计划。

## Global Constraints

- **密钥红线**：`create_connection` / `update_connection` 的参数 schema 中不得出现 `apiKey` 属性；面向模型的只读视图只返回 `hasApiKey: boolean`；`extraHeaders` 只返回 header 名，不返回值。由 Task 5 的红队测试强制。
- **唯一写入路径**：所有设置写入走 `useSettingsStore.setAppSettings`，从而经过 `sanitizeThirdPartyApiSettings`。禁止直接改 IndexedDB 或自行拼装持久化对象。
- **复用现有工厂**：`createConnectionFromTemplate` / `nextConnectionName` / `addThirdPartyConnection` / `updateThirdPartyConnection` / `removeThirdPartyConnection`（均在 `src/utils/thirdPartyApiProviders.ts`），不自行拼装 `ThirdPartyConnection`。
- **失败关闭**：PR1 尚无审批弹窗，命中 `needs-approval` 的补丁必须返回 `approval-unavailable` 且**不写入**。
- **i18n**：每个新增文案 key 必须一次带齐 7 种语言（`en` / `zh` / `ja` / `ko` / `es` / `fr` / `de`），否则 `pnpm i18n:check` 退出码 1。
- **测试命令**：单文件用 `node scripts/run-vitest.mjs run <path>`；全量用 `pnpm test`。收尾跑 `pnpm typecheck`、`pnpm lint`、`pnpm i18n:check`。
- **不碰大文件**：PR1 不修改 `ProviderDetail.tsx`；`ProviderSettingsSection.tsx` 只在 Task 9 做一次最小插入（该文件正处在并行重构中）。

---

### Task 1: 覆盖判定纯函数 `providerPatch`

**Files:**

- Create: `src/features/settings-assistant/providerPatch.ts`
- Modify: `src/utils/thirdPartyApiProviders.ts:664`（给 `nextConnectionName` 加 `export`，供去重复用；不复制实现）
- Test: `src/features/settings-assistant/providerPatch.test.ts`

**Interfaces:**

- Consumes: `createConnectionFromTemplate` / `addThirdPartyConnection` / `updateThirdPartyConnection` / `createConnectionId`（`@/utils/thirdPartyApiProviders`）；`THIRD_PARTY_TEMPLATE_IDS`（`@/types`）；测试用 `createThirdPartyConnection`（`@/test/data/factories`）
- Produces:
  - `type ApprovalReason = 'endpoint-exists' | 'overwrite-baseUrl' | 'clear-baseUrl' | 'overwrite-protocol' | 'overwrite-modelId' | 'replace-models' | 'delete-connection'`
  - `interface FieldDiff { field: string; before: string | null; after: string | null }`
  - `type PatchVerdict = { kind: 'apply'; connectionId: string; changed: string[]; nextConnections: ThirdPartyConnection[] } | { kind: 'needs-approval'; connectionId: string; reason: ApprovalReason; diff: FieldDiff[]; nextConnections: ThirdPartyConnection[] } | { kind: 'rejected'; error: string }`
  - `type ProviderPatch`（见下方代码）
  - `normalizeBaseUrlForCompare(value: string | null | undefined): string | null`
  - `findEndpointConflict(connections, protocol, baseUrl): ThirdPartyConnection | undefined`
  - `planProviderPatch(patch: ProviderPatch, connections: ThirdPartyConnection[]): PatchVerdict`

- [ ] **Step 1: 写失败的测试**

创建 `src/features/settings-assistant/providerPatch.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createThirdPartyConnection } from '@/test/data/factories';
import { findEndpointConflict, normalizeBaseUrlForCompare, planProviderPatch } from './providerPatch';

const connections = () => [
  createThirdPartyConnection({
    id: 'c1',
    name: 'OpenRouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1/',
    modelId: 'openai/gpt-4o',
    models: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
  }),
];

describe('normalizeBaseUrlForCompare', () => {
  it('ignores trailing slashes, host case and default ports', () => {
    expect(normalizeBaseUrlForCompare('https://API.Example.com:443/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeBaseUrlForCompare('  https://api.example.com/v1  ')).toBe('https://api.example.com/v1');
  });

  it('returns null for blank input', () => {
    expect(normalizeBaseUrlForCompare('   ')).toBeNull();
    expect(normalizeBaseUrlForCompare(null)).toBeNull();
  });
});

describe('findEndpointConflict', () => {
  it('matches the same protocol and normalized base URL', () => {
    expect(findEndpointConflict(connections(), 'openai-compatible', 'https://openrouter.ai/api/v1')?.id).toBe('c1');
  });

  it('does not match a different protocol on the same host', () => {
    expect(findEndpointConflict(connections(), 'anthropic', 'https://openrouter.ai/api/v1')).toBeUndefined();
  });
});

describe('planProviderPatch create', () => {
  it('creates from a template with template defaults', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'deepseek' }, []);
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.nextConnections).toHaveLength(1);
    expect(verdict.nextConnections[0].baseUrl).toBe('https://api.deepseek.com');
    expect(verdict.changed).toContain('created');
  });

  it('auto-numbers a duplicate name instead of asking for approval', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'deepseek', name: 'OpenRouter' }, connections());
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.nextConnections.map((c) => c.name)).toEqual(['OpenRouter', 'OpenRouter 2']);
  });

  it('requires approval when the endpoint already exists', () => {
    const verdict = planProviderPatch(
      { op: 'create', templateId: 'custom-openai', baseUrl: 'https://openrouter.ai/api/v1' },
      connections(),
    );
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('endpoint-exists');
    expect(verdict.connectionId).toBe('c1');
  });

  it('rejects an unknown template', () => {
    const verdict = planProviderPatch({ op: 'create', templateId: 'nope' as never }, []);
    expect(verdict).toEqual({ kind: 'rejected', error: 'Unknown template: nope' });
  });
});

describe('planProviderPatch update', () => {
  it('fills an empty base URL without approval', () => {
    const target = [createThirdPartyConnection({ id: 'c1', baseUrl: null })];
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://x.test/v1' } },
      target,
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toContain('baseUrl');
    expect(verdict.nextConnections[0].baseUrl).toBe('https://x.test/v1');
  });

  it('requires approval when overwriting an existing base URL', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://other.test/v1' } },
      connections(),
    );
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('overwrite-baseUrl');
    expect(verdict.diff).toEqual([
      { field: 'baseUrl', before: 'https://openrouter.ai/api/v1/', after: 'https://other.test/v1' },
    ]);
  });

  it('treats a name or enabled change as non-destructive', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { name: 'Router', enabled: false } },
      connections(),
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toEqual(['name', 'enabled']);
  });

  it('reports a normalized no-op instead of writing', () => {
    const verdict = planProviderPatch(
      { op: 'update', connectionId: 'c1', set: { baseUrl: 'https://openrouter.ai/api/v1' } },
      connections(),
    );
    expect(verdict.kind).toBe('apply');
    if (verdict.kind !== 'apply') return;
    expect(verdict.changed).toEqual([]);
  });

  it('appends models without approval and replaces only with approval', () => {
    const append = planProviderPatch(
      { op: 'update', connectionId: 'c1', addModels: [{ id: 'new/model', name: 'New' }] },
      connections(),
    );
    expect(append.kind).toBe('apply');
    if (append.kind === 'apply') expect(append.nextConnections[0].models.map((m) => m.id)).toContain('new/model');

    const replace = planProviderPatch(
      { op: 'update', connectionId: 'c1', replaceModels: [{ id: 'only/one', name: 'Only' }] },
      connections(),
    );
    expect(replace.kind).toBe('needs-approval');
    if (replace.kind === 'needs-approval') expect(replace.reason).toBe('replace-models');
  });

  it('rejects an unknown connection id', () => {
    const verdict = planProviderPatch({ op: 'update', connectionId: 'missing', set: { name: 'x' } }, connections());
    expect(verdict).toEqual({ kind: 'rejected', error: 'Connection not found: missing' });
  });
});

describe('planProviderPatch delete', () => {
  it('always requires approval and carries the next state without the connection', () => {
    const verdict = planProviderPatch({ op: 'delete', connectionId: 'c1' }, connections());
    expect(verdict.kind).toBe('needs-approval');
    if (verdict.kind !== 'needs-approval') return;
    expect(verdict.reason).toBe('delete-connection');
    expect(verdict.nextConnections).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerPatch.test.ts`  
Expected: FAIL —— `Failed to resolve import "./providerPatch"`。

- [ ] **Step 3: 实现 `providerPatch.ts`**

```ts
import type { ModelOption, ThirdPartyApiProtocol, ThirdPartyConnection, ThirdPartyTemplateId } from '@/types';
import { THIRD_PARTY_TEMPLATE_IDS } from '@/types';
import {
  addThirdPartyConnection,
  createConnectionFromTemplate,
  createConnectionId,
  nextConnectionName,
  updateThirdPartyConnection,
} from '@/utils/thirdPartyApiProviders';

type PatchUpdateSet = Partial<Pick<ThirdPartyConnection, 'name' | 'baseUrl' | 'protocol' | 'enabled' | 'modelId'>>;

export type ApprovalReason =
  | 'endpoint-exists'
  | 'overwrite-baseUrl'
  | 'clear-baseUrl'
  | 'overwrite-protocol'
  | 'overwrite-modelId'
  | 'replace-models'
  | 'delete-connection';

export interface FieldDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export type ProviderPatch =
  | {
      op: 'create';
      templateId: ThirdPartyTemplateId;
      name?: string;
      baseUrl?: string;
      protocol?: ThirdPartyApiProtocol;
      modelId?: string;
      models?: ModelOption[];
    }
  | {
      op: 'update';
      connectionId: string;
      set?: PatchUpdateSet;
      addModels?: ModelOption[];
      replaceModels?: ModelOption[];
    }
  | { op: 'delete'; connectionId: string };

export type PatchVerdict =
  | { kind: 'apply'; connectionId: string; changed: string[]; nextConnections: ThirdPartyConnection[] }
  | {
      kind: 'needs-approval';
      connectionId: string;
      reason: ApprovalReason;
      diff: FieldDiff[];
      nextConnections: ThirdPartyConnection[];
    }
  | { kind: 'rejected'; error: string };

/**
 * Comparison form for endpoint identity. Deliberately ignores trailing slashes,
 * host case and default ports so "https://API.test:443/v1/" and
 * "https://api.test/v1" are not reported as two different endpoints (which
 * would demand an approval prompt for a no-op).
 */
export const normalizeBaseUrlForCompare = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const port = parsed.port === '443' || parsed.port === '80' ? '' : parsed.port;
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port ? `:${port}` : ''}${path}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};

export const findEndpointConflict = (
  connections: ThirdPartyConnection[],
  protocol: ThirdPartyApiProtocol,
  baseUrl: string | null | undefined,
): ThirdPartyConnection | undefined => {
  const target = normalizeBaseUrlForCompare(baseUrl);
  if (!target) {
    return undefined;
  }

  return connections.find(
    (connection) => connection.protocol === protocol && normalizeBaseUrlForCompare(connection.baseUrl) === target,
  );
};

const diffOf = (field: string, before: unknown, after: unknown): FieldDiff => ({
  field,
  before: before === null || before === undefined ? null : String(before),
  after: after === null || after === undefined ? null : String(after),
});

const modelsSignature = (models: ModelOption[]): string => models.map((model) => model.id).join(',');

const planCreate = (
  patch: Extract<ProviderPatch, { op: 'create' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  if (!(THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(patch.templateId)) {
    return { kind: 'rejected', error: `Unknown template: ${String(patch.templateId)}` };
  }

  const draft = createConnectionFromTemplate(patch.templateId, connections, createConnectionId());
  if (patch.name !== undefined && patch.name.trim()) {
    // The factory de-duplicates the template's own name; an explicitly
    // requested name has to go through the same helper, otherwise a repeat
    // request for an existing name would create two identically named rows.
    draft.name = nextConnectionName(connections, patch.name.trim());
  }
  if (patch.baseUrl !== undefined) {
    draft.baseUrl = patch.baseUrl.trim() || null;
  }
  if (patch.protocol !== undefined) {
    draft.protocol = patch.protocol;
  }
  if (patch.modelId !== undefined && patch.modelId.trim()) {
    draft.modelId = patch.modelId.trim();
  }
  if (patch.models !== undefined && patch.models.length > 0) {
    draft.models = patch.models;
  }

  const conflict = findEndpointConflict(connections, draft.protocol, draft.baseUrl);
  if (conflict) {
    return {
      kind: 'needs-approval',
      connectionId: conflict.id,
      reason: 'endpoint-exists',
      diff: [diffOf('baseUrl', conflict.baseUrl, draft.baseUrl), diffOf('name', conflict.name, draft.name)],
      nextConnections: updateThirdPartyConnection({ connections }, conflict.id, {
        name: draft.name,
        baseUrl: draft.baseUrl,
        protocol: draft.protocol,
        modelId: draft.modelId,
        models: draft.models,
      }).connections,
    };
  }

  return {
    kind: 'apply',
    connectionId: draft.id,
    changed: ['created'],
    nextConnections: addThirdPartyConnection({ connections }, draft).connections,
  };
};

const planUpdate = (
  patch: Extract<ProviderPatch, { op: 'update' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  const current = connections.find((connection) => connection.id === patch.connectionId);
  if (!current) {
    return { kind: 'rejected', error: `Connection not found: ${patch.connectionId}` };
  }

  const nextSet: PatchUpdateSet = {};
  const changed: string[] = [];
  const destructive: Array<{ reason: ApprovalReason; diff: FieldDiff }> = [];

  if (patch.set?.name !== undefined) {
    const after = patch.set.name.trim();
    if (after && after !== current.name) {
      nextSet.name = after;
      changed.push('name');
    }
  }

  if (patch.set?.baseUrl !== undefined) {
    const after = patch.set.baseUrl.trim() || null;
    if (normalizeBaseUrlForCompare(current.baseUrl) !== normalizeBaseUrlForCompare(after)) {
      nextSet.baseUrl = after;
      if (!current.baseUrl?.trim()) {
        changed.push('baseUrl');
      } else {
        destructive.push({
          reason: after === null ? 'clear-baseUrl' : 'overwrite-baseUrl',
          diff: diffOf('baseUrl', current.baseUrl, after),
        });
      }
    }
  }

  if (patch.set?.protocol !== undefined && patch.set.protocol !== current.protocol) {
    nextSet.protocol = patch.set.protocol;
    destructive.push({ reason: 'overwrite-protocol', diff: diffOf('protocol', current.protocol, patch.set.protocol) });
  }

  if (patch.set?.modelId !== undefined) {
    const after = patch.set.modelId.trim();
    if (after && after !== current.modelId) {
      nextSet.modelId = after;
      if (current.modelId?.trim()) {
        destructive.push({ reason: 'overwrite-modelId', diff: diffOf('modelId', current.modelId, after) });
      } else {
        changed.push('modelId');
      }
    }
  }

  if (patch.set?.enabled !== undefined && patch.set.enabled !== current.enabled) {
    nextSet.enabled = patch.set.enabled;
    changed.push('enabled');
  }

  let nextModels = current.models;
  if (patch.addModels?.length) {
    const existingIds = new Set(current.models.map((model) => model.id));
    const additions = patch.addModels.filter((model) => !existingIds.has(model.id));
    if (additions.length > 0) {
      nextModels = [...current.models, ...additions];
      changed.push('addModels');
    }
  }

  if (patch.replaceModels && modelsSignature(patch.replaceModels) !== modelsSignature(current.models)) {
    destructive.push({
      reason: 'replace-models',
      diff: diffOf('models', modelsSignature(current.models), modelsSignature(patch.replaceModels)),
    });
    nextModels = patch.replaceModels;
  }

  if (changed.length === 0 && destructive.length === 0) {
    return { kind: 'apply', connectionId: current.id, changed: [], nextConnections: connections };
  }

  const nextConnections = updateThirdPartyConnection({ connections }, current.id, {
    ...nextSet,
    ...(nextModels === current.models ? {} : { models: nextModels }),
  }).connections;

  if (destructive.length > 0) {
    return {
      kind: 'needs-approval',
      connectionId: current.id,
      reason: destructive[0].reason,
      diff: destructive.map((entry) => entry.diff),
      nextConnections,
    };
  }

  return { kind: 'apply', connectionId: current.id, changed, nextConnections };
};

const planDelete = (
  patch: Extract<ProviderPatch, { op: 'delete' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  const current = connections.find((connection) => connection.id === patch.connectionId);
  if (!current) {
    return { kind: 'rejected', error: `Connection not found: ${patch.connectionId}` };
  }

  return {
    kind: 'needs-approval',
    connectionId: current.id,
    reason: 'delete-connection',
    diff: [diffOf('connection', current.name, null)],
    nextConnections: connections.filter((connection) => connection.id !== current.id),
  };
};

export const planProviderPatch = (patch: ProviderPatch, connections: ThirdPartyConnection[]): PatchVerdict => {
  switch (patch.op) {
    case 'create':
      return planCreate(patch, connections);
    case 'update':
      return planUpdate(patch, connections);
    case 'delete':
      return planDelete(patch, connections);
  }
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerPatch.test.ts`  
Expected: PASS，全部用例绿。

- [ ] **Step 5: 提交**

```bash
git add src/features/settings-assistant/providerPatch.ts src/features/settings-assistant/providerPatch.test.ts
git commit -m "feat(settings-assistant): add provider patch verdict planner"
```

---

### Task 2: 面向模型的脱敏视图 `providerRedaction`

**Files:**

- Create: `src/features/settings-assistant/providerRedaction.ts`
- Test: `src/features/settings-assistant/providerRedaction.test.ts`

**Interfaces:**

- Consumes: `THIRD_PARTY_TEMPLATE_IDS`（`@/types`）、`THIRD_PARTY_TEMPLATE_LABELS` / `getThirdPartyTemplateDefaults`（`@/utils/thirdPartyApiProviders`）；`createThirdPartyConnection`（测试工厂）
- Produces:
  - `const MODEL_IDS_PER_CONNECTION_LIMIT = 50`
  - `interface ConnectionSummary { id: string; name: string; templateId: string; protocol: string; baseUrl: string | null; hasApiKey: boolean; headerNames: string[]; modelCount: number; modelIds: string[]; enabled: boolean }`
  - `interface TemplateSummary { id: string; name: string; protocol: string; baseUrl: string | null; modelId: string; authOptional: boolean }`
  - `toConnectionSummary(connection: ThirdPartyConnection): ConnectionSummary`
  - `toTemplateSummary(templateId: ThirdPartyTemplateId): TemplateSummary`
  - `listTemplateSummaries(): TemplateSummary[]`

- [ ] **Step 1: 写失败的测试**

创建 `src/features/settings-assistant/providerRedaction.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createThirdPartyConnection } from '@/test/data/factories';
import {
  MODEL_IDS_PER_CONNECTION_LIMIT,
  listTemplateSummaries,
  toConnectionSummary,
  toTemplateSummary,
} from './providerRedaction';

describe('toConnectionSummary', () => {
  it('never exposes the API key or extra header values', () => {
    const summary = toConnectionSummary(
      createThirdPartyConnection({
        id: 'c1',
        apiKey: 'sk-secret-value',
        extraHeaders: { 'X-Token': 'header-secret-value' },
      }),
    );

    expect(summary.hasApiKey).toBe(true);
    expect(summary.headerNames).toEqual(['X-Token']);
    expect(JSON.stringify(summary)).not.toContain('sk-secret-value');
    expect(JSON.stringify(summary)).not.toContain('header-secret-value');
  });

  it('reports hasApiKey false for a blank key', () => {
    expect(toConnectionSummary(createThirdPartyConnection({ apiKey: '   ' })).hasApiKey).toBe(false);
  });

  it('truncates the model id list but keeps the true count', () => {
    const models = Array.from({ length: MODEL_IDS_PER_CONNECTION_LIMIT + 5 }, (_, index) => ({
      id: `model-${index}`,
      name: `Model ${index}`,
    }));
    const summary = toConnectionSummary(createThirdPartyConnection({ models }));

    expect(summary.modelCount).toBe(MODEL_IDS_PER_CONNECTION_LIMIT + 5);
    expect(summary.modelIds).toHaveLength(MODEL_IDS_PER_CONNECTION_LIMIT);
  });
});

describe('templates', () => {
  it('summarizes a template with its defaults and no secrets', () => {
    const summary = toTemplateSummary('deepseek');
    expect(summary.name).toBe('DeepSeek');
    expect(summary.baseUrl).toBe('https://api.deepseek.com');
    expect(summary.protocol).toBe('openai-compatible');
  });

  it('marks local engines as auth optional', () => {
    expect(toTemplateSummary('ollama').authOptional).toBe(true);
  });

  it('lists every template id exactly once', () => {
    const summaries = listTemplateSummaries();
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(summaries.length);
    expect(summaries.length).toBeGreaterThanOrEqual(25);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerRedaction.test.ts`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `providerRedaction.ts`**

```ts
import { THIRD_PARTY_TEMPLATE_LABELS, getThirdPartyTemplateDefaults } from '@/utils/thirdPartyApiProviders';
import { THIRD_PARTY_TEMPLATE_IDS, type ThirdPartyConnection, type ThirdPartyTemplateId } from '@/types';

/**
 * Caps how many model ids travel to the model. Catalogs on gateways like
 * OpenRouter hold hundreds of entries; the assistant only needs enough to
 * recognise the vendor and to propose imports from fetch_models (PR2).
 */
export const MODEL_IDS_PER_CONNECTION_LIMIT = 50;

export interface ConnectionSummary {
  id: string;
  name: string;
  templateId: string;
  protocol: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  headerNames: string[];
  modelCount: number;
  modelIds: string[];
  enabled: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string | null;
  modelId: string;
  authOptional: boolean;
}

/**
 * The only connection shape that may reach the model. `apiKey` becomes a
 * boolean and extra-header values are dropped entirely: header values are
 * credentials in practice (private gateway tokens), so only names travel.
 */
export const toConnectionSummary = (connection: ThirdPartyConnection): ConnectionSummary => ({
  id: connection.id,
  name: connection.name,
  templateId: connection.templateId,
  protocol: connection.protocol,
  baseUrl: connection.baseUrl,
  hasApiKey: Boolean(connection.apiKey?.trim()),
  headerNames: Object.keys(connection.extraHeaders ?? {}),
  modelCount: connection.models.length,
  modelIds: connection.models.slice(0, MODEL_IDS_PER_CONNECTION_LIMIT).map((model) => model.id),
  enabled: connection.enabled,
});

export const toTemplateSummary = (templateId: ThirdPartyTemplateId): TemplateSummary => {
  const defaults = getThirdPartyTemplateDefaults(templateId);
  return {
    id: templateId,
    name: THIRD_PARTY_TEMPLATE_LABELS[templateId],
    protocol: defaults.protocol,
    baseUrl: defaults.baseUrl,
    modelId: defaults.modelId,
    authOptional: Boolean(defaults.authOptional),
  };
};

export const listTemplateSummaries = (): TemplateSummary[] => THIRD_PARTY_TEMPLATE_IDS.map(toTemplateSummary);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerRedaction.test.ts`  
Expected: PASS。若 `THIRD_PARTY_TEMPLATE_LABELS` / `getThirdPartyTemplateDefaults` 不在 `@/utils/thirdPartyApiProviders` 中导出，改为从实际导出它们的模块导入（先 `grep -rn "export const THIRD_PARTY_TEMPLATE_LABELS" src` 确认），不要在本文件内复制标签表。

- [ ] **Step 5: 提交**

```bash
git add src/features/settings-assistant/providerRedaction.ts src/features/settings-assistant/providerRedaction.test.ts
git commit -m "feat(settings-assistant): add redacted provider views for model context"
```

---

### Task 3: 会话状态与密钥挂起 `settingsAssistantStore`

**Files:**

- Create: `src/stores/settingsAssistantStore.ts`
- Test: `src/stores/settingsAssistantStore.test.ts`

**Interfaces:**

- Consumes: `zustand`（`create`）
- Produces:
  - `type AssistantStatus = 'idle' | 'running' | 'awaiting-key' | 'error'`
  - `type AssistantItem`（`user` | `assistant` | `tool` | `change` | `key-request` | `error`，均带 `id: string`）
  - `createAssistantItemId(): string`
  - `useSettingsAssistantStore`，含 `status` / `items` / `pendingKeyRequest`、`appendItem` / `updateToolItem` / `setStatus` / `reset`，以及 `requestApiKey(request: { connectionId: string; connectionName: string }): Promise<string | null>` / `submitApiKey(key: string)` / `cancelApiKey()`

- [ ] **Step 1: 写失败的测试**

创建 `src/stores/settingsAssistantStore.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsAssistantStore } from './settingsAssistantStore';

describe('settingsAssistantStore', () => {
  beforeEach(() => {
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
  });

  it('appends items in order', () => {
    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'user', id: 'u1', text: 'hi' });
    store.appendItem({ kind: 'assistant', id: 'a1', text: 'ok' });

    expect(useSettingsAssistantStore.getState().items.map((item) => item.id)).toEqual(['u1', 'a1']);
  });

  it('patches a tool item in place', () => {
    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'tool', id: 't1', name: 'create_connection', status: 'running', detail: null });
    store.updateToolItem('t1', { status: 'done', detail: 'created' });

    const item = useSettingsAssistantStore.getState().items[0];
    expect(item).toMatchObject({ kind: 'tool', status: 'done', detail: 'created' });
  });

  it('resolves the key request with the submitted key and returns to running', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });

    expect(useSettingsAssistantStore.getState().status).toBe('awaiting-key');
    expect(useSettingsAssistantStore.getState().items[0]).toMatchObject({
      kind: 'key-request',
      connectionId: 'c1',
      connectionName: 'DeepSeek',
    });

    useSettingsAssistantStore.getState().submitApiKey('sk-typed');

    await expect(pending).resolves.toBe('sk-typed');
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
    expect(useSettingsAssistantStore.getState().status).toBe('running');
  });

  it('resolves the key request with null on cancel', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });
    useSettingsAssistantStore.getState().cancelApiKey();

    await expect(pending).resolves.toBeNull();
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
  });

  it('reset cancels an in-flight key request so no await dangles', async () => {
    const store = useSettingsAssistantStore.getState();
    const pending = store.requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });
    useSettingsAssistantStore.getState().reset();

    await expect(pending).resolves.toBeNull();
    expect(useSettingsAssistantStore.getState().items).toEqual([]);
    expect(useSettingsAssistantStore.getState().status).toBe('idle');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/stores/settingsAssistantStore.test.ts`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `settingsAssistantStore.ts`**

```ts
import { create } from 'zustand';

export type AssistantStatus = 'idle' | 'running' | 'awaiting-key' | 'error';

export type AssistantItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; status: 'running' | 'done' | 'error'; detail: string | null }
  | { kind: 'change'; id: string; connectionId: string; changed: string[] }
  | { kind: 'key-request'; id: string; connectionId: string; connectionName: string }
  | { kind: 'error'; id: string; message: string };

export type AssistantToolItem = Extract<AssistantItem, { kind: 'tool' }>;

interface PendingKeyRequest {
  connectionId: string;
  connectionName: string;
  resolve: (apiKey: string | null) => void;
}

interface SettingsAssistantState {
  status: AssistantStatus;
  items: AssistantItem[];
  pendingKeyRequest: PendingKeyRequest | null;
  appendItem: (item: AssistantItem) => void;
  updateToolItem: (id: string, patch: Partial<Omit<AssistantToolItem, 'kind' | 'id'>>) => void;
  setStatus: (status: AssistantStatus) => void;
  reset: () => void;
  requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null>;
  submitApiKey: (apiKey: string) => void;
  cancelApiKey: () => void;
}

let nextItemId = 1;

export const createAssistantItemId = (): string => {
  nextItemId += 1;
  return `assistant-item-${nextItemId}`;
};

export const useSettingsAssistantStore = create<SettingsAssistantState>((set, get) => ({
  status: 'idle',
  items: [],
  pendingKeyRequest: null,

  appendItem: (item) => set((state) => ({ items: [...state.items, item] })),

  updateToolItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.kind === 'tool' && item.id === id ? { ...item, ...patch } : item)),
    })),

  setStatus: (status) => set({ status }),

  // Resolving the pending request with null on reset matters: the tool handler
  // is awaiting this promise, and the panel can be closed mid-turn.
  reset: () => {
    get().pendingKeyRequest?.resolve(null);
    set({ status: 'idle', items: [], pendingKeyRequest: null });
  },

  requestApiKey: ({ connectionId, connectionName }) =>
    new Promise<string | null>((resolve) => {
      set((state) => ({
        status: 'awaiting-key',
        items: [...state.items, { kind: 'key-request', id: createAssistantItemId(), connectionId, connectionName }],
        pendingKeyRequest: { connectionId, connectionName, resolve },
      }));
    }),

  submitApiKey: (apiKey) => {
    const pending = get().pendingKeyRequest;
    if (!pending) return;
    set({ pendingKeyRequest: null, status: 'running' });
    pending.resolve(apiKey);
  },

  cancelApiKey: () => {
    const pending = get().pendingKeyRequest;
    if (!pending) return;
    set({ pendingKeyRequest: null, status: 'running' });
    pending.resolve(null);
  },
}));
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/stores/settingsAssistantStore.test.ts`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/stores/settingsAssistantStore.ts src/stores/settingsAssistantStore.test.ts
git commit -m "feat(settings-assistant): add panel session store with api key handoff"
```

---

### Task 4: 工具 `providerTools`（4 个工具 + 密钥交接 + 失败关闭）

**Files:**

- Create: `src/features/settings-assistant/providerTools.ts`
- Test: `src/features/settings-assistant/providerTools.test.ts`

**Interfaces:**

- Consumes: `StandardClientFunctions` / `ModelOption` / `ThirdPartyConnection` / `ThirdPartyTemplateId`（`@/types`）；`Type` / `FunctionDeclaration`（`@google/genai`）；`isRecord`（`../../../shared/predicates`）；`planProviderPatch`（Task 1）；`listTemplateSummaries` / `toConnectionSummary`（Task 2）；`updateThirdPartyConnection`（`@/utils/thirdPartyApiProviders`）
- Produces:
  - `interface ProviderToolsDeps { getConnections: () => ThirdPartyConnection[]; setConnections: (next: ThirdPartyConnection[]) => void; requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null> }`
  - `const PROVIDER_TOOL_DECLARATIONS: FunctionDeclaration[]`
  - `createProviderTools(deps: ProviderToolsDeps): StandardClientFunctions`
  - 工具返回状态字面量：`created` / `updated` / `unchanged` / `key-configured` / `aborted` / `rejected` / `approval-unavailable`

- [ ] **Step 1: 写失败的测试**

创建 `src/features/settings-assistant/providerTools.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyConnection } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { PROVIDER_TOOL_DECLARATIONS, createProviderTools, type ProviderToolsDeps } from './providerTools';

const propertiesOf = (name: string): string[] =>
  Object.keys(
    PROVIDER_TOOL_DECLARATIONS.find((declaration) => declaration.name === name)?.parameters?.properties ?? {},
  );

const createDeps = (initial: ThirdPartyConnection[] = []) => {
  let connections = initial;
  const requestApiKey = vi.fn(async () => 'sk-from-card');
  const deps: ProviderToolsDeps = {
    getConnections: () => connections,
    setConnections: (next) => {
      connections = next;
    },
    requestApiKey,
  };
  return { deps, requestApiKey, current: () => connections };
};

describe('provider tool declarations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes exactly the four PR1 tools', () => {
    expect(PROVIDER_TOOL_DECLARATIONS.map((declaration) => declaration.name).sort()).toEqual([
      'create_connection',
      'list_connections',
      'list_templates',
      'update_connection',
    ]);
  });

  it('has no apiKey parameter on any write tool', () => {
    expect(propertiesOf('create_connection')).not.toContain('apiKey');
    expect(propertiesOf('update_connection')).not.toContain('apiKey');
  });
});

describe('createProviderTools', () => {
  it('lists templates without secrets', async () => {
    const { deps } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.list_templates.handler({});

    expect(JSON.stringify(result.response)).toContain('deepseek');
    expect(JSON.stringify(result.response)).not.toContain('apiKey');
  });

  it('lists connections with hasApiKey instead of the key', async () => {
    const { deps } = createDeps([createThirdPartyConnection({ id: 'c1', apiKey: 'sk-secret' })]);
    const tools = createProviderTools(deps);
    const result = await tools.list_connections.handler({});

    expect(result.response).toMatchObject({ connections: [{ id: 'c1', hasApiKey: true }] });
    expect(JSON.stringify(result.response)).not.toContain('sk-secret');
  });

  it('creates a connection and requests the key through the card', async () => {
    const { deps, requestApiKey, current } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'deepseek' });

    expect(requestApiKey).toHaveBeenCalledWith({ connectionId: expect.any(String), connectionName: 'DeepSeek' });
    expect(result.response).toMatchObject({ status: 'key-configured', name: 'DeepSeek' });
    expect(current()[0].apiKey).toBe('sk-from-card');
    expect(current()[0].baseUrl).toBe('https://api.deepseek.com');
  });

  it('skips the key request for auth-optional local engines', async () => {
    const { deps, requestApiKey } = createDeps();
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'ollama' });

    expect(requestApiKey).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({ status: 'created' });
  });

  it('reports aborted when the user dismisses the key card', async () => {
    const { deps } = createDeps();
    deps.requestApiKey = vi.fn(async () => null);
    const tools = createProviderTools(deps);
    const result = await tools.create_connection.handler({ templateId: 'deepseek' });

    expect(result.response).toMatchObject({ status: 'aborted' });
  });

  it('fails closed instead of overwriting when approval would be required', async () => {
    const existing = createThirdPartyConnection({
      id: 'c1',
      protocol: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    const { deps, current } = createDeps([existing]);
    const tools = createProviderTools(deps);
    const result = await tools.update_connection.handler({
      connectionId: 'c1',
      baseUrl: 'https://other.test/v1',
    });

    expect(result.response).toMatchObject({ status: 'approval-unavailable', reason: 'overwrite-baseUrl' });
    expect(current()[0].baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('applies a non-destructive update', async () => {
    const { deps, current } = createDeps([createThirdPartyConnection({ id: 'c1', name: 'Old' })]);
    const tools = createProviderTools(deps);
    const result = await tools.update_connection.handler({ connectionId: 'c1', name: 'New' });

    expect(result.response).toMatchObject({ status: 'updated', changed: ['name'] });
    expect(current()[0].name).toBe('New');
  });

  it('rejects malformed arguments without touching settings', async () => {
    const { deps, current } = createDeps();
    const tools = createProviderTools(deps);

    await expect(tools.create_connection.handler({ templateId: 'not-a-template' })).resolves.toMatchObject({
      response: { status: 'rejected' },
    });
    await expect(tools.update_connection.handler({})).resolves.toMatchObject({
      response: { status: 'rejected' },
    });
    expect(current()).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerTools.test.ts`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `providerTools.ts`**

```ts
import { Type, type FunctionDeclaration } from '@google/genai';
import type {
  ModelOption,
  StandardClientFunctions,
  ThirdPartyApiProtocol,
  ThirdPartyConnection,
  ThirdPartyTemplateId,
} from '@/types';
import { THIRD_PARTY_TEMPLATE_IDS } from '@/types';
import { updateThirdPartyConnection } from '@/utils/thirdPartyApiProviders';
import { isRecord } from '../../../shared/predicates';
import { listTemplateSummaries, toConnectionSummary } from './providerRedaction';
import { planProviderPatch, type ProviderPatch } from './providerPatch';

export interface ProviderToolsDeps {
  getConnections: () => ThirdPartyConnection[];
  setConnections: (next: ThirdPartyConnection[]) => void;
  /** Resolves with the key the user typed in the handoff card, or null when dismissed. */
  requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null>;
}

const stringProperty = (description: string) => ({ type: Type.STRING, description });

const modelArrayProperty = (description: string) => ({
  type: Type.ARRAY,
  description,
  items: {
    type: Type.OBJECT,
    properties: { id: stringProperty('Model id.'), name: stringProperty('Display name.') },
    required: ['id'],
  },
});

const DECLARATIONS = {
  list_templates: {
    name: 'list_templates',
    description:
      'List the built-in provider templates with their default base URL, protocol, default model and whether authentication is optional. Always prefer these defaults over invented values.',
    parameters: { type: Type.OBJECT, properties: {} },
  } satisfies FunctionDeclaration,
  list_connections: {
    name: 'list_connections',
    description:
      'List the third-party connections the user has configured. API keys are never returned; hasApiKey only says whether one is stored.',
    parameters: { type: Type.OBJECT, properties: {} },
  } satisfies FunctionDeclaration,
  create_connection: {
    name: 'create_connection',
    description:
      'Create a third-party connection from a template. Never pass an API key: if one is required the user is asked through a secure card in the UI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        templateId: stringProperty(`One of: ${THIRD_PARTY_TEMPLATE_IDS.join(', ')}`),
        name: stringProperty('Display name. Duplicate names are numbered automatically.'),
        baseUrl: stringProperty('Base URL without the /chat/completions suffix. Omit to use the template default.'),
        protocol: stringProperty('openai-compatible | anthropic | openai-responses. Omit to use the template default.'),
        modelId: stringProperty('Default model id used for connection tests.'),
        models: modelArrayProperty('Initial model catalog. Omit to use the template default.'),
      },
      required: ['templateId'],
    },
  } satisfies FunctionDeclaration,
  update_connection: {
    name: 'update_connection',
    description:
      'Update an existing connection. Never pass an API key. Overwriting an existing base URL, protocol or model id requires user approval and is refused while approvals are unavailable.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        connectionId: stringProperty('Connection id from list_connections.'),
        name: stringProperty('New display name.'),
        baseUrl: stringProperty('New base URL.'),
        protocol: stringProperty('New protocol.'),
        enabled: { type: Type.BOOLEAN, description: 'Enable or disable the connection.' },
        modelId: stringProperty('New default model id.'),
        addModels: modelArrayProperty('Models to append, keeping the existing catalog.'),
        replaceModels: modelArrayProperty('Replace the whole catalog. Requires user approval.'),
      },
      required: ['connectionId'],
    },
  } satisfies FunctionDeclaration,
};

export const PROVIDER_TOOL_DECLARATIONS: FunctionDeclaration[] = Object.values(DECLARATIONS);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const asProtocol = (value: unknown): ThirdPartyApiProtocol | undefined => {
  const candidate = asString(value);
  return candidate === 'openai-compatible' || candidate === 'anthropic' || candidate === 'openai-responses'
    ? candidate
    : undefined;
};

const asModelOptions = (value: unknown): ModelOption[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const models = value
    .filter(isRecord)
    .map((entry) => ({ id: asString(entry.id) ?? '', name: asString(entry.name) ?? asString(entry.id) ?? '' }))
    .filter((model) => model.id.length > 0);
  return models.length > 0 ? models : undefined;
};

const parsePatch = (toolName: string, args: unknown): ProviderPatch | { error: string } => {
  const record = isRecord(args) ? args : {};

  if (toolName === 'create_connection') {
    const templateId = asString(record.templateId);
    if (!templateId || !(THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
      return { error: `templateId must be one of: ${THIRD_PARTY_TEMPLATE_IDS.join(', ')}` };
    }
    return {
      op: 'create',
      templateId: templateId as ThirdPartyTemplateId,
      name: asString(record.name),
      baseUrl: asString(record.baseUrl),
      protocol: asProtocol(record.protocol),
      modelId: asString(record.modelId),
      models: asModelOptions(record.models),
    };
  }

  const connectionId = asString(record.connectionId);
  if (!connectionId) {
    return { error: 'connectionId is required' };
  }

  return {
    op: 'update',
    connectionId,
    set: {
      name: asString(record.name),
      baseUrl: asString(record.baseUrl),
      protocol: asProtocol(record.protocol),
      enabled: asBoolean(record.enabled),
      modelId: asString(record.modelId),
    },
    addModels: asModelOptions(record.addModels),
    replaceModels: asModelOptions(record.replaceModels),
  };
};

export const createProviderTools = (deps: ProviderToolsDeps): StandardClientFunctions => {
  const writeApiKey = (connectionId: string, apiKey: string): void => {
    deps.setConnections(
      updateThirdPartyConnection({ connections: deps.getConnections() }, connectionId, { apiKey }).connections,
    );
  };

  const runPatch = async (patch: ProviderPatch): Promise<unknown> => {
    const verdict = planProviderPatch(patch, deps.getConnections());

    if (verdict.kind === 'rejected') {
      return { status: 'rejected', error: verdict.error };
    }

    if (verdict.kind === 'needs-approval') {
      return {
        status: 'approval-unavailable',
        reason: verdict.reason,
        message:
          'This change would overwrite or delete an existing connection. Tell the user what you wanted to change and let them confirm it in the settings UI.',
      };
    }

    if (verdict.changed.length === 0) {
      return { status: 'unchanged', connectionId: verdict.connectionId };
    }

    deps.setConnections(verdict.nextConnections);
    const connection = deps.getConnections().find((candidate) => candidate.id === verdict.connectionId);
    if (!connection) {
      return { status: 'rejected', error: 'Connection disappeared right after the write.' };
    }

    if (patch.op === 'update') {
      return { status: 'updated', connectionId: connection.id, name: connection.name, changed: verdict.changed };
    }

    if (connection.authOptional || connection.apiKey?.trim()) {
      return { status: 'created', connectionId: connection.id, name: connection.name };
    }

    const apiKey = await deps.requestApiKey({ connectionId: connection.id, connectionName: connection.name });
    if (!apiKey) {
      return {
        status: 'aborted',
        connectionId: connection.id,
        message: 'The user did not enter an API key. Do not ask for it in chat; it can only be entered in the card.',
      };
    }

    writeApiKey(connection.id, apiKey);
    return { status: 'key-configured', connectionId: connection.id, name: connection.name };
  };

  const handlePatch = async (toolName: string, args: unknown) => {
    const patch = parsePatch(toolName, args);
    if ('error' in patch) {
      return { response: { status: 'rejected', error: patch.error } };
    }
    return { response: await runPatch(patch) };
  };

  return {
    list_templates: {
      declaration: DECLARATIONS.list_templates,
      handler: async () => ({ response: { templates: listTemplateSummaries() } }),
    },
    list_connections: {
      declaration: DECLARATIONS.list_connections,
      handler: async () => ({ response: { connections: deps.getConnections().map(toConnectionSummary) } }),
    },
    create_connection: {
      declaration: DECLARATIONS.create_connection,
      handler: (args) => handlePatch('create_connection', args),
    },
    update_connection: {
      declaration: DECLARATIONS.update_connection,
      handler: (args) => handlePatch('update_connection', args),
    },
  };
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/providerTools.test.ts`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/settings-assistant/providerTools.ts src/features/settings-assistant/providerTools.test.ts
git commit -m "feat(settings-assistant): add provider config tools with key handoff"
```

---

### Task 5: 红队测试（密钥永不进模型上下文）

**Files:**

- Create: `src/features/settings-assistant/noSecretLeakFromAssistant.test.ts`

**Interfaces:**

- Consumes: `runStandardToolLoop`（`@/features/standard-chat/standardToolLoop`）；`createProviderTools` / `PROVIDER_TOOL_DECLARATIONS`（Task 4）；`createThirdPartyConnection`（测试工厂）
- Produces: 无（验证性测试）；后续任务修改工具层时此测试必须保持绿

- [ ] **Step 1: 写测试**

创建 `src/features/settings-assistant/noSecretLeakFromAssistant.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { runStandardToolLoop } from '@/features/standard-chat/standardToolLoop';
import type { ThirdPartyConnection } from '@/types';
import { createThirdPartyConnection } from '@/test/data/factories';
import { PROVIDER_TOOL_DECLARATIONS, createProviderTools } from './providerTools';

const STORED_KEY_CANARY = 'sk-LEAKCANARY-stored-0001';
const HEADER_CANARY = 'header-LEAKCANARY-0002';
const TYPED_KEY_CANARY = 'sk-LEAKCANARY-typed-0003';

const propertiesOf = (name: string): string[] =>
  Object.keys(
    PROVIDER_TOOL_DECLARATIONS.find((declaration) => declaration.name === name)?.parameters?.properties ?? {},
  );

describe('assistant secret containment', () => {
  it('never sends stored keys, header values or typed keys to the model', async () => {
    let connections: ThirdPartyConnection[] = [
      createThirdPartyConnection({
        id: 'c1',
        name: 'Existing',
        apiKey: STORED_KEY_CANARY,
        extraHeaders: { 'X-Token': HEADER_CANARY },
      }),
    ];

    const tools = createProviderTools({
      getConnections: () => connections,
      setConnections: (next) => {
        connections = next;
      },
      requestApiKey: async () => TYPED_KEY_CANARY,
    });

    const sentToModel: string[] = [];
    const runTurn = async (contents: unknown) => {
      sentToModel.push(JSON.stringify(contents));
      return sentToModel.length === 1
        ? {
            modelContent: { role: 'model' as const, parts: [] },
            parts: [],
            functionCalls: [
              { id: 'call-1', name: 'list_connections', args: {} },
              { id: 'call-2', name: 'create_connection', args: { templateId: 'deepseek' } },
            ],
          }
        : {
            modelContent: { role: 'model' as const, parts: [{ text: 'done' }] },
            parts: [{ text: 'done' }],
            functionCalls: [],
          };
    };

    const result = await runStandardToolLoop({
      initialContents: [{ role: 'user', parts: [{ text: '帮我配一个 DeepSeek' }] }],
      clientFunctions: tools,
      runTurn,
    });

    const everythingSentToModel = JSON.stringify({ sentToModel, toolMessages: result.toolMessages });
    expect(everythingSentToModel).not.toContain(STORED_KEY_CANARY);
    expect(everythingSentToModel).not.toContain(HEADER_CANARY);
    expect(everythingSentToModel).not.toContain(TYPED_KEY_CANARY);

    // The keys must still land in settings — otherwise this test would pass
    // simply because the handoff silently dropped them.
    expect(connections.find((connection) => connection.id === 'c1')?.apiKey).toBe(STORED_KEY_CANARY);
    expect(connections.find((connection) => connection.name === 'DeepSeek')?.apiKey).toBe(TYPED_KEY_CANARY);
  });

  it('exposes no apiKey parameter on the write tools', () => {
    expect(propertiesOf('create_connection')).not.toContain('apiKey');
    expect(propertiesOf('update_connection')).not.toContain('apiKey');
    expect(JSON.stringify(PROVIDER_TOOL_DECLARATIONS)).not.toContain(STORED_KEY_CANARY);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/noSecretLeakFromAssistant.test.ts`  
Expected: PASS（Task 1–4 已实现）。若 FAIL 于 canary 出现在 `sentToModel` 中，说明某个只读视图泄漏了密钥或 header 值，修 `providerRedaction.ts` 而不是放宽断言。

- [ ] **Step 3: 提交**

```bash
git add src/features/settings-assistant/noSecretLeakFromAssistant.test.ts
git commit -m "test(settings-assistant): assert api keys never reach the model context"
```

---

### Task 6: 助手通道与系统提示词

**Files:**

- Create: `src/features/prompts/settingsAssistant.ts`
- Create: `src/features/settings-assistant/assistantChannel.ts`
- Test: `src/features/settings-assistant/assistantChannel.test.ts`
- Modify: `src/features/prompts/promptRegistry.ts`（追加一个懒加载导出）

**Interfaces:**

- Consumes: `generateContentTurnApi`（`@/services/api/chatApi`）；`getGeminiKeyForRequest`（`@/utils/apiKeySelection`）；`DEFAULT_MODEL_ID`（`@/constants/modelConfiguration`）；`PROVIDER_TOOL_DECLARATIONS`（Task 4）；`ChatHistoryItem` / `AppSettings` / `ChatSettings`（`@/types`）
- Produces:
  - `const SETTINGS_ASSISTANT_SYSTEM_PROMPT: string`（`src/features/prompts/settingsAssistant.ts`）
  - `loadSettingsAssistantSystemPrompt(): Promise<string>`（`promptRegistry.ts`）
  - `type AssistantChannel = { ok: true; key: string; modelId: string } | { ok: false; reason: 'no-gemini-key' }`
  - `resolveAssistantChannel(appSettings: AppSettings, modelId?: string): AssistantChannel`
  - `createAssistantRunTurn(options: { channel: Extract<AssistantChannel, { ok: true }>; abortSignal: AbortSignal }): (contents: ChatHistoryItem[]) => Promise<StandardToolTurnResult>`

- [ ] **Step 1: 写失败的测试**

创建 `src/features/settings-assistant/assistantChannel.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGeminiKeyForRequest, mockGenerateContentTurnApi, mockLoadPrompt } = vi.hoisted(() => ({
  mockGetGeminiKeyForRequest: vi.fn(),
  mockGenerateContentTurnApi: vi.fn(),
  mockLoadPrompt: vi.fn(async () => 'system prompt'),
}));

vi.mock('@/utils/apiKeySelection', () => ({ getGeminiKeyForRequest: mockGetGeminiKeyForRequest }));
vi.mock('@/services/api/chatApi', () => ({ generateContentTurnApi: mockGenerateContentTurnApi }));
vi.mock('@/features/prompts/promptRegistry', () => ({
  loadSettingsAssistantSystemPrompt: mockLoadPrompt,
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { SERVER_MANAGED_API_KEY } from '../../shared/serverManagedApiKey';
import { createAssistantRunTurn, resolveAssistantChannel } from './assistantChannel';

describe('resolveAssistantChannel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is unavailable when no Gemini key can be resolved', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    expect(resolveAssistantChannel(DEFAULT_APP_SETTINGS)).toEqual({ ok: false, reason: 'no-gemini-key' });
  });

  it('accepts the server-managed key sentinel', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ key: SERVER_MANAGED_API_KEY, isNewKey: false });
    expect(resolveAssistantChannel(DEFAULT_APP_SETTINGS)).toEqual({
      ok: true,
      key: SERVER_MANAGED_API_KEY,
      modelId: expect.any(String),
    });
  });
});

describe('createAssistantRunTurn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs a turn with tool declarations and no built-in tools', async () => {
    mockGenerateContentTurnApi.mockResolvedValue({
      modelContent: { role: 'model', parts: [] },
      parts: [],
      functionCalls: [],
    });
    const channel = { ok: true as const, key: 'k', modelId: 'gemini-3.8-flash' };
    const controller = new AbortController();

    await createAssistantRunTurn({ channel, abortSignal: controller.signal })([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);

    const [key, modelId, , config, abortSignal] = mockGenerateContentTurnApi.mock.calls[0];
    expect(key).toBe('k');
    expect(modelId).toBe('gemini-3.8-flash');
    expect(abortSignal).toBe(controller.signal);
    expect(config.systemInstruction).toBe('system prompt');
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toContain('create_connection');
    expect(config.tools[0].googleSearch).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/assistantChannel.test.ts`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写系统提示词**

创建 `src/features/prompts/settingsAssistant.ts`：

```ts
export const SETTINGS_ASSISTANT_SYSTEM_PROMPT = `You configure third-party API providers inside the user's settings.

Rules:
1. Call list_templates first when the provider is a known vendor, and use the template defaults (base URL, protocol, model) instead of inventing values. Only pass a baseUrl the user gave you or that you are confident about; when you infer one, say so.
2. NEVER ask the user for an API key in chat and never try to read one. When a connection needs a key, create_connection returns awaiting-key and the UI shows a secure card. Do not repeat the request; wait for the result.
3. After creating or changing a connection, report what changed in one short sentence.
4. update_connection refuses destructive changes (overwriting an existing base URL, protocol, model id, model catalog, or deleting) with status approval-unavailable. When that happens, describe the intended change and let the user confirm it in the settings UI. Do not retry the same call.
5. Prefer addModels over replaceModels: replacing the catalog discards models the user added by hand.
6. Answer in the language the user writes in. Keep replies short.`;
```

- [ ] **Step 4: 在 `promptRegistry.ts` 追加懒加载导出**

在 `src/features/prompts/promptRegistry.ts` 末尾追加（与 `loadLocalPythonSystemPrompt` 同一模式）：

```ts
export const loadSettingsAssistantSystemPrompt = async () =>
  (await import('./settingsAssistant')).SETTINGS_ASSISTANT_SYSTEM_PROMPT;
```

- [ ] **Step 5: 实现 `assistantChannel.ts`**

```ts
import type { ChatHistoryItem, ChatSettings, AppSettings } from '@/types';
import { generateContentTurnApi } from '@/services/api/chatApi';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import { loadSettingsAssistantSystemPrompt } from '@/features/prompts/promptRegistry';
import { PROVIDER_TOOL_DECLARATIONS } from './providerTools';

export type AssistantChannel = { ok: true; key: string; modelId: string } | { ok: false; reason: 'no-gemini-key' };

/**
 * The assistant runs on the Gemini-native route only: it is the one route whose
 * client-side tool loop is implemented, and it is independent of whichever
 * model the user happens to be chatting with.
 */
export const resolveAssistantChannel = (
  appSettings: AppSettings,
  modelId: string = DEFAULT_MODEL_ID,
): AssistantChannel => {
  // Mirrors getLiveApiKey: a minimal ChatSettings is enough for the Gemini
  // route to resolve, since apiMode is forced to 'gemini-native' internally.
  const keyResult = getGeminiKeyForRequest(appSettings, { modelId } as ChatSettings);
  if ('error' in keyResult) {
    return { ok: false, reason: 'no-gemini-key' };
  }
  return { ok: true, key: keyResult.key, modelId };
};

export const createAssistantRunTurn =
  ({ channel, abortSignal }: { channel: Extract<AssistantChannel, { ok: true }>; abortSignal: AbortSignal }) =>
  async (contents: ChatHistoryItem[]) => {
    const systemInstruction = await loadSettingsAssistantSystemPrompt();
    return generateContentTurnApi(
      channel.key,
      channel.modelId,
      contents,
      {
        systemInstruction,
        temperature: 0.2,
        // No built-in tools here: mixing googleSearch/codeExecution with custom
        // declarations is only supported on Gemini 3, and this config must
        // always end up with the declarations appended.
        tools: [{ functionDeclarations: PROVIDER_TOOL_DECLARATIONS }],
      },
      abortSignal,
    );
  };
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/assistantChannel.test.ts`  
Expected: PASS。若 `generateContentTurnApi` 的返回类型与 `runStandardToolLoop` 的 `StandardToolTurnResult` 不兼容，在 `useSettingsAssistant.ts`（Task 7）里做显式类型标注，**不要**修改 `chatApi.ts`。

- [ ] **Step 7: 提交**

```bash
git add src/features/prompts/settingsAssistant.ts src/features/prompts/promptRegistry.ts src/features/settings-assistant/assistantChannel.ts src/features/settings-assistant/assistantChannel.test.ts
git commit -m "feat(settings-assistant): add gemini assistant channel and system prompt"
```

---

### Task 7: 驱动 hook `useSettingsAssistant`

**Files:**

- Create: `src/features/settings-assistant/useSettingsAssistant.ts`
- Test: `src/features/settings-assistant/useSettingsAssistant.test.tsx`

**Interfaces:**

- Consumes: `runStandardToolLoop`（`@/features/standard-chat/standardToolLoop`）；`useSettingsStore`（`@/stores/settingsStore`）；`useSettingsAssistantStore` / `createAssistantItemId`（Task 3）；`createProviderTools`（Task 4）；`resolveAssistantChannel` / `createAssistantRunTurn`（Task 6）；`renderHookWithProviders`（`@/test/render/providerRenderer`）
- Produces: `useSettingsAssistant(): { items: AssistantItem[]; status: AssistantStatus; channel: AssistantChannel; canSend: boolean; send: (text: string) => Promise<void>; stop: () => void }`

- [ ] **Step 1: 写失败的测试**

创建 `src/features/settings-assistant/useSettingsAssistant.test.tsx`：

```tsx
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '@/test/render/providerRenderer';

const { mockRunStandardToolLoop, mockGetGeminiKeyForRequest } = vi.hoisted(() => ({
  mockRunStandardToolLoop: vi.fn(),
  mockGetGeminiKeyForRequest: vi.fn(),
}));

vi.mock('@/features/standard-chat/standardToolLoop', () => ({
  runStandardToolLoop: mockRunStandardToolLoop,
  DEFAULT_TOOL_LOOP_ROUNDS: 50,
}));
vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mockGetGeminiKeyForRequest,
  parseApiKeys: vi.fn(() => []),
  getKeyForRequest: vi.fn(),
  resolveChatApiRoute: vi.fn(),
}));
vi.mock('@/features/prompts/promptRegistry', () => ({
  loadSettingsAssistantSystemPrompt: vi.fn(async () => 'system'),
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsAssistant } from './useSettingsAssistant';

describe('useSettingsAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
    useSettingsStore.setState({ appSettings: DEFAULT_APP_SETTINGS, isSettingsLoaded: true });
    mockGetGeminiKeyForRequest.mockReturnValue({ key: 'gemini-key', isNewKey: false });
  });

  it('reports canSend false and does not call the model without a Gemini channel', async () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    const { result } = renderHookWithProviders(() => useSettingsAssistant());

    expect(result.current.canSend).toBe(false);
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });
    expect(mockRunStandardToolLoop).not.toHaveBeenCalled();
    expect(useSettingsAssistantStore.getState().items).toEqual([]);
  });

  it('appends the user message, runs the loop and records the final answer', async () => {
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: '已添加 DeepSeek' }] },
      toolMessages: [],
      generatedFiles: [],
    });

    const { result } = renderHookWithProviders(() => useSettingsAssistant());
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    const items = useSettingsAssistantStore.getState().items;
    expect(items[0]).toMatchObject({ kind: 'user', text: '加一个 DeepSeek' });
    expect(items.at(-1)).toMatchObject({ kind: 'assistant', text: '已添加 DeepSeek' });
    expect(useSettingsAssistantStore.getState().status).toBe('idle');
  });

  it('records a tool item per function call and settles it with the response', async () => {
    mockRunStandardToolLoop.mockImplementation(
      async (options: { onToolCallsStarted?: Function; onToolResponsesSettled?: Function }) => {
        options.onToolCallsStarted?.({
          role: 'model',
          parts: [{ functionCall: { id: 'call-1', name: 'create_connection', args: { templateId: 'deepseek' } } }],
        });
        options.onToolResponsesSettled?.([
          { functionResponse: { id: 'call-1', name: 'create_connection', response: { status: 'key-configured' } } },
        ]);
        return {
          finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: 'done' }] },
          toolMessages: [],
          generatedFiles: [],
        };
      },
    );

    const { result } = renderHookWithProviders(() => useSettingsAssistant());
    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    const toolItem = useSettingsAssistantStore.getState().items.find((item) => item.kind === 'tool');
    expect(toolItem).toMatchObject({ name: 'create_connection', status: 'done', detail: 'key-configured' });
  });

  it('surfaces a loop failure as an error item', async () => {
    mockRunStandardToolLoop.mockRejectedValue(new Error('boom'));
    const { result } = renderHookWithProviders(() => useSettingsAssistant());

    await act(async () => {
      await result.current.send('加一个 DeepSeek');
    });

    expect(useSettingsAssistantStore.getState().items.at(-1)).toMatchObject({ kind: 'error', message: 'boom' });
    expect(useSettingsAssistantStore.getState().status).toBe('error');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/useSettingsAssistant.test.tsx`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `useSettingsAssistant.ts`**

```ts
import { useMemo, useRef } from 'react';
import type { Part } from '@google/genai';
import type { ChatHistoryItem, ThirdPartyConnection } from '@/types';
import { runStandardToolLoop } from '@/features/standard-chat/standardToolLoop';
import { getErrorMessage } from '@/utils/errorMessage';
import { useSettingsStore } from '@/stores/settingsStore';
import { createAssistantItemId, useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { resolveAssistantChannel, createAssistantRunTurn } from './assistantChannel';
import { createProviderTools } from './providerTools';

const ASSISTANT_MAX_TOOL_ROUNDS = 12;

// ChatHistoryItem (Content & { parts: Part[]; role }) is what the tool loop
// hands to these callbacks — not the UI's ChatMessage.
const readFunctionCalls = (message: ChatHistoryItem): Array<{ id?: string; name?: string }> =>
  (message.parts ?? [])
    .map((part) => part.functionCall)
    .filter((call): call is NonNullable<typeof call> => Boolean(call?.name));

const readFunctionResponses = (parts: Part[]): Array<{ id?: string; name?: string; response?: unknown }> =>
  (parts ?? [])
    .map((part) => part.functionResponse)
    .filter((response): response is NonNullable<typeof response> => Boolean(response?.name));

const describeToolResponse = (response: unknown): { status: 'done' | 'error'; detail: string | null } => {
  if (response && typeof response === 'object' && 'error' in response) {
    const error = (response as { error?: unknown }).error;
    return { status: 'error', detail: typeof error === 'string' ? error : 'error' };
  }
  if (response && typeof response === 'object' && 'status' in response) {
    const status = (response as { status?: unknown }).status;
    return { status: 'done', detail: typeof status === 'string' ? status : null };
  }
  return { status: 'done', detail: null };
};

export const useSettingsAssistant = () => {
  const appSettings = useSettingsStore((state) => state.appSettings);
  const items = useSettingsAssistantStore((state) => state.items);
  const status = useSettingsAssistantStore((state) => state.status);
  const abortRef = useRef<AbortController | null>(null);
  const channel = useMemo(() => resolveAssistantChannel(appSettings), [appSettings]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !channel.ok) return;

    const store = useSettingsAssistantStore.getState();
    store.appendItem({ kind: 'user', id: createAssistantItemId(), text: trimmed });
    store.setStatus('running');

    const controller = new AbortController();
    abortRef.current = controller;

    const tools = createProviderTools({
      getConnections: () => useSettingsStore.getState().appSettings.thirdPartyApi.connections,
      // Always read the freshest settings: the user may be editing the same
      // connection by hand while the assistant is running.
      setConnections: (next: ThirdPartyConnection[]) =>
        useSettingsStore.getState().setAppSettings((prev) => ({
          ...prev,
          thirdPartyApi: { ...prev.thirdPartyApi, connections: next },
        })),
      requestApiKey: (request) => useSettingsAssistantStore.getState().requestApiKey(request),
    });

    try {
      const result = await runStandardToolLoop({
        initialContents: [{ role: 'user', parts: [{ text: trimmed }] }],
        clientFunctions: tools,
        runTurn: createAssistantRunTurn({ channel, abortSignal: controller.signal }),
        abortSignal: controller.signal,
        maxToolRounds: ASSISTANT_MAX_TOOL_ROUNDS,
        onToolCallsStarted: (modelContent) => {
          for (const call of readFunctionCalls(modelContent)) {
            useSettingsAssistantStore.getState().appendItem({
              kind: 'tool',
              // Gemini normally supplies an id; falling back to the name keeps
              // the started/settled pair correlated when it does not.
              id: call.id ?? call.name ?? createAssistantItemId(),
              name: call.name ?? 'tool',
              status: 'running',
              detail: null,
            });
          }
        },
        onToolResponsesSettled: (parts) => {
          for (const response of readFunctionResponses(parts)) {
            const { status: toolStatus, detail } = describeToolResponse(response.response);
            useSettingsAssistantStore.getState().updateToolItem(response.id ?? response.name ?? '', {
              status: toolStatus,
              detail,
            });
          }
        },
      });

      const finalText = result.finalTurn.parts
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (finalText) {
        useSettingsAssistantStore.getState().appendItem({
          kind: 'assistant',
          id: createAssistantItemId(),
          text: finalText,
        });
      }
      useSettingsAssistantStore.getState().setStatus('idle');
    } catch (error) {
      useSettingsAssistantStore.getState().appendItem({
        kind: 'error',
        id: createAssistantItemId(),
        message: getErrorMessage(error),
      });
      useSettingsAssistantStore.getState().setStatus('error');
    } finally {
      abortRef.current = null;
      useSettingsAssistantStore.getState().cancelApiKey();
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  return {
    items,
    status,
    channel,
    canSend: channel.ok && status !== 'running' && status !== 'awaiting-key',
    send,
    stop,
  };
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/features/settings-assistant/useSettingsAssistant.test.tsx`  
Expected: PASS。若报错说 `@/utils/apiKeySelection` 缺少某个导出，按报错把该导出补进测试顶部的 `vi.mock` 工厂（**不要**为了测试去改 `apiKeySelection.ts` 的实现）。

- [ ] **Step 5: 提交**

```bash
git add src/features/settings-assistant/useSettingsAssistant.ts src/features/settings-assistant/useSettingsAssistant.test.tsx
git commit -m "feat(settings-assistant): drive the tool loop from a settings hook"
```

---

### Task 8: 卡片组件（密钥交接 / 变更 / 消息列表）

**Files:**

- Create: `src/components/settings/sections/providers/assistant/ApiKeyHandoffCard.tsx`
- Create: `src/components/settings/sections/providers/assistant/ConnectionChangeCard.tsx`
- Create: `src/components/settings/sections/providers/assistant/AssistantMessageList.tsx`
- Test: `src/components/settings/sections/providers/assistant/AssistantMessageList.test.tsx`

**Interfaces:**

- Consumes: `ApiKeyInput`（`@/components/settings/sections/api-config/ApiKeyInput`）；`useSettingsAssistantStore`（Task 3）；`useI18n`（`@/contexts/I18nContext`）；`AssistantItem` 类型（Task 3）
- Produces: `ApiKeyHandoffCard({ connectionId, connectionName })`、`ConnectionChangeCard({ changed })`、`AssistantMessageList({ items })`

- [ ] **Step 1: 写失败的测试**

创建 `src/components/settings/sections/providers/assistant/AssistantMessageList.test.tsx`：

```tsx
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { AssistantMessageList } from './AssistantMessageList';

describe('AssistantMessageList', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
  });

  it('renders user and assistant bubbles', () => {
    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[
            { kind: 'user', id: 'u1', text: 'Add DeepSeek' },
            { kind: 'assistant', id: 'a1', text: 'Added DeepSeek' },
          ]}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Add DeepSeek');
    expect(renderer.container.textContent).toContain('Added DeepSeek');
  });

  it('renders a tool row with its status, and a change card for writes', () => {
    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[
            { kind: 'tool', id: 'call-1', name: 'create_connection', status: 'done', detail: 'key-configured' },
            { kind: 'change', id: 'ch1', connectionId: 'c1', changed: ['created'] },
          ]}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="assistant-tool-call-1"]')).not.toBeNull();
    expect(
      renderer.container.querySelector('[data-testid="assistant-tool-call-1"]')?.getAttribute('data-tool-name'),
    ).toBe('create_connection');
    expect(renderer.container.textContent).toContain('Create connection');
    expect(renderer.container.querySelector('[data-testid="assistant-change-c1"]')).not.toBeNull();
  });

  it('renders the api key card with a unique input id and submits the typed key', () => {
    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[{ kind: 'key-request', id: 'k1', connectionId: 'c1', connectionName: 'DeepSeek' }]}
        />,
      );
    });

    const input = renderer.container.querySelector<HTMLTextAreaElement>('#assistant-handoff-c1');
    expect(input).not.toBeNull();

    act(() => {
      input!.value = 'sk-typed';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  it('renders an error item', () => {
    act(() => {
      renderer.root.render(<AssistantMessageList items={[{ kind: 'error', id: 'e1', message: 'boom' }]} />);
    });

    expect(renderer.container.textContent).toContain('boom');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/providers/assistant/AssistantMessageList.test.tsx`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现三个组件**

`ApiKeyHandoffCard.tsx`：

```tsx
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { ApiKeyInput } from '@/components/settings/sections/api-config/ApiKeyInput';
import { SETTINGS_SECONDARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';

interface ApiKeyHandoffCardProps {
  connectionId: string;
  connectionName: string;
}

/**
 * The only place an API key may be entered. The value goes straight from this
 * input into settings; it is never part of a model request.
 */
export const ApiKeyHandoffCard: React.FC<ApiKeyHandoffCardProps> = ({ connectionId, connectionName }) => {
  const { t } = useI18n();
  const [value, setValue] = useState<string | null>(null);
  const submitApiKey = useSettingsAssistantStore((state) => state.submitApiKey);
  const cancelApiKey = useSettingsAssistantStore((state) => state.cancelApiKey);
  const trimmed = value?.trim() ?? '';

  return (
    <div
      data-testid={`assistant-key-card-${connectionId}`}
      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-3 space-y-2"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-text-primary)]">
        <KeyRound size={14} />
        <span>{t('assistantApiKeyTitle', { name: connectionName })}</span>
      </div>
      <ApiKeyInput
        apiKey={value}
        setApiKey={setValue}
        inputId={`assistant-handoff-${connectionId}`}
        helpText={t('assistantApiKeyHelp')}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => {
            submitApiKey(trimmed);
            setValue(null);
          }}
          className="px-2.5 py-1 rounded-md text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] disabled:opacity-40"
        >
          {t('assistantApiKeySubmit')}
        </button>
        <button type="button" onClick={() => cancelApiKey()} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
          {t('assistantApiKeyCancel')}
        </button>
      </div>
    </div>
  );
};
```

`ConnectionChangeCard.tsx`：

```tsx
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface ConnectionChangeCardProps {
  connectionId: string;
  changed: string[];
}

/** Field names are data, not copy, so they stay in their wire form. */
export const ConnectionChangeCard: React.FC<ConnectionChangeCardProps> = ({ connectionId, changed }) => {
  const { t } = useI18n();

  return (
    <div
      data-testid={`assistant-change-${connectionId}`}
      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-3 space-y-1.5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-text-primary)]">
        <CheckCircle2 size={14} className="text-[var(--theme-text-success)]" />
        <span>{t('assistantChangeApplied')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {changed.map((field) => (
          <code
            key={field}
            className="px-1.5 py-0.5 rounded bg-[var(--theme-bg-tertiary)] text-[11px] text-[var(--theme-text-secondary)]"
          >
            {field}
          </code>
        ))}
      </div>
    </div>
  );
};
```

`AssistantMessageList.tsx`：

```tsx
import React from 'react';
import { AlertCircle, Loader2, Wrench } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AssistantItem } from '@/stores/settingsAssistantStore';
import { ApiKeyHandoffCard } from './ApiKeyHandoffCard';
import { ConnectionChangeCard } from './ConnectionChangeCard';

/** Tool display names are UI copy, so they are translated rather than shown raw. */
const TOOL_LABEL_KEYS: Record<string, string> = {
  list_templates: 'assistantToolListTemplates',
  list_connections: 'assistantToolListConnections',
  create_connection: 'assistantToolCreateConnection',
  update_connection: 'assistantToolUpdateConnection',
};

interface AssistantMessageListProps {
  items: AssistantItem[];
}

export const AssistantMessageList: React.FC<AssistantMessageListProps> = ({ items }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg bg-[var(--theme-bg-accent)] px-3 py-2 text-xs text-[var(--theme-text-accent)] whitespace-pre-wrap">
                  {item.text}
                </div>
              </div>
            );
          case 'assistant':
            return (
              <div key={item.id} className="max-w-[90%] text-xs text-[var(--theme-text-primary)] whitespace-pre-wrap">
                {item.text}
              </div>
            );
          case 'tool': {
            const labelKey = TOOL_LABEL_KEYS[item.name];
            return (
              <div
                key={item.id}
                data-testid={`assistant-tool-${item.id}`}
                data-tool-name={item.name}
                className="flex items-center gap-2 text-[11px] text-[var(--theme-text-secondary)]"
              >
                {item.status === 'running' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Wrench size={12} className={item.status === 'error' ? 'text-[var(--theme-text-error)]' : ''} />
                )}
                <span>{labelKey ? t(labelKey) : item.name}</span>
                {item.detail ? <span>· {item.detail}</span> : null}
              </div>
            );
          }
          case 'change':
            return <ConnectionChangeCard key={item.id} connectionId={item.connectionId} changed={item.changed} />;
          case 'key-request':
            return (
              <ApiKeyHandoffCard key={item.id} connectionId={item.connectionId} connectionName={item.connectionName} />
            );
          case 'error':
            return (
              <div key={item.id} className="flex items-center gap-2 text-xs text-[var(--theme-text-error)]">
                <AlertCircle size={13} />
                <span>{item.message}</span>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/providers/assistant/AssistantMessageList.test.tsx`  
Expected: PASS。若 `SETTINGS_SECONDARY_ACTION_BUTTON_CLASS` 不在 `@/constants/buttonClasses` 中，用 `grep -rn "SECONDARY_ACTION_BUTTON" src/constants` 找到实际导出名并替换。

- [ ] **Step 5: 提交**

```bash
git add src/components/settings/sections/providers/assistant/
git commit -m "feat(settings-assistant): add key handoff, change and message list cards"
```

---

### Task 9: 面板、挂载与 i18n

**Files:**

- Create: `src/components/settings/sections/providers/assistant/ProviderAssistantPanel.tsx`
- Test: `src/components/settings/sections/providers/assistant/ProviderAssistantPanel.test.tsx`
- Modify: `src/components/settings/sections/providers/ProviderSettingsSection.tsx`（在隐藏 file input 之后、`thirdPartyManagementTitle` 头部之前插入一行）
- Modify: `src/i18n/translations/settings/api.ts`（在 `apiSettings` 对象内追加 key）

**Interfaces:**

- Consumes: `useSettingsAssistant`（Task 7）；`AssistantMessageList`（Task 8）；`SETTINGS_INPUT_CLASS`（`@/constants/formClasses`）
- Produces: `ProviderAssistantPanel()`（无 props）

- [ ] **Step 1: 写失败的测试**

创建 `src/components/settings/sections/providers/assistant/ProviderAssistantPanel.test.tsx`：

```tsx
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';

const { mockGetGeminiKeyForRequest, mockRunStandardToolLoop } = vi.hoisted(() => ({
  mockGetGeminiKeyForRequest: vi.fn(),
  mockRunStandardToolLoop: vi.fn(),
}));

vi.mock('@/utils/apiKeySelection', () => ({
  getGeminiKeyForRequest: mockGetGeminiKeyForRequest,
  parseApiKeys: vi.fn(() => []),
  getKeyForRequest: vi.fn(),
  resolveChatApiRoute: vi.fn(),
}));
vi.mock('@/features/standard-chat/standardToolLoop', () => ({
  runStandardToolLoop: mockRunStandardToolLoop,
  DEFAULT_TOOL_LOOP_ROUNDS: 50,
}));

import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ProviderAssistantPanel } from './ProviderAssistantPanel';

describe('ProviderAssistantPanel', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
    useSettingsStore.setState({ appSettings: DEFAULT_APP_SETTINGS, isSettingsLoaded: true });
  });

  it('disables the channel message when no Gemini key is configured', () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ error: 'API Key not configured.' });
    act(() => {
      renderer.root.render(<ProviderAssistantPanel />);
    });

    expect(renderer.container.querySelector('[data-testid="assistant-channel-disabled"]')).not.toBeNull();
  });

  it('sends the typed text through the assistant hook', async () => {
    mockGetGeminiKeyForRequest.mockReturnValue({ key: 'gemini-key', isNewKey: false });
    mockRunStandardToolLoop.mockResolvedValue({
      finalTurn: { modelContent: { role: 'model', parts: [] }, parts: [{ text: 'ok' }] },
      toolMessages: [],
      generatedFiles: [],
    });

    act(() => {
      renderer.root.render(<ProviderAssistantPanel />);
    });

    const textarea = renderer.container.querySelector<HTMLTextAreaElement>('[data-testid="assistant-input"]')!;
    await act(async () => {
      textarea.value = '加一个 DeepSeek';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = renderer.container.querySelector<HTMLFormElement>('[data-testid="assistant-form"]')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(useSettingsAssistantStore.getState().items.some((item) => item.kind === 'user')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/providers/assistant/ProviderAssistantPanel.test.tsx`  
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现面板**

`ProviderAssistantPanel.tsx`：

```tsx
import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Send, Square } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { useSettingsAssistant } from '@/features/settings-assistant/useSettingsAssistant';
import { AssistantMessageList } from './AssistantMessageList';

export const ProviderAssistantPanel: React.FC = () => {
  const { t } = useI18n();
  const { items, status, channel, canSend, send, stop } = useSettingsAssistant();
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    setDraft('');
    await send(text);
  };

  return (
    <div data-testid="provider-assistant-panel" className="border-b border-[var(--theme-border-secondary)]/30">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]/40"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Bot size={14} />
        <span>{t('assistantPanelTitle')}</span>
      </button>

      {isOpen ? (
        <div className="px-4 pb-3 space-y-2">
          {channel.ok ? null : (
            <p data-testid="assistant-channel-disabled" className="text-[11px] text-[var(--theme-text-secondary)]">
              {t('assistantChannelUnavailable')}
            </p>
          )}

          {items.length > 0 ? <AssistantMessageList items={items} /> : null}

          <form data-testid="assistant-form" onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              data-testid="assistant-input"
              rows={2}
              value={draft}
              disabled={!channel.ok}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('assistantInputPlaceholder')}
              className={`${SETTINGS_INPUT_CLASS} flex-1 resize-y text-xs`}
            />
            {status === 'running' || status === 'awaiting-key' ? (
              <button
                type="button"
                onClick={stop}
                className="px-2.5 py-1.5 rounded-md text-xs bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend || !draft.trim()}
                className="px-2.5 py-1.5 rounded-md text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 4: 挂载到 `ProviderSettingsSection.tsx`**

在该文件中找到隐藏 file input 的结束标签（`accept=".json,application/json"` 那个 `<input ... />`），在它之后、`thirdPartyManagementTitle` 所在的头部 `<div className="flex items-center justify-between px-4 py-2 border-b ...">` 之前插入：

```tsx
<ProviderAssistantPanel />
```

并在文件顶部 import 区加入：

```tsx
import { ProviderAssistantPanel } from './assistant/ProviderAssistantPanel';
```

- [ ] **Step 5: 追加 i18n（7 语言一次到位）**

在 `src/i18n/translations/settings/api.ts` 的 `apiSettings` 对象内追加：

```ts
  assistantPanelTitle: {
    en: 'AI setup assistant',
    zh: 'AI 配置助手',
    ja: 'AI セットアップアシスタント',
    ko: 'AI 설정 도우미',
    es: 'Asistente de configuración con IA',
    fr: "Assistant de configuration IA",
    de: 'KI-Einrichtungsassistent',
  },
  assistantInputPlaceholder: {
    en: 'Describe the provider you want to add…',
    zh: '描述你要添加的服务商…',
    ja: '追加したいプロバイダーを説明してください…',
    ko: '추가할 공급자를 설명하세요…',
    es: 'Describe el proveedor que quieres añadir…',
    fr: 'Décrivez le fournisseur à ajouter…',
    de: 'Beschreibe den Anbieter, den du hinzufügen möchtest…',
  },
  assistantChannelUnavailable: {
    en: 'The assistant needs a Gemini connection. Add a Gemini API key above, or enable the server-managed key.',
    zh: '助手需要 Gemini 通道：请在上方填入 Gemini API Key，或启用服务端托管密钥。',
    ja: 'アシスタントには Gemini 接続が必要です。上で Gemini API キーを入力するか、サーバー管理キーを有効にしてください。',
    ko: '어시스턴트에는 Gemini 연결이 필요합니다. 위에서 Gemini API 키를 입력하거나 서버 관리 키를 활성화하세요.',
    es: 'El asistente necesita una conexión Gemini. Añade una clave API de Gemini arriba o activa la clave gestionada por el servidor.',
    fr: "L'assistant nécessite une connexion Gemini. Ajoutez une clé API Gemini ci-dessus ou activez la clé gérée par le serveur.",
    de: 'Der Assistent benötigt eine Gemini-Verbindung. Füge oben einen Gemini-API-Schlüssel hinzu oder aktiviere den serverseitigen Schlüssel.',
  },
  assistantApiKeyTitle: {
    en: 'Enter the API key for {name}',
    zh: '请输入 {name} 的 API Key',
    ja: '{name} の API キーを入力してください',
    ko: '{name}의 API 키를 입력하세요',
    es: 'Introduce la clave API de {name}',
    fr: "Saisissez la clé API de {name}",
    de: 'API-Schlüssel für {name} eingeben',
  },
  assistantApiKeyHelp: {
    en: 'Stored locally in your browser. It is never sent to the assistant model.',
    zh: '仅保存在你的浏览器本地，绝不会发送给助手的模型。',
    ja: 'ブラウザにローカル保存されます。アシスタントのモデルには送信されません。',
    ko: '브라우저에만 저장되며 어시스턴트 모델로 전송되지 않습니다.',
    es: 'Se guarda localmente en tu navegador. Nunca se envía al modelo del asistente.',
    fr: "Stockée localement dans votre navigateur. Elle n'est jamais envoyée au modèle de l'assistant.",
    de: 'Wird lokal im Browser gespeichert und nie an das Assistentenmodell gesendet.',
  },
  assistantApiKeySubmit: {
    en: 'Save key',
    zh: '保存密钥',
    ja: 'キーを保存',
    ko: '키 저장',
    es: 'Guardar clave',
    fr: 'Enregistrer la clé',
    de: 'Schlüssel speichern',
  },
  assistantApiKeyCancel: {
    en: 'Not now',
    zh: '暂不填写',
    ja: '後で',
    ko: '나중에',
    es: 'Ahora no',
    fr: 'Plus tard',
    de: 'Nicht jetzt',
  },
  assistantChangeApplied: {
    en: 'Settings updated',
    zh: '设置已更新',
    ja: '設定を更新しました',
    ko: '설정이 업데이트되었습니다',
    es: 'Ajustes actualizados',
    fr: 'Paramètres mis à jour',
    de: 'Einstellungen aktualisiert',
  },
  assistantToolListTemplates: {
    en: 'Reading provider templates',
    zh: '读取服务商模板',
    ja: 'プロバイダーテンプレートを読み込み中',
    ko: '공급자 템플릿 읽는 중',
    es: 'Leyendo plantillas de proveedores',
    fr: 'Lecture des modèles de fournisseurs',
    de: 'Anbieter-Vorlagen werden gelesen',
  },
  assistantToolListConnections: {
    en: 'Reading your connections',
    zh: '读取现有连接',
    ja: '既存の接続を読み込み中',
    ko: '기존 연결 읽는 중',
    es: 'Leyendo tus conexiones',
    fr: 'Lecture de vos connexions',
    de: 'Verbindungen werden gelesen',
  },
  assistantToolCreateConnection: {
    en: 'Create connection',
    zh: '创建连接',
    ja: '接続を作成',
    ko: '연결 생성',
    es: 'Crear conexión',
    fr: 'Créer la connexion',
    de: 'Verbindung erstellen',
  },
  assistantToolUpdateConnection: {
    en: 'Update connection',
    zh: '更新连接',
    ja: '接続を更新',
    ko: '연결 업데이트',
    es: 'Actualizar conexión',
    fr: 'Mettre à jour la connexion',
    de: 'Verbindung aktualisieren',
  },
```

`assistantApiKeyTitle` 使用 `{name}` 插值，因此组件里必须调用 `t('assistantApiKeyTitle', { name: connectionName })`——这一点已在 Task 8 的组件代码中落实。

- [ ] **Step 6: 跑测试与 i18n 校验**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/providers/assistant/ProviderAssistantPanel.test.tsx`  
Expected: PASS。

Run: `pnpm i18n:check`  
Expected: `✓ i18n coverage: N/N keys have en/zh/ja/ko/es/fr/de`。若有 key 报缺语言，补该语言后重跑。

- [ ] **Step 7: 提交**

```bash
git add src/components/settings/sections/providers/assistant/ProviderAssistantPanel.tsx \
  src/components/settings/sections/providers/assistant/ProviderAssistantPanel.test.tsx \
  src/components/settings/sections/providers/ProviderSettingsSection.tsx \
  src/i18n/translations/settings/api.ts
git commit -m "feat(settings-assistant): mount the provider assistant panel with translations"
```

---

### Task 10: PR1 收尾验证

**Files:**

- Modify: 无（只验证；若守卫失败则修对应文件）

**Interfaces:**

- Consumes: Task 1–9 的全部产物
- Produces: 一个可交付的 PR1 分支状态

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`  
Expected: 无错误。`exactOptionalPropertyTypes` 未开启，所以 `parsePatch` 里显式的 `undefined` 可选字段是合法的；若报错，优先检查 `PROVIDER_TOOL_DECLARATIONS` 的 `FunctionDeclaration` 形状是否缺 `parameters`。

- [ ] **Step 2: Lint**

Run: `pnpm lint`  
Expected: 0 error、0 warning（`--max-warnings=0`）。

- [ ] **Step 3: 架构与全量测试**

Run: `pnpm test`  
Expected: 全绿，特别是 `src/test/architecture/*`。若 `projectStructureBoundaries` / `namingStructureOptimizations` 对新目录有额外要求（例如禁止 `src/features` 直接 import `src/components`），把违反的那处依赖改为经 props 注入：`useSettingsAssistant`（feature 层）已经只依赖 store 与 `useSettingsAssistantStore`，组件层依赖 feature 层是允许方向。

- [ ] **Step 4: 构建产物检查**

Run: `pnpm build`  
Expected: 构建成功。若主 chunk 体积告警，确认系统提示词是通过 `promptRegistry` 动态 import 加载（Task 6 Step 4），而不是静态 import 进 feature 层。

- [ ] **Step 5: 全量校验（与 CI 对齐）**

Run: `pnpm verify`  
Expected: `format:check` / `typecheck` / `lint` / `test` / `knip` / `build` / `build:api` 全部通过。`knip` 若报新增文件未被引用，检查是否漏了 Task 9 的挂载 import。

- [ ] **Step 6: 手工冒烟（必须真机验证一次）**

Run: `pnpm dev`，打开设置 → API 与连接：

1. 未配置 Gemini key 时：助手面板显示"助手需要 Gemini 通道"，输入框禁用。
2. 配置 Gemini key 后：输入"加一个 DeepSeek"，观察出现 tool 行 `create_connection` → 密钥卡片 → 填入任意假 key → 列表出现 DeepSeek 连接且标记"未配置密钥/已配置"状态正确。
3. 再次输入"把它的名字改成 DS"，确认变更卡片出现且设置即时生效。
4. 输入"把 baseUrl 改成 https://other.test/v1"，确认返回"需要确认"类提示且**设置未被修改**（PR1 失败关闭）。
5. 打开浏览器 Network，过滤 Gemini 请求：确认请求体与响应体里搜不到刚才输入的真实 key（这是红队测试的手工复核）。

- [ ] **Step 7: 提交最终状态**

```bash
git add -A
git commit -m "chore(settings-assistant): PR1 verification fixes"
```

若前面各步没有任何改动，跳过本次提交（不要创建空提交）。

---

## 后续计划（不在本计划内）

- **PR2**：审批弹窗（覆盖 diff + 删除）、撤销栈、`test_connection`、`fetch_models`、结果卡片、审计日志。届时把 Task 4 的 `approval-unavailable` 分支改为走弹窗，并复用 `ProviderDetail.tsx` 的协议分派（抽成共享 helper）。
- **PR3**：空态/错误态打磨、e2e smoke（Ollama 模板，无需真密钥）、`settingsSearchCatalog` 条目、文档。
