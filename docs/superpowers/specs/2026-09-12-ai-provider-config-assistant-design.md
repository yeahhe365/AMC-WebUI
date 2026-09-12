# AI 服务商配置助手设计

日期：2026-09-12  
范围：`src/features/settings-assistant/`（新增）、`src/stores/settingsAssistantStore.ts`（新增）、`src/components/settings/sections/providers/assistant/`（新增）、`ProviderSettingsSection.tsx`（挂载点）、i18n

状态：设计已评审通过，待写实现计划

---

## 1. 背景与目标

第三方连接模型（`ThirdPartyConnection`）落地后，用户要新增一个中转站或换 baseUrl，需要手填模板选择、Base URL、协议、密钥、模型目录五个环节。25 个模板已经带了默认 baseUrl / protocol / modelId，但用户并不知道该选哪个模板、URL 该不该带 `/v1`、模型 id 从哪来。

本功能在设置页内提供一个**自然语言对话面板**：用户说"帮我加个硅基流动的中转站，地址是 https://api.siliconflow.cn/v1"，助手完成建连接、填字段、测连接、拉模型列表、按需修正。

助手的独特价值不是"替用户点按钮"，而是**闭环**：建完立刻 `test_connection`，失败就读 `diagnoseConnectionError` 的建议改 baseUrl，再测；要导入模型就先 `fetch_models` 看真实列表再决定。

### 1.1 已确认的产品决策

| 决策项     | 选择                                                    | 理由                                                                                      |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 入口       | **设置页专用助手面板**，非主聊天                        | 复用 `runStandardToolLoop` 而不改造聊天管线；密钥输入可就近；不受"当前会话用什么模型"影响 |
| 信任模型   | AI **直接写入**，仅删除/覆盖需审批                      | 用户选择；用变更卡片 + 撤销 + 审计日志补偿                                                |
| 能力边界   | 第三方连接增/改/删 + `test_connection` + `fetch_models` | 工具集即边界，不存在通用 `set_settings` 工具                                              |
| 密钥       | **永不进入模型上下文**，用户经密钥卡片输入              | 聊天内容会发往模型服务商；密钥必须走 UI 通道                                              |
| 助手通道   | Gemini 原生（用户 Gemini key 或 Docker 服务端托管 key） | 复用 `generateContentTurnApi`，其返回形状即 `StandardToolTurnResult`                      |
| 会话持久化 | **不持久化**，面板关闭即弃                              | YAGNI；避免引入第三套会话存储与同步                                                       |

## 2. 非目标（本设计明确不做）

- 不修改 Gemini 原生配置（Gemini key / 代理 URL / Gemini 模型目录）。助手自身跑在 Gemini 通道上，改这些会导致"助手把自己弄哑"。
- 不修改其他设置（API 代理、MCP 服务器、模型偏好、外观等）。
- 不为第三方协议（`openai-compatible` / `anthropic` / `openai-responses`）补 function calling。这是独立立项：其独立价值是"第三方模型也能用 MCP 工具"，且需要 messages 转换、流式 `tool_calls` 分片聚合、声明格式转换与历史配对，不应与本功能混在一个 PR。
- 不做"AI 自动探测服务商并推荐"、不做后台自动修复循环。所有写入只发生在用户发出的那一轮对话内。
- 助手对话不持久化、不跨设备同步、不进聊天历史。

## 3. 架构与模块

### 3.1 目录结构

```text
src/features/settings-assistant/
  assistantChannel.ts        # 通道：解析 key + 模型 + config，导出 runAssistantTurn
  providerTools.ts           # 工具声明（FunctionDeclaration）+ handler
  providerPatch.ts           # 纯函数：补丁 → 新 connections + 变更描述 + 是否需审批
  providerRedaction.ts       # 面向模型的只读视图脱敏
  providerProbe.ts           # test_connection / fetch_models 的协议分派
  providerSnapshot.ts        # 撤销快照栈（内存）
  useSettingsAssistant.ts    # 驱动 runStandardToolLoop + 中止
src/stores/settingsAssistantStore.ts
src/components/settings/sections/providers/assistant/
  ProviderAssistantPanel.tsx
  AssistantMessageList.tsx
  ConnectionChangeCard.tsx
  ApiKeyHandoffCard.tsx
  ConnectionProbeResultCard.tsx
  AssistantApprovalDialog.tsx
```

挂载点：`ProviderSettingsSection.tsx` 顶部（Gemini 块之后、连接列表之前）插入可折叠的 `ProviderAssistantPanel`。

### 3.2 助手通道

