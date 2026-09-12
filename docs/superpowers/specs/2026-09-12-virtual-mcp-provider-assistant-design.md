# 虚拟 MCP 服务商配置助手架构设计

日期：2026-09-12  
范围：`src/features/mcp/`（虚拟 MCP 注册与调度）、`src/features/settings-assistant/`（服务商 MCP 化改造与多模型适配）、`src/features/message-sender/`（工具暴露）、测试与 i18n  
状态：评审通过，进入实现

---

## 1. 背景与目标

原方案（`docs/superpowers/specs/2026-09-12-ai-provider-config-assistant-design.md`）通过在设置页内嵌专有工具环（`providerTools.ts` + `generateContentTurnApi`）实现了服务商配置助手。但存在两大核心瓶颈：
1. **通道锁死 Gemini（先有鸡还是先有蛋）**：助手通道强制依赖 Gemini API Key 或 Docker 托管 Key；对于刚上手 AMC-WebUI、只有 DeepSeek/SiliconFlow/Ollama 等第三方密钥的新用户，助手直接置灰不可用。
2. **架构冗余与机制割裂**：AMC-WebUI 本身已经具备成熟完整的 MCP 客户端架构（`src/features/mcp/`、`mcpApprovalStore`、`mcpToolRuntimeStore`、调用进度卡片与审批弹窗），而设置助手却独立造了一套临时的审批和状态系统。

**本设计目标**：
1. 在前端 MCP 客户端体系中引入**内置虚拟 MCP 服务（In-Process Virtual MCP Server）**抽象，纯内存执行，零后端网络依赖，完全兼容静态部署（Pages/CDN）与 Docker。
2. 将服务商管理作为第一个内置虚拟 MCP 服务（`amc_provider_manager`），统一工具声明、审批门禁与执行追踪。
3. 助手通道解耦 Gemini：支持使用任何已配置且具备工具调用能力的第三方模型（OpenAI-compatible、Anthropic 等）驱动助手。
4. 全局可用：配置工具不仅在设置助手可用，还注册进全局 MCP 工具池，主聊天会话在开启该工具时也能直接调用。
5. 保持**密钥绝对不进入 Prompt** 的安全红线。

---

## 2. 详细设计

### 2.1 虚拟 MCP 服务注册表（`src/features/mcp/virtualMcpRegistry.ts`）

定义纯前端内存中的虚拟 MCP 服务标准接口：

```typescript
export interface VirtualMcpServer {
  id: string; // 唯一标识，如 'amc_provider_manager'
  name: string; // 友好名称
  description: string;
  listTools: () => Promise<McpToolDefinition[]>;
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    onProgress?: (event: McpToolProgressEvent) => void,
  ) => Promise<unknown>;
}
```

提供全局单例注册机制：
* `registerVirtualMcpServer(server: VirtualMcpServer): () => void`（返回反注册清理函数）
* `getVirtualMcpServers(): VirtualMcpServer[]`
* `findVirtualMcpServer(id: string): VirtualMcpServer | undefined`
* `clearVirtualMcpServers(): void`（主要供测试用）

### 2.2 调度层无缝穿透（`src/features/mcp/mcpClientFunctions.ts`）

扩展 `createMcpClientFunctions`：
1. **工具发现合并**：
   - 不仅抓取远端配置中的 `servers`，同时拉取已注册的 `VirtualMcpServer` 列表；
   - 虚拟服务工具同样转换为标准 `FunctionDeclaration`，命名统一遵循既有规范：`mcp_{serverId}_{toolName}`。
2. **工具调用路由**：
   - 当调用的工具归属于虚拟服务时，直接主线程分发给 `virtualServer.callTool(toolName, args, signal, onProgress)`，跳过 `/api/mcp/call` 的网络通信与跨进程开销；
   - **完全复用现有能力**：
     - 调用前检查 `requiresApproval` / `isSessionApproved`，需要审批时调起 `requestApproval`（即 `McpToolApprovalDialog`）；
     - 调用全生命周期触发 `beginMcpToolRun`、`appendMcpToolProgress`、`finishMcpToolRun`，消息流实时呈现进度条与执行卡片。

### 2.3 服务商管理虚拟服务（`src/features/settings-assistant/providerVirtualMcpServer.ts`）

将原 `providerTools.ts` 改造为标准的 `VirtualMcpServer` 实例：
* **服务 ID**：`amc_provider_manager`
* **工具清单**：
  1. `list_templates`: 返回 25 个服务商模版。
  2. `list_connections`: 返回已配置的服务商列表（`hasApiKey: boolean` 脱敏）。
  3. `create_connection`: 模版新建连接，计算冲突；若缺 Key，返回 `{ status: 'awaiting-api-key', connectionId, name }`。
  4. `update_connection`: 增量更新或配置连接；覆盖非空值时需要审批。
  5. `test_connection`: 对指定连接发起真实连通性探测，返回延迟与错误诊断。
  6. `fetch_models`: 从端点真实同步远端模型列表。

#### 密钥红线与挂起机制
* 参数 Schema 严格禁止 `apiKey` 属性。
* 依然走 UI 交互卡片拦截：当需要 Key 时，前端展示 `ApiKeyHandoffCard`，用户在 DOM 输入后直接落盘 IndexedDB，模型永远不会拿到密钥。

### 2.4 助手通道多模型适配（`src/features/settings-assistant/assistantChannel.ts`）

破除对单一 `generateContentTurnApi`（Gemini）的依赖：
* 检查当前助手选择的模型：
  - 若为 Gemini 原生模型（或默认模式）：继续走 `generateContentTurnApi`。
  - 若为第三方连接模型（如用户选了已连接的 DeepSeek-Chat 或 Claude 3.5 Sonnet）：
    - 构造轻量单轮请求：将 `StandardClientFunctions` 的声明转为 OpenAI 兼容的 `tools: [{ type: 'function', function: ... }]`；
    - 发送请求，如果返回包含 `tool_calls`，将其映射为 `StandardToolTurnResult`；
    - 单轮无流式，代码量极小（约 50-80 行），立即解绑 Gemini。
* 当没有配置 Gemini 且用户配置了任何可用的第三方连接时，助手不再置灰，而是自动默认使用首个可用的第三方模型！

---

## 3. 测试与验证策略

1. **虚拟服务注册单测**：验证 `virtualMcpRegistry` 的注册、按 ID 查找、取消注册、重复注册处理。
2. **调度穿透单测**：在 `mcpClientFunctions.test.ts` 中断言：
   - 虚拟服务的 tools 成功暴露为函数声明；
   - 调用虚拟工具直接执行本地 handler，不产生 HTTP 请求；
   - 触发审批时正确进入 `requestApproval`；
   - 执行过程正确派发 `mcpToolRuntimeStore` 生命周期事件。
3. **服务商 MCP 单测**：验证 `create_connection`、`update_connection`、覆盖审批判定。
4. **红队安全单测**：执行全部工具，断言 `noSecretLeakFromAssistant.test.ts` 依然 100% 绿灯，确保 API Key 零泄露。
5. **架构边界测试**：运行 `pnpm test:arch`，确保新模块符合 AMC-WebUI 的架构守卫。
