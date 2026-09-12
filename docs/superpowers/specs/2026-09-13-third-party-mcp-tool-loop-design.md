# 第三方模型（OpenAI-compatible 与 Anthropic）接入 MCP Tool Loop 架构设计

日期：2026-09-13  
范围：`src/services/api/`（协议转换与单轮 API）、`src/features/standard-chat/`（工具循环复用）、`src/features/message-sender/`（统一调度）、`src/components/chat/input/`（前端门禁放开）、测试与 i18n  
状态：评审通过，进入实现

---

## 1. 背景与目标

当前 AMC-WebUI 已经具备成熟完善的客户端工具体系：

- 远端 MCP 服务器（SSE / stdio / HTTP 流式传输）
- 系统内置虚拟 MCP 服务器（`amc_provider_manager`、`amc_settings_manager`）
- 本地 Python 执行环境（Pyodide）
- 运行时审批拦截弹窗（`McpToolApprovalDialog`）与执行进度卡片

然而，主聊天的 MCP 工具调用仅在 Gemini 原生通道（`isGeminiNative`）中被激活；当用户切换到 Qwen（通义千问）、DeepSeek、SiliconFlow、Ollama、Claude 等第三方模型时：

1. 输入框底部的 MCP 图标被硬编码禁用（`disabled={true}`，呈现置灰不可点击）；
2. 消息发送流程直接进入无工具的流式通道，完全跳过了 MCP 发现与工具执行循环。

**本设计目标**：

1. **打通 OpenAI-compatible 协议**（覆盖 Qwen、DeepSeek、SiliconFlow、OpenAI、Ollama 等）：
   - 支持将客户端工具（MCP + Local Python）转换为 OpenAI 标准的 `tools` 参数；
   - 支持多轮对话历史中 `functionCall` 与 `functionResponse` 的双向消息映射；
   - 实现单轮无流式驱动函数 `generateOpenAICompatibleTurnApi`，返回 `StandardToolTurnResult`。
2. **打通 Anthropic 协议**（覆盖 Claude 3 / 3.5 / 3.7 原生通道）：
   - 支持将客户端工具转换为 Anthropic 的 `tools` 参数（`input_schema`）；
   - 支持消息中 `tool_use` 与 `tool_result` 块的双向转换；
   - 实现单轮无流式驱动函数 `generateAnthropicTurnApi`，返回 `StandardToolTurnResult`。
3. **架构复用与统一调度**：
   - 彻底复用现有的 `runStandardToolLoop`，保持执行卡片、思考内容、错误处理与审批流的一致性；
   - 无工具开启时保持现有的极速流式通道不变；
4. **放开前端输入框门禁**：
   - 放开第三方文本/对话模型的 MCP 按钮，允许用户自主开启与切换。

---

## 2. 详细技术方案

### 2.1 工具 Schema 转换器（`src/features/chat-tools/toolSchemaAdapters.ts`）

Gemini Schema（大写枚举 `Type.OBJECT`, `Type.STRING`, 等）需要转换为标准 JSON Schema（小写 `object`, `string`, `number`, `boolean`, `array`）：

```typescript
export function geminiSchemaToJsonSchema(schema?: unknown): Record<string, unknown>;
export function toOpenAITools(clientFunctions: StandardClientFunctions): OpenAIToolDefinition[];
export function toAnthropicTools(clientFunctions: StandardClientFunctions): AnthropicToolDefinition[];
```

- `geminiSchemaToJsonSchema` 深度遍历 properties、items，将类型转为小写，并保留 `description`、`required`、`enum` 等字段。
- `toOpenAITools` 输出形如：
  ```json
  [
    {
      "type": "function",
      "function": {
        "name": "amc_provider_manager_list_templates",
        "description": "...",
        "parameters": { "type": "object", "properties": {} }
      }
    }
  ]
  ```
- `toAnthropicTools` 输出形如：
  ```json
  [
    {
      "name": "amc_provider_manager_list_templates",
      "description": "...",
      "input_schema": { "type": "object", "properties": {} }
    }
  ]
  ```

---

### 2.2 OpenAI-compatible 协议适配

#### 2.2.1 历史消息转换扩展（`openaiCompatibleMessages.ts`）

修改 `buildOpenAICompatibleMessages`，支持处理 `item.parts` 中的工具块：

1. **模型请求工具（`part.functionCall`）**：
   - 收集所有 `part.functionCall`，构建 `tool_calls` 数组：
     ```typescript
     {
       id: call.id || `call_${idx}`,
       type: 'function',
       function: {
         name: call.name,
         arguments: JSON.stringify(call.args ?? {})
       }
     }
     ```
   - 提取伴随的 `part.text`，若无文本则 `content: null`（符合 OpenAI 规范）。
2. **客户端工具回传（`part.functionResponse`）**：
   - 遍历所有 `part.functionResponse`，依次输出 `role: 'tool'` 消息：
     ```typescript
     {
       role: 'tool',
       tool_call_id: response.id || `call_${idx}`,
       content: typeof response.response === 'string' ? response.response : JSON.stringify(response.response ?? {})
     }
     ```

#### 2.2.2 请求体注入 `tools`

在 `buildOpenAICompatibleRequestBody` 中新增可选参数 `tools?: OpenAIToolDefinition[]`：

- 若 `tools.length > 0`，附加到请求体顶层 `body.tools = tools`。

#### 2.2.3 单轮执行函数（`generateOpenAICompatibleTurnApi`）

在 `openaiCompatibleApi.ts` 中导出：