`assistantChannel.ts` 是整个功能里最薄的一层，因为不需要任何新的 API 客户端代码：

```ts
runTurn: (contents) =>
  generateContentTurnApi(
    key,
    modelId,
    contents,
    {
      systemInstruction: await loadSettingsAssistantSystemPrompt(),
      tools: [{ functionDeclarations: PROVIDER_TOOL_DECLARATIONS }],
      temperature: 0.2,
    },
    abortSignal,
  );
```

- `generateContentTurnApi`（`src/services/api/chatApi.ts`）的返回值为 `{ modelContent, parts, thoughts, usage, grounding, urlContext, functionCalls }`，**恰好等于** `runStandardToolLoop` 契约中的 `StandardToolTurnResult`，因此无需适配层。`MALFORMED_FUNCTION_CALL`、安全拦截、代理、API 版本等分支它已处理。
- 助手 config **不带内置工具**（无 `googleSearch` / `codeExecution` 等），因此 `appendFunctionDeclarationsToTools` 中"内置与自定义工具互斥（仅 Gemini 3 支持组合）"的分支不会被触发，声明一定被注入。
- key 解析：`getGeminiKeyForRequest(appSettings, { modelId: assistantModelId })`。返回哨兵 `SERVER_MANAGED_API_KEY` 时走 Docker 托管 key 路径，功能天然可用。
- 助手模型默认 `DEFAULT_MODEL_ID`（`gemini-3.8-flash`），允许用户在面板内切到其他 Gemini 原生文本模型；选择结果不持久化。
- 通道不可用时（`getGeminiKeyForRequest` 返回 `error`）：面板渲染禁用态 + 原因说明 + "去配置 Gemini" 链接，**不发起任何请求**。

### 3.3 会话状态

`settingsAssistantStore`（zustand，内存态）持有：

- `messages`：用户/助手消息 + 工具调用卡片 + 变更卡片 + 密钥卡片；
- `status`：`idle` / `running` / `awaiting-key` / `awaiting-approval` / `error`；
- `snapshots`：撤销快照栈（上限 20）；
- `pendingApproval`：待审批的变更（含 diff）。

卡片数据由 `runStandardToolLoop` 的 `onToolCallsStarted` / `onToolResponsesSettled` 回调写入——这两个 hook 本就是为"live 工具卡片"设计的。面板卸载时中止请求并清空 store。

## 4. 工具契约

| 工具                | 关键参数                                                                                              | 返回给模型                                                                           | 写设置         | 需审批           |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- | ---------------- |
| `list_connections`  | —                                                                                                     | id / name / protocol / baseUrl / hasApiKey / modelCount / modelIds（前 50）/ enabled | 否             | 否               |
| `list_templates`    | —                                                                                                     | 25 个模板的 id / name / baseUrl / protocol / defaultModelId / authOptional           | 否             | 否               |
| `create_connection` | templateId, name?, baseUrl?, protocol?, modelId?, models?                                             | `{ connectionId, name, status: 'created' \| 'awaiting-api-key' }`                    | 是             | 撞端点时         |
| `update_connection` | connectionId, `name` / `baseUrl` / `protocol` / `enabled` / `modelId` / `addModels` / `replaceModels` | `{ connectionId, changed: string[], status }`                                        | 是             | 覆盖已有非空值时 |
| `delete_connection` | connectionId                                                                                          | `{ status: 'deleted', name }`                                                        | 是             | **总是**         |
| `test_connection`   | connectionId, modelId?                                                                                | status / latencyMs / grade / diagnosticTip                                           | 否（真实请求） | 否               |
| `fetch_models`      | connectionId                                                                                          | `{ ids: string[], truncated: boolean }`                                              | 否（真实请求） | 否               |

模板默认值一律取自 `getThirdPartyTemplateDefaults`（`src/utils/thirdPartyApiProviders.ts`），不让模型凭空生成 baseUrl。模型自行给出 baseUrl 时，卡片上显示"AI 推断，请核对"——**这是 UI 层的临时标记，不新增持久化字段**（避免为此改动 `ThirdPartyConnection`、sanitize 与 schema）。

**v1 不写 `extraHeaders`**：header 的值本质是凭证（如 OpenRouter 的 `HTTP-Referer` 之外的私有 token），既然规则是"值必须由用户填"，最省事且无歧义的做法是助手在 v1 完全不碰它——`list_connections` 返回已有的 header **名**（不回显值），并在需要时指引用户到连接详情页的高级区手动填。

### 4.1 密钥红线（契约层强制，不依赖提示词自觉）

