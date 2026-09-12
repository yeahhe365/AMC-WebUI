# 虚拟 MCP 服务商配置助手实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将服务商配置助手重构为前端内置虚拟 MCP Server（`amc_provider_manager`），统一接入现有 MCP 调度与审批体系，并解除对 Gemini 单一通道的强制依赖。

**Architecture:** 在 `src/features/mcp/` 中建立轻量 `virtualMcpRegistry`，允许纯前端服务注册为 `VirtualMcpServer`。`createMcpClientFunctions` 自动聚合虚拟服务的工具并在主线程直接分发执行，保留标准审批门禁与执行生命周期。服务商配置以此形式接入，并由多模型适配通道驱动。

**Tech Stack:** TypeScript, React 18, Zustand, `@google/genai`, Vitest (`node scripts/run-vitest.mjs`).

**Spec:** `docs/superpowers/specs/2026-09-12-virtual-mcp-provider-assistant-design.md`

## Global Constraints

- **密钥物理隔离红线**：参数 Schema 严格不得出现 `apiKey`；只读视图仅返回 `hasApiKey: boolean`；用户通过 `ApiKeyHandoffCard` 在前端 DOM 录入并直接落盘 IndexedDB，模型绝不接触明文密钥。
- **纯内存执行**：内置虚拟 MCP 服务运行于浏览器主线程内存中，不发往 `/api/mcp/*` 后端，兼容静态部署（Pages/CDN）。
- **统一审批流**：复用 `mcpApprovalStore` 与 `McpToolApprovalDialog`，覆盖已有非空字段或删除连接时必须走标准审批。
- **测试命令**：单文件用 `node scripts/run-vitest.mjs run <path>`；全量用 `pnpm test`。收尾运行 `pnpm typecheck`。

---

### Task 1: 虚拟 MCP 注册表 `virtualMcpRegistry.ts`

**Files:**
- Create: `src/features/mcp/virtualMcpRegistry.ts`
- Test: `src/features/mcp/virtualMcpRegistry.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface VirtualMcpServer {
    id: string;
    name: string;
    description: string;
    listTools: () => Promise<McpToolDefinition[]>;
    callTool: (
      toolName: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
      onProgress?: (event: McpToolProgressEvent) => void,
    ) => Promise<unknown>;
  }
  export function registerVirtualMcpServer(server: VirtualMcpServer): () => void;
  export function getVirtualMcpServers(): VirtualMcpServer[];
  export function findVirtualMcpServer(id: string): VirtualMcpServer | undefined;
  export function clearVirtualMcpServers(): void;
  ```

- [ ] **Step 1: 编写失败的测试**

创建 `src/features/mcp/virtualMcpRegistry.test.ts`：
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVirtualMcpServers,
  findVirtualMcpServer,
  getVirtualMcpServers,
  registerVirtualMcpServer,
  type VirtualMcpServer,
} from './virtualMcpRegistry';

