# Selection Ask Model — Design

- Date: 2026-08-24
- Status: Approved (brainstorming 4/4)
- Scope: 为划词“询问”功能新增独立模型配置

## 1. 背景与目标

划词“询问”悬浮窗（`SelectionAskPanel` + `useSelectionAsk`）当前复用 `activeChat.settings ?? appSettings` 的 `modelId/providerId`。用户需要为该功能独立选模型，且希望在设置页统一配置、未配置时明确阻断而非静默回退。

目标：

- 独立、可持久化的询问模型配置，支持 Gemini 原生与所有已启用的第三方连接。
- 未配置/连接禁用/缺 Key 时在弹窗内报错并引导去设置，不自动回退到会话模型。
- UI 与现有 Token/主题一致，改动最小。

非目标：

- 弹窗内临时切换模型、per-conversation 覆盖、localStorage 记忆。

## 2. 数据模型

### 2.1 类型

`src/types/settings.ts` — `AppSettings` 新增：

```ts
selectionAskModelId?: string;
selectionAskProviderId?: ChatProviderId; // undefined = gemini-native
```

均为可选，默认 `undefined` 表示未配置。

### 2.2 默认值与清洗

`src/constants/settingsDefaults.ts`：

- `BASE_DEFAULT_APP_SETTINGS` 新增 `selectionAskModelId: undefined`, `selectionAskProviderId: undefined`。
- `sanitizeAppSettings()` 中：
  - `selectionAskModelId` 经 `migrateRemovedModelId` → `resolveSupportedModelId(sanitize)`；若为已下线模型则置 `undefined`。
  - `selectionAskProviderId` 经 `normalizeProviderId`；若非有效连接 id 则置 `undefined`。
  - 当 `selectionAskModelId` 为空时同步清空 `selectionAskProviderId`。

旧数据无这两字段时保持 `undefined`，无需数据迁移脚本。

### 2.3 持久化

复用 `settingsStore` 现有路径：`setAppSettings` → `sanitizeAppSettings` → `dbService.setAppSettings` → `BroadcastChannel('SETTINGS_UPDATED')`。不引入 `localStorage`。

## 3. 设置页 UI

### 3.1 位置

新增文件 `src/components/settings/sections/SelectionAskModelSection.tsx`，在设置弹窗的通用/界面区（`GeneralSection` 附近）作为独立卡片挂载。标题 `t('selectionAskModel')`，副标题 `t('selectionAskModelDesc')`。

### 3.2 交互

- 复用 `ModelPicker`（或 `ModelSelector` 的列表逻辑）渲染全量可用模型：`gemini-native` + `thirdPartyApi.connections.filter(c=>c.enabled).flatMap(c=>c.models)`。
- 列表按现有 `ModelPicker` 分组与搜索，无需新增样式。
- 已选时显示 `modelId (+ connectionName)`；未选时显示占位 `t('selectionAskModelNotConfigured')` 与说明。
- 点选后 `useSettingsStore.setAppSettings({ selectionAskModelId: id, selectionAskProviderId: providerId })`。

### 3.3 i18n

`src/i18n/translations/common.ts` 新增（7 语言）：

- `selectionAskModel`
- `selectionAskModelDesc`
- `selectionAskModelNotConfigured`
- `selectionAskModelUnavailable`
- `selectionAskModelConfigureHint`

## 4. 询问运行时

### 4.1 `useSelectionAsk` 改造

`src/hooks/text-selection/useSelectionAsk.ts`：

- 读取 `const { selectionAskModelId, selectionAskProviderId } = useSettingsStore.getState().appSettings`。
- 若 `!selectionAskModelId` → `setError(t('selectionAskModelNotConfigured') / formatApiKeyErrorMessage(...))`, `setIsLoading(false)` 并 `return`，阻断请求。
- 构造 `ChatSettings` 代理：`{ modelId: selectionAskModelId, providerId: selectionAskProviderId } as ChatSettings`，用于 `resolveChatApiRoute(appSettings, proxySettings)` 与 `getKeyForRequest(appSettings, proxySettings)`。
- 若 `isUnavailableThirdPartyRoute(apiRoute)` 或 `getKeyForRequest` 返回 `error` → 按现有 `askError` 路径报错，文案替换为 `selectionAskModelUnavailable` 引导去设置。
- 其余流式分发（`sendStatelessMessageStreamApi` / `sendOpenAICompatibleMessageStream` / `sendAnthropicMessageStream`）保持不变，`apiModelId = apiRoute.modelId || selectionAskModelId`。

不再回退到 `activeChat.settings` 或 `appSettings.modelId`。

### 4.2 `SelectionAskPanel` 展示

`src/components/chat/message-list/text-selection/SelectionAskPanel.tsx`：

- Header 标题 `询问` 右侧新增只读模型徽标：`useSettingsStore(s=>s.appSettings.selectionAskModelId)`。
  - 已配置：`rounded-full bg-secondary px-2 py-0.5 text-xs` 显示截断 `modelId`，`title` 显示全称 + 连接名。
  - 未配置/不可用：红点 + `t('selectionAskModelNotConfigured')`，点击触发 `onOpenSettings`（预留 prop，回退为 `toast` 提示）。
- 错误态：当 `error` 含“未配置/不可用”时，错误卡下方附“去设置”按钮。
- 不新增下拉，避免与“仅全局配置”相悖。

## 5. 边界与错误处理

| 场景               | 行为                                                          |
| ------------------ | ------------------------------------------------------------- |
| 未配置             | 阻断，不发起请求，`error` 提示去设置                          |
| 模型被删除/迁移    | `sanitize` 置空，次启等同未配置                               |
| 连接禁用           | `isUnavailableThirdPartyRoute` 报错                           |
| 连接缺 Key         | `getKeyForRequest` 报错                                       |
| 模型仍在但连接更名 | `connectionName` 仅展示用，不影响路由（以 `providerId` 为准） |

## 6. 测试

- `settingsStore` 单测：`sanitizeAppSettings` 对新字段的迁移/清空。
- `SelectionAskModelSection` 单测：渲染、点选回调、空状态。
- `useSelectionAsk` 单测：未配置阻断、禁用连接报错、正常流式（mock `send*`）。
- 手动验证：`pnpm typecheck && pnpm build && build:docker` 后在 `http://localhost:8082` 划词验证：未配置报错、配置后流式、切换模型后次启记忆、第三方模型可用。

## 7. 文件清单

- `src/types/settings.ts`
- `src/constants/settingsDefaults.ts`
- `src/components/settings/sections/SelectionAskModelSection.tsx`（新增）
- `src/components/settings/*` 挂载点（如 `SettingsModal.tsx` / `GeneralSection.tsx`）
- `src/hooks/text-selection/useSelectionAsk.ts`
- `src/components/chat/message-list/text-selection/SelectionAskPanel.tsx`
- `src/i18n/translations/common.ts`

## 8. 决策记录

- 独立字段而非复用 `modelId`：避免污染主对话模型。
- `undefined` 默认 + 阻断而非回退：符合用户明确选择。
- 全量模型而非仅 Gemini：用户已选“全部可用模型”。
- 全局设置而非弹窗内切换：符合用户“仅全局配置”选择，复杂度最低。