1. `create_connection` / `update_connection` 的参数 schema 中**不存在 `apiKey` 属性**——模型在结构上无法传递密钥。连接缺密钥且非 `authOptional` 时，工具返回 `status: 'awaiting-api-key'`，前端渲染 `ApiKeyHandoffCard`，用户粘贴后由 handler 直接写入 settings。密钥值只存在于 DOM → store → IndexedDB，**不经过任何发往模型的 contents**。
2. `extraHeaders` 完全不在助手可写字段内（见 §4）；只读视图最多返回 header 名。
3. 只读视图只返回 `hasApiKey: boolean`，连掩码后四位都不回显。
4. 系统提示词明确写"绝不向用户索要 API Key，改用密钥卡片"。提示词只是体验优化，防线是第 1、3 条。

### 4.2 密钥交接的挂起语义

`awaiting-api-key` 不是"一轮结束后的异步补写"，而是**工具 handler 挂起等待**：

- handler 返回一个 Promise，在用户于 `ApiKeyHandoffCard` 提交密钥（或取消）时 resolve；
- 用户提交 → handler 把密钥写入 settings → resolve `{ status: 'key-configured' }` → 同一轮对话继续，模型可以紧接着 `test_connection` 验证；
- 用户取消 / 关闭面板 / 中止 → resolve `{ status: 'aborted' }`，模型被告知未配置密钥，不得重试索要；
- 挂起期间没有未完成的 HTTP 请求，只是 `runStandardToolLoop` 在 await 该 Promise，不占用服务端连接，也不影响 50 轮上限的计算。

这样设计的原因是：密钥是模型在这一轮里唯一拿不到、但后续动作（测连接、拉模型）都依赖的输入；把它做成阻塞点，模型才能在一次对话里完成"建连接 → 等密钥 → 测通"的完整闭环。

## 5. 写入路径

所有写入统一走 `useSettingsStore.setAppSettings`，从而复用 `sanitizeThirdPartyApiSettings` 的校验、持久化与跨标签广播。助手不自行拼装 settings 对象。

### 5.1 覆盖判定

`providerPatch.ts` 是纯函数，**是否需审批由它计算**，模型无法绕过：

| 操作                                                         | 判定                                                  | 审批   |
| ------------------------------------------------------------ | ----------------------------------------------------- | ------ |
| create：无同端点连接                                         | 新增                                                  | 否     |
| create：存在同 `(protocol, baseUrl)` 连接                    | 覆盖（是在改一个已有端点）                            | **是** |
| create：同名但不同端点                                       | 自动去重命名（`nextConnectionName` → `OpenRouter 2`） | 否     |
| update：字段由空/null → 有值                                 | 补全                                                  | 否     |
| update：`name` / `enabled`                                   | 非破坏                                                | 否     |
| update：`baseUrl` / `protocol` / `modelId` 非空值 → 另一个值 | 覆盖                                                  | **是** |
| update：`addModels`（并集，保留手工条目）                    | 追加                                                  | 否     |
| update：`replaceModels` / 清空 baseUrl                       | 覆盖或删除                                            | **是** |
| `delete_connection`                                          | 删除                                                  | **是** |

判定前的规范化（避免模型因大小写/尾斜杠差异触发误审批，也避免空改动弹窗）：

- **撞端点**：`protocol` 相同，且 baseUrl 规范化后相等——去尾部斜杠、host 小写、去掉默认端口（`:443` / `:80`）。
- **同名**：不构成冲突，走 `nextConnectionName` 自动去重（现有 UI 的 "OpenRouter" → "OpenRouter 2" 约定）。
- **空改动**：新值与旧值规范化后相同 → 视作 no-op，返回 `changed: []`，不写入、不审批。

handler 复用现有工厂与更新函数，不自行拼装连接对象：`createConnectionFromTemplate` / `nextConnectionName` / `addThirdPartyConnection` / `updateThirdPartyConnection`（均在 `src/utils/thirdPartyApiProviders.ts`）。

```ts
type ProviderPatch =
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
      set?: Partial<Pick<ThirdPartyConnection, 'name' | 'baseUrl' | 'protocol' | 'enabled' | 'modelId'>>;
      addModels?: ModelOption[];
      replaceModels?: ModelOption[];
    }
  | { op: 'delete'; connectionId: string };

type PatchVerdict =
  | { kind: 'apply'; nextConnections: ThirdPartyConnection[]; changed: string[] }
  | { kind: 'needs-approval'; reason: ApprovalReason; diff: FieldDiff[]; nextConnections: ThirdPartyConnection[] }
  | { kind: 'rejected'; error: string };
```