```typescript
export const generateOpenAICompatibleTurnApi = async (
  apiKey: string,
  modelId: string,
  contents: ChatHistoryItem[],
  config: OpenAICompatibleChatConfig & { tools?: OpenAIToolDefinition[] },
  abortSignal: AbortSignal,
  providerId?: string | null,
): Promise<StandardToolTurnResult>;
```

- 发送非流式请求（`stream: false`）；
- 解析 `payload.choices[0].message`：
  - 若包含 `tool_calls`：映射为 Gemini 格式的 `FunctionCall[]`，`parts` 包含 `functionCall` 块，`modelContent` 封装为 role `'model'`；
  - 若无 `tool_calls`：提取 `text`、`reasoning`（思考过程）和 `usage`，返回最终轮次。

---

### 2.3 Anthropic 协议适配

#### 2.3.1 历史消息转换扩展（`anthropicMessages.ts`）

1. **模型请求工具（`part.functionCall`）**：
   - 在 assistant 的 `content` 数组中添加：
     ```typescript
     {
       type: 'tool_use',
       id: call.id || `toolu_${idx}`,
       name: call.name,
       input: call.args ?? {}
     }
     ```
2. **工具回传（`part.functionResponse`）**：
   - 在 user 的 `content` 数组中添加：
     ```typescript
     {
       type: 'tool_result',
       tool_use_id: response.id,
       content: typeof response.response === 'string' ? response.response : JSON.stringify(response.response ?? {})
     }
     ```

#### 2.3.2 请求体注入 `tools`

在 `buildAnthropicRequestBody` 中新增可选参数 `tools?: AnthropicToolDefinition[]`：

- 若 `tools.length > 0`，附加 `body.tools = tools`。

#### 2.3.3 单轮执行函数（`generateAnthropicTurnApi`）

在 `anthropicApi.ts` 中导出：

```typescript
export const generateAnthropicTurnApi = async (
  apiKey: string,
  modelId: string,
  contents: ChatHistoryItem[],
  config: AnthropicChatConfig & { tools?: AnthropicToolDefinition[] },
  abortSignal: AbortSignal,
  providerId?: string | null,
): Promise<StandardToolTurnResult>;
```

- 发送非流式请求（`stream: false`）；
- 解析返回的 `content` 数组：
  - 提取 `type === 'tool_use'` 块映射为 `FunctionCall[]`；
  - 提取 `type === 'text'` 块与 `type === 'thinking'` 思考过程；
  - 返回 `StandardToolTurnResult`。

---

### 2.4 主调度器整合（`standardChatApiCall.ts`）

1. **统一工具准备阶段**：
   将 MCP 服务器与虚拟 MCP 的工具发现，以及本地 Python 函数的构建，提至 `if (activeProvider)` 之前。
   - `combinedClientFunctions` 包含已启用的 MCP 工具及本地 Python 工具。
2. **工具启用判断**：
   ```typescript
   const hasToolsForTurn = Object.keys(combinedClientFunctions).length > 0;
   ```
3. **路由分发**：
   - **若 `hasToolsForTurn` 为 true**：
     无论当前是 Gemini 原生、OpenAI-compatible 还是 Anthropic：
     统一进入 `runStandardToolLoop`！
     - Gemini 原生：`runTurn = (contents) => generateContentTurnApi(...)`
     - OpenAI-compatible：`runTurn = (contents) => generateOpenAICompatibleTurnApi(..., { tools: openAiTools })`
     - Anthropic：`runTurn = (contents) => generateAnthropicTurnApi(..., { tools: anthropicTools })`
     - 工具循环完成后，统一将 `finalTurn.parts` 输出至 `streamOnPart`，思考内容输出至 `onThoughtChunk`，并在结束时调用 `streamOnComplete`。
   - **若 `hasToolsForTurn` 为 false**：
     保持现有的直连逻辑不变（第三方走 `sendOpenAICompatibleMessageStream` / `sendAnthropicMessageStream`，Gemini 走 `sendStatelessMessageStreamApi`）。

---

### 2.5 前端门禁改造（`ChatInputActions.tsx`）

放开第三方模型的 MCP 按钮：

```typescript
const isThirdPartyChatModel = !isGeminiNative && !isImageGenerationModel(currentModelId);
const isMcpSupported =
  !isTtsModel &&
  !isLiveTranslate &&
  !isLiveTranscribe &&
  !isTranscribeModel &&
  !isNativeAudioModel &&
  !isImageGenerationModel &&
  !isGemma &&
  (isGeminiNative || isThirdPartyChatModel);
```

当用户选择 `Qwen3.8-Flash`、`deepseek-chat` 等第三方模型时，`isMcpSupported` 为 `true`，弹簧图标可正常点击并弹出服务器勾选菜单。

---

## 3. 测试与验证策略

1. **单元测试**：
   - `toolSchemaAdapters.test.ts`：验证 Gemini Schema 与 OpenAI/Anthropic 工具定义的双向映射及类型转换；
   - `openaiCompatibleMessages.test.ts`：覆盖包含 `functionCall` 与 `functionResponse` 的历史消息转换；
   - `openaiCompatibleApi.test.ts`：测试 `generateOpenAICompatibleTurnApi` 的 tool_calls 与无工具回答分支；
   - `anthropicApi.test.ts`：测试 `generateAnthropicTurnApi` 的 tool_use 转换；
   - `standardChatApiCall.test.ts`：验证第三方 Provider 开启 MCP 时能成功调起 `runStandardToolLoop`，执行工具后得到最终文本。
   - `ChatInputActions.test.tsx`：更新门禁测试，验证第三方对话模型上 MCP 按钮处于启用可点击状态。
2. **构建与类型验证**：
   - `npx tsc --noEmit` 保证 TypeScript 零报错；
   - `node scripts/run-vitest.mjs run <tests>` 全量相关单元测试通过。