describe('virtualMcpRegistry', () => {
  beforeEach(() => {
    clearVirtualMcpServers();
  });

  const createDummyServer = (id: string): VirtualMcpServer => ({
    id,
    name: `Server ${id}`,
    description: `Test server ${id}`,
    listTools: async () => [{ name: 'test_tool', description: 'Test tool' }],
    callTool: vi.fn(),
  });

  it('registers and retrieves virtual servers', () => {
    const server = createDummyServer('test-1');
    const unregister = registerVirtualMcpServer(server);

    expect(getVirtualMcpServers()).toHaveLength(1);
    expect(findVirtualMcpServer('test-1')).toBe(server);

    unregister();
    expect(getVirtualMcpServers()).toHaveLength(0);
    expect(findVirtualMcpServer('test-1')).toBeUndefined();
  });

  it('replaces an existing registration when registering the same id', () => {
    const serverA = createDummyServer('test-1');
    const serverB = { ...createDummyServer('test-1'), name: 'Updated' };

    registerVirtualMcpServer(serverA);
    registerVirtualMcpServer(serverB);

    const servers = getVirtualMcpServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('Updated');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：`node scripts/run-vitest.mjs run src/features/mcp/virtualMcpRegistry.test.ts`  
预期：FAIL，找不到模块 `virtualMcpRegistry`。

- [ ] **Step 3: 编写实现 `virtualMcpRegistry.ts`**

创建 `src/features/mcp/virtualMcpRegistry.ts`。

- [ ] **Step 4: 运行测试验证通过**

运行：`node scripts/run-vitest.mjs run src/features/mcp/virtualMcpRegistry.test.ts`  
预期：PASS。

- [ ] **Step 5: 验证并提交**

---

### Task 2: 虚拟 MCP 服务在 `createMcpClientFunctions` 中的无缝调度

**Files:**
- Modify: `src/features/mcp/mcpClientFunctions.ts`
- Test: `src/features/mcp/mcpClientFunctions.test.ts`

**Interfaces:**
- Consumes: `getVirtualMcpServers`, `findVirtualMcpServer` from `./virtualMcpRegistry`
- Produces: 支持 `virtualServers` 参数，无网络开销直接调用本地方法，支持工具审批与事件追踪。

- [ ] **Step 1: 编写单元测试覆盖虚拟服务调度与审批**

在 `src/features/mcp/mcpClientFunctions.test.ts` 中增加 `describe('virtual server dispatch', ...)`。

- [ ] **Step 2: 运行测试验证失败**

- [ ] **Step 3: 在 `createMcpClientFunctions` 中集成虚拟服务**

在工具拉取阶段加入虚拟服务工具列表，在执行阶段拦截并调用本地 `virtualServer.callTool`。

- [ ] **Step 4: 运行测试验证通过**

运行：`node scripts/run-vitest.mjs run src/features/mcp/mcpClientFunctions.test.ts`

- [ ] **Step 5: 验证并提交**

---

### Task 3: 实现服务商管理虚拟 MCP 服务 `providerVirtualMcpServer.ts`

**Files:**
- Create: `src/features/settings-assistant/providerVirtualMcpServer.ts`
- Test: `src/features/settings-assistant/providerVirtualMcpServer.test.ts`

**Interfaces:**
- Produces:
  `createProviderVirtualMcpServer(deps: ProviderToolsDeps): VirtualMcpServer`
  支持工具：`list_templates`、`list_connections`、`create_connection`、`update_connection`、`test_connection`、`fetch_models`。

- [ ] **Step 1: 编写测试**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 编写 `providerVirtualMcpServer.ts`**
- [ ] **Step 4: 运行测试验证通过**
- [ ] **Step 5: 验证并提交**

---

### Task 4: 助手通道解耦 Gemini 支持第三方模型 `assistantChannel.ts`

**Files:**
- Modify: `src/features/settings-assistant/assistantChannel.ts`
- Modify: `src/features/settings-assistant/useSettingsAssistant.ts`
- Test: `src/features/settings-assistant/assistantChannel.test.ts`

**Interfaces:**
- Produces:
  支持在 Gemini 不可用时，自动选取或支持已配置的第三方 OpenAI 兼容端点作为助手驱动模型，单轮适配 `tools` 与 `tool_calls`。

- [ ] **Step 1: 编写第三方通道适配测试**
- [ ] **Step 2: 运行测试验证失败**
- [ ] **Step 3: 实现多模型适配**
- [ ] **Step 4: 运行测试验证通过**
- [ ] **Step 5: 验证并提交**

---

### Task 5: 集成验证与红队安全性回归

- [ ] **Step 1: 执行红队测试**  
  运行：`node scripts/run-vitest.mjs run src/features/settings-assistant/noSecretLeakFromAssistant.test.ts`  
  断言：所有 API Key 依然绝对零泄露。
- [ ] **Step 2: 运行全量设置助手与 MCP 测试**  
  运行：`node scripts/run-vitest.mjs run src/features/settings-assistant src/features/mcp`
- [ ] **Step 3: TypeScript 静态类型检查**  
  运行：`pnpm typecheck`