### 5.2 审批

- 弹窗展示**字段级 diff**（旧值 → 新值），只有"允许一次 / 拒绝"。
- **不提供"本会话始终允许"**：对覆盖与删除而言，一次点击等于交出后续的删除权。
- 不复用 `mcpApprovalStore`（其 `allow-session` 语义是 MCP 专属），只复用 `McpToolApprovalDialog` 的视觉与层级规范；拒绝后设置保持不变，工具返回 `{ status: 'denied' }` 让模型知道被拒并停止重试。
- 审批弹窗落地前（PR1），`needs-approval` 一律失败关闭，见 §10。

### 5.3 撤销与审计

- 每次写入前对 `thirdPartyApi.connections` 做深拷贝快照压栈（上限 20 步）。变更卡片上常驻"撤销"按钮；撤销本身也是一次 `setAppSettings` 写入并同样记录日志。
- 不做全局 toast 撤销：`toastStore` 当前不暴露 action 按钮，而卡片在消息流中天然持久可追溯，不值得为撤销去扩展 toast API。
- 审计：`logService` 记录 `{ source: 'settings-assistant', op, connectionId, changedFields }`，**不记录字段值**（header 值等可能敏感）。

### 5.4 中止与并发

- 面板的 `AbortSignal` 一路传入 `runStandardToolLoop` → `generateContentTurnApi`；关闭面板或点停止即中止。
- 每次写入前重新读取 `useSettingsStore.getState()`，不使用打开面板时的闭包快照，避免与手动编辑或另一个标签页的写入互相覆盖。
- 助手自身不发任何后台写入或重试。

## 6. UI 形态

- **面板**：折叠标题栏（"AI 配置助手" + 通道状态点）+ 输入框 + 消息列表 + 建议 chips（"加一个硅基流动中转站" / "把 DeepSeek 的 baseUrl 换掉" / "测一下 OpenRouter"）。
- **`ConnectionChangeCard`**：一句话摘要（"已新增连接 SiliconFlow"）+ 字段级 diff + 撤销按钮；卡片在消息流中常驻。
- **`ApiKeyHandoffCard`**：复用 `ApiKeyInput`，DOM id 为 `assistant-handoff-{connectionId}`（现有实现要求每个实例唯一 id）；提交后卡片变为"已配置"且不再可编辑明文，只提供"更换密钥"。
- **`ConnectionProbeResultCard`**：状态、延迟分级、`diagnoseConnectionError` 给出的建议；并**明示"已向 `{baseUrl}` 发起一次真实请求"**。
- **禁用态**：无 Gemini 通道时展示原因与去配置的入口。

## 7. 系统提示词要点

存放于 `src/features/prompts/settingsAssistant.ts`，经 `promptRegistry` 懒加载（沿用 `loadLocalPythonSystemPrompt` 等既有模式），内容要点：

1. 优先用 `list_templates` 的默认值，不要凭空编造 baseUrl 或模型 id；
2. 绝不向用户索要 API Key，缺密钥时依赖 `awaiting-api-key` 流程；
3. 创建或修改后主动 `test_connection`；失败时读 `diagnosticTip` 再改，最多重试 2 轮后交给用户；
4. 导入模型先 `fetch_models` 再 `addModels`，不要先替换（`replaceModels` 需审批）；
5. 一句话说明将要做什么，再调用工具；写完后用一句话汇报结果与失败原因。

## 8. i18n 与设置搜索

- 新增文案以扁平 key 形式加入 `src/i18n/translations/settings/`。**每个 key 必须一次性带上 7 种语言**（`en` / `zh` / `ja` / `ko` / `es` / `fr` / `de`）：`pnpm i18n:check`（`scripts/check-i18n-coverage.mjs`）会逐个 key 校验 7 语言齐全，缺失即以退出码 1 失败。因此文案**不能**延后到 PR3 补，必须随引入它的任务一起落地（类型上 `TranslationEntry` 是 `Partial<Record<SupportedLanguage, string>>`，缺语言能过类型检查但过不了 CI）。
- 工具显示名（卡片标题）同样走 i18n，不硬编码英文。
- PR3 在 `src/constants/settingsSearchCatalog.ts` 增加条目，让"AI 配置"能被设置搜索命中。

## 9. 测试

