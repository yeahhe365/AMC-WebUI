# 第三方模型（OpenAI-compatible 与 Anthropic）接入 MCP Tool Loop 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpenAI-compatible（Qwen、DeepSeek 等）及 Anthropic（Claude）第三方模型接入统一的 MCP 与本地 Python 工具循环（Tool Loop），并在前端放开第三方模型的 MCP 按钮。

**Architecture:**

1. 编写工具 Schema 转换适配器，将 `StandardClientFunctions` 统一映射为 OpenAI 与 Anthropic 标准的 `tools` 定义。
2. 扩展 OpenAI 与 Anthropic 的消息构建器，处理包含 `functionCall` 和 `functionResponse` 的历史消息；并实现 `generateOpenAICompatibleTurnApi` 与 `generateAnthropicTurnApi` 单轮无流式执行器。
3. 在 `standardChatApiCall.ts` 中统一工具准备，若当前轮次有工具启用，调用通用的 `runStandardToolLoop` 驱动执行；无工具时继续保留直连流式。
4. 放开 `ChatInputActions.tsx` 中的第三方文本模型 MCP 门禁。

**Tech Stack:** TypeScript, React 18, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-third-party-mcp-tool-loop-design.md`

## Global Constraints

- 严禁破坏现有 Gemini 原生聊天与第三方无工具流式聊天的行为与性能；
- 工具执行审批门禁（`McpToolApprovalDialog` / `ApiKeyHandoffCard`）必须完整复用，密钥绝不进入 Prompt；
- 遵循 TypeScript strict 校验，零 lint / typecheck 报错；
- 每个模块均必须配套全面的 Vitest 单元测试，遵循 TDD。

---

### Task 1: 工具 Schema 转换适配器

**Files:**

- Create: `src/features/chat-tools/toolSchemaAdapters.ts`
- Test: `src/features/chat-tools/toolSchemaAdapters.test.ts`

**Interfaces:**

- Produces:
  - `geminiSchemaToJsonSchema(schema?: unknown): Record<string, unknown>`
  - `toOpenAITools(functions: StandardClientFunctions): OpenAIToolDefinition[]`
  - `toAnthropicTools(functions: StandardClientFunctions): AnthropicToolDefinition[]`

- [x] **Step 1: 编写测试用例**
  - 覆盖基本类型（STRING, OBJECT, NUMBER, BOOLEAN, ARRAY）的大小写转换；
  - 覆盖嵌套 properties、items、required 列表；
  - 覆盖 `toOpenAITools` 和 `toAnthropicTools` 的包装格式。
- [x] **Step 2: 运行测试确保失败**
- [x] **Step 3: 实现转换适配器代码**
- [x] **Step 4: 运行测试确保全部通过**

---

### Task 2: OpenAI-compatible 工具调用与单轮 API

**Files:**

- Modify: `src/services/api/openaiCompatibleTypes.ts`
- Modify: `src/services/api/openaiCompatibleMessages.ts`
- Modify: `src/services/api/openaiCompatibleApi.ts`
- Test: `src/services/api/openaiCompatibleMessages.test.ts`
- Test: `src/services/api/openaiCompatibleApi.test.ts`

**Interfaces:**

- Produces:
  - `OpenAIToolDefinition` 类型
  - `buildOpenAICompatibleMessages` 支持 `functionCall`（输出 `assistant` 且含 `tool_calls`）及 `functionResponse`（输出 `tool` 角色消息）
  - `buildOpenAICompatibleRequestBody` 接收并注入 `tools` 参数
  - `generateOpenAICompatibleTurnApi` 单轮请求函数，返回 `StandardToolTurnResult`

- [x] **Step 1: 编写 messages 与 requestBody 的测试用例**
- [x] **Step 2: 扩展 types、messages 与 requestBody 并验证测试**
- [x] **Step 3: 编写 `generateOpenAICompatibleTurnApi` 测试用例（含 tool_calls 返回与普通文本返回）**
- [x] **Step 4: 实现 `generateOpenAICompatibleTurnApi` 并通过测试**

---

### Task 3: Anthropic 工具调用与单轮 API

**Files:**

- Modify: `src/services/api/anthropicTypes.ts`
- Modify: `src/services/api/anthropicMessages.ts`
- Modify: `src/services/api/anthropicApi.ts`
- Test: `src/services/api/anthropicMessages.test.ts`
- Test: `src/services/api/anthropicApi.test.ts`

**Interfaces:**

- Produces:
  - `AnthropicToolDefinition` 类型
  - `buildAnthropicMessages` 支持 `tool_use` 与 `tool_result`
  - `buildAnthropicRequestBody` 接收并注入 `tools` 参数
  - `generateAnthropicTurnApi` 单轮请求函数，返回 `StandardToolTurnResult`

- [x] **Step 1: 编写 Anthropic messages 转换的测试用例**
- [x] **Step 2: 扩展 Anthropic types、messages 并验证测试**
- [x] **Step 3: 编写 `generateAnthropicTurnApi` 测试用例（含 tool_use 返回与普通文本返回）**
- [x] **Step 4: 实现 `generateAnthropicTurnApi` 并通过测试**

---

### Task 4: 主调度器整合（`standardChatApiCall.ts`）

**Files:**

- Modify: `src/features/message-sender/standardChatApiCall.ts`
- Test: `src/features/message-sender/standardChatApiCall.test.ts`

**Interfaces:**

- Consumes:
  - `toOpenAITools`, `toAnthropicTools`
  - `generateOpenAICompatibleTurnApi`, `generateAnthropicTurnApi`
  - `runStandardToolLoop`

- [x] **Step 1: 编写第三方 Provider 开启 MCP 时的单元测试**
- [x] **Step 2: 调整 `standardChatApiCall.ts`：将工具准备提前，针对 activeProvider 分支在有工具时进入 `runStandardToolLoop`**
- [x] **Step 3: 运行测试确保第三方模型正确执行工具循环并回传最终结果**

---

### Task 5: 前端输入框 MCP 门禁放开与交互优化

**Files:**

- Modify: `src/components/chat/input/ChatInputActions.tsx`
- Test: `src/components/chat/input/ChatInputActions.test.tsx`

**Interfaces:**

- 更新 `isMcpSupported`，当模型为第三方对话/文本模型时返回 `true`。

- [x] **Step 1: 更新 `ChatInputActions.test.tsx` 中对第三方模型的测试断言**
- [x] **Step 2: 调整 `ChatInputActions.tsx` 放开门禁**
- [x] **Step 3: 运行测试验证**

---

### Task 6: 全局验证与代码质量检查

- [x] 运行 TypeScript 类型检查（`npx tsc --noEmit`）
- [x] 运行受影响的所有测试套件确保无回归