- **红队测试（最关键）**：预置假 key `sk-LEAKCANARY…` 到某连接 → 依次执行全部工具 handler → 断言 `runTurn` 收到的 contents 与所有 functionResponse 序列化后均不含 `LEAKCANARY`。这把"密钥不进上下文"从承诺变成可验证属性。
- **纯函数层（TDD 主战场）**：§5.1 覆盖判定表逐行一个用例；`providerPatch` 产出的状态再过一遍真实 `sanitizeThirdPartyApiSettings`。
- **工具层**：注入假 store / 假 probe / 假 fetch，断言写入参数、`awaiting-api-key` 分支、拒绝审批后设置不变。
- **通道层**：无 Gemini key 时面板禁用且不发起请求；`getGeminiKeyForRequest` 返回 error 时不构造请求。
- **组件层**：diff 渲染、撤销回滚、`ApiKeyInput` id 唯一性、禁用态文案。
- **守卫**：`src/test/architecture/*` 全绿（新目录需符合 `projectStructureBoundaries` 与 `namingStructureOptimizations`）；`pnpm i18n:check` 全绿（每个新 key 7 语言齐全，随引入它的任务一起提交）。
- **e2e smoke**：打开设置 → 让助手"加一个 Ollama 连接" → 断言连接列表出现该行。选 Ollama 因为其模板 `authOptional: true`，无需真实密钥，e2e 不引入密钥管理。

## 10. 分期

- **PR1（最小闭环）**：`providerPatch` + 通道 + `list_templates` / `list_connections` / `create_connection` / `update_connection` + 面板骨架 + 变更卡片 + 密钥卡片 + 红队测试。此阶段尚无审批弹窗，命中 `needs-approval` 的补丁**失败关闭**：工具返回 `{ status: 'approval-unavailable' }` 并说明"该改动需要确认，暂不支持"，**绝不静默写入**。
- **PR2**：审批（覆盖 diff 弹窗 + 删除）+ 撤销 + `test_connection` / `fetch_models` + 结果卡片 + 审计日志。审批落地后 PR1 的失败关闭分支改为走弹窗。
- **PR3**：空态/错误态打磨 + e2e smoke + `settingsSearchCatalog` 条目 + 文档。

**挂载顺序约束**：`ProviderSettingsSection.tsx` 与 `ProviderDetail.tsx` 当前正处在第三方连接重构的工作区改动中。PR1 先做 `src/features/settings-assistant/` 与 store 层（不触碰设置 UI 大文件），UI 挂载放到 PR1 末尾或 PR2，避免与并行重构冲突。

**顺带的小改进**：`ProviderDetail.tsx` 现有的"按协议分派 fetch models"三元表达式（约 245–260 行）抽成 `providerProbe.ts` 中的共享 helper，让助手工具与手动同步走同一实现，避免两处漂移。

## 11. 风险与缓解

| 风险                                                            | 缓解                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 密钥经模型上下文泄漏                                            | 参数 schema 无 `apiKey` 属性 + 只读视图只给布尔 + 红队测试                                                             |
| AI 直接写入造成难以察觉的错误改动                               | 变更卡片常驻 diff + 撤销 + 审计日志 + 覆盖/删除审批                                                                    |
| 助手模型 function calling 不稳定                                | 默认 `gemini-3.8-flash`；`MALFORMED_FUNCTION_CALL` 已由 `generateContentTurnApi` 转为明确错误；系统提示词限制重试 2 轮 |
| `fetch_models` / `test_connection` 携带真实密钥向用户端点发请求 | 卡片明示"已发起一次真实请求"；仅在用户本轮要求时触发                                                                   |
| i18n ×7 带来的机械成本                                          | 每个新文案必须 7 语言齐全（CI 强制），随引入它的任务一起提交，不积压                                                   |
| 与进行中的 provider 重构冲突                                    | 先做 feature 层，UI 挂载最后；契约（工具/patch）不依赖设置 UI 内部结构                                                 |

## 12. 成功标准

- 用户说"帮我加个硅基流动，key 我一会儿填" → 连接被创建、密钥卡片出现、列表出现"未配置密钥"状态；填完密钥后助手能在**同一轮**里测通连接（测连接在 PR2 落地）。
- 用户说"把 OpenRouter 的 baseUrl 换成 xxx" → 出现审批弹窗（覆盖），拒绝后设置不变，允许后写入且卡片可撤销。
- 任意时刻，发往 Gemini 的请求内容中检索不到已保存的任何 API Key（由红队测试保证）。
- 在用户仅使用第三方模型聊天（会话路由为第三方）时，设置页助手依然可用。
- 没有 Gemini 通道时，面板明确禁用并说明原因，不产生任何请求。
- 助手无法修改第三方连接之外的任何设置（工具集即边界，无通用写入工具）。
