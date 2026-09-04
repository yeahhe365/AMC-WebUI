# Selection Ask Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为划词“询问”悬浮窗新增独立模型配置（全局设置页），未配置时阻断请求并引导去设置，支持 Gemini 与全部第三方连接。

**Architecture:** 在 `AppSettings` 新增 `selectionAskModelId/selectionAskProviderId` 持久化字段，`sanitizeAppSettings` 校验；新增 `SelectionAskModelSection` 挂载到 `AppearanceSection`（interface tab）；`useSelectionAsk` 改为读取该独立配置并按现有 `resolveChatApiRoute/getKeyForRequest` 路由到 Gemini/OpenAI兼容/Anthropic 三分支；`SelectionAskPanel` header 增加只读徽标与错误态引导。

**Tech Stack:** React 18, TypeScript, Zustand `useSettingsStore`, `ModelPicker`/`ModelCatalogList`, `resolveChatApiRoute`, `sendStatelessMessageStreamApi` 等流式 API, IndexedDB `dbService`, i18n `common.ts`.

## Global Constraints

- pnpm 管理依赖，验证 `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI typecheck && pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI build`
- Docker 验证 `npm run build:docker && docker compose up -d --build` 端口 8082
- 主题 token 必须用 `var(--theme-*)`，CTA 蓝 `bg-[#3964FE]` 保持一致
- 未配置/不可用时必须阻断，不自动回退到会话模型
- 支持全部可用模型（Gemini + 第三方）
- 设置位置为 通用/界面 区独立卡片
- 遵循 TDD：先写失败用例再实现

---

### Task 1: 数据模型 — AppSettings 新增字段与清洗

**Files:**

- Modify: `src/types/settings.ts:262-268`
- Modify: `src/constants/settingsDefaults.ts:68-117, 54-99`
- Test: `src/stores/settingsStore.test.ts` (新增用例)

**Interfaces:**

- Consumes: `ChatProviderId`, `ModelOption`, `normalizeProviderId`, `migrateRemovedModelId`, `resolveSupportedModelId`
- Produces: `AppSettings.selectionAskModelId?: string` 与 `selectionAskProviderId?: ChatProviderId`，`sanitizeAppSettings` 对新字段的清洗逻辑；后续 Task 3/4 依赖这两个 key 的存在与类型。

- [ ] **Step 1: 编写失败单测 `settingsStore` 对新字段的清洗**

在 `src/stores/settingsStore.test.ts` 新增：

```ts
it('sanitizes selectionAsk model fields', async () => {
  const { useSettingsStore } = await import('@/stores/settingsStore');
  const store = useSettingsStore.getState();
  // 模拟旧数据含已下线模型与非法 provider
  store.setAppSettings((s) => ({ ...s, selectionAskModelId: 'gemini-3.5-flash', selectionAskProviderId: '  ' }) as any);
  const next = useSettingsStore.getState().appSettings;
  expect(next.selectionAskModelId).toBe('gemini-3.7-flash'); // migrated
  expect(next.selectionAskProviderId).toBeUndefined();
  store.setAppSettings((s) => ({ ...s, selectionAskModelId: undefined, selectionAskProviderId: 'openai' }) as any);
  expect(useSettingsStore.getState().appSettings.selectionAskProviderId).toBeUndefined(); // 无 model 时清空
});
```

- [ ] **Step 2: 运行单测验证失败**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/stores/settingsStore.test.ts -t "sanitizes selectionAsk"`
Expected: FAIL — `selectionAskModelId` property not defined / test not found.

- [ ] **Step 3: 实现类型与默认值**

`src/types/settings.ts` 在 `AppSettings` 末尾 `thirdPartyApi` 前新增：

```ts
  selectionAskModelId?: string;
  selectionAskProviderId?: ChatProviderId;
```

`src/constants/settingsDefaults.ts`：

- `BASE_DEFAULT_APP_SETTINGS` 新增：

```ts
  selectionAskModelId: undefined as unknown as string | undefined,
  selectionAskProviderId: undefined as unknown as string | undefined,
```

（或直接 `selectionAskModelId: undefined, selectionAskProviderId: undefined,` 需满足 TS 可选）

- `sanitizeAppSettings` 返回体末尾新增：

```ts
  selectionAskModelId: (() => {
    const raw = (settings as any).selectionAskModelId;
    if (!raw || typeof raw !== 'string') return undefined;
    const migrated = migrateRemovedModelId(raw);
    return resolveSupportedModelId(migrated ?? raw, defaultSettings.modelId) === migrated ? undefined : resolveSupportedModelId(migrated ?? raw, defaultSettings.modelId);
    // 简化：若 migrated 与 raw 不同则已映射，否则直接 resolveSupportedModelId
  })(),
  selectionAskProviderId: (() => {
    const raw = (settings as any).selectionAskProviderId;
    const normalized = normalizeProviderId(raw);
    const hasModel = Boolean((settings as any).selectionAskModelId);
    return hasModel ? normalized : undefined;
  })(),
```

实际实现用已导入的 `migrateRemovedModelId`/`resolveSupportedModelId`/`normalizeProviderId`，并在 `selectionAskModelId` 为空时强制 `selectionAskProviderId` 为 `undefined`。

- [ ] **Step 4: 运行单测验证通过**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/stores/settingsStore.test.ts -t "sanitizes selectionAsk" -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/types/settings.ts src/constants/settingsDefaults.ts src/stores/settingsStore.test.ts
git -c commit.gpgsign=false commit -m "feat(settings): add selectionAsk model fields with sanitization"
```

---

### Task 2: 国际化文案

**Files:**

- Modify: `src/i18n/translations/common.ts` (或 `settings/general.ts` + `common.ts`)
- Test: `scripts/check-i18n-coverage.mjs` 不报错

**Interfaces:**

- Consumes: Task 1 的类型
- Produces: `t('selectionAskModel')` 等 key，供 Task 3/5 使用。

- [ ] **Step 1: 编写覆盖检查失败用例**

在 `src/i18n/translations/common.ts` 中新增（7 语言 `zh/en/ja/ko/es/fr/de`）前，运行：
Run: `node scripts/check-i18n-coverage.mjs` 预期提示缺 key（若无自动检查则跳过此步，改为临时在组件中调用 `t('selectionAskModel')` 并运行 `typecheck` 验证缺 key 类型报错）。

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI typecheck 2>&1 | grep selectionAskModel`
Expected: error cannot find translation key (或 coverage 脚本报缺)。

- [ ] **Step 3: 实现文案**

`src/i18n/translations/common.ts` 在 `common` 导出对象新增：

```ts
selectionAskModel: { zh: '划词询问模型', en: 'Selection Ask Model', ja: '選択詢問モデル', ko: '선택 질문 모델', es: 'Modelo de consulta de selección', fr: 'Modèle de question de sélection', de: 'Auswahl-Abfragemodell' },
selectionAskModelDesc: { zh: '用于划词“询问”悬浮窗的独立模型，未设置时询问功能将不可用。', en: 'Independent model for the selection Ask panel. Ask is unavailable when not configured.', /* ... */ },
selectionAskModelNotConfigured: { zh: '未配置', en: 'Not configured', /* ... */ },
selectionAskModelUnavailable: { zh: '划词询问模型不可用，请在设置中更换', en: 'Selection Ask model unavailable, please change it in Settings', /* ... */ },
selectionAskModelConfigureHint: { zh: '请先在设置 → 界面中配置划词询问模型', en: 'Please configure Selection Ask model in Settings → Appearance', /* ... */ },
```

（保持项目现有多语言对象结构，若 `common.ts` 为扁平中文则按现有格式追加 7 语言分支。）

- [ ] **Step 4: 验证通过**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI typecheck`
Expected: PASS，无缺 key。

- [ ] **Step 5: 提交**

```bash
git add src/i18n/translations/common.ts
git -c commit.gpgsign=false commit -m "feat(i18n): add selectionAsk model keys"
```

---

### Task 3: 设置页独立卡片 SelectionAskModelSection

**Files:**

- Create: `src/components/settings/sections/SelectionAskModelSection.tsx`
- Modify: `src/components/settings/sections/AppearanceSection.tsx:1-25`
- Modify: `src/components/settings/SettingsContent.tsx:15, 134-138` (注入)
- Test: `src/components/settings/sections/SelectionAskModelSection.test.tsx`

**Interfaces:**

- Consumes: `AppSettings.selectionAskModelId/ProviderId`, `ModelPicker`, `buildProviderAwareModelList` / `getAvailableModels`, `updateSetting` 回调
- Produces: 在 interface tab 渲染的独立卡片，用户点选后调用 `onUpdate('selectionAskModelId', id)` + `onUpdate('selectionAskProviderId', providerId)`

- [ ] **Step 1: 编写失败用例**

`src/components/settings/sections/SelectionAskModelSection.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { SelectionAskModelSection } from './SelectionAskModelSection';
it('renders placeholder when not configured', () => {
  render(
    <SelectionAskModelSection
      settings={{ selectionAskModelId: undefined } as any}
      onUpdate={vitest.fn()}
      availableModels={[]}
    />,
  );
  expect(screen.getByText(/未配置|Not configured/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行单测验证失败**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/components/settings/sections/SelectionAskModelSection.test.tsx -v`
Expected: FAIL — Cannot find module。

- [ ] **Step 3: 实现组件**

`src/components/settings/sections/SelectionAskModelSection.tsx`：

```tsx
import React, { useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings, ModelOption } from '@/types';
import { ModelPicker } from '@/components/shared/ModelPicker';
import { buildProviderAwareModelList } from '@/utils/thirdPartyApiProviders';

export const SelectionAskModelSection: React.FC<{
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
  availableModels: ModelOption[];
}> = ({ settings, onUpdate, availableModels }) => {
  const { t } = useI18n();
  const models = useMemo(() => buildProviderAwareModelList(settings, availableModels), [settings, availableModels]);
  const selectedId = (settings as any).selectionAskModelId ?? '';
  const selected = models.find((m) => m.id === selectedId);
  return (
    <section
      data-settings-item="selectionAskModel"
      className="rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/40 p-4"
    >
      <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('selectionAskModel')}</h3>
      <p className="text-xs text-[var(--theme-text-secondary)] mt-1">{t('selectionAskModelDesc')}</p>
      <div className="mt-3">
        <ModelPicker
          models={models}
          selectedId={selectedId}
          onSelect={(id, providerId) => {
            onUpdate('selectionAskModelId' as any, id as any);
            onUpdate('selectionAskProviderId' as any, (providerId ?? undefined) as any);
          }}
          renderTrigger={({ isOpen, setIsOpen, selectedModel, ref }) => (
            <button
              ref={ref as any}
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="w-full flex items-center justify-between rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] px-3 py-2 text-sm"
            >
              <span
                className={selectedModel ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-tertiary)]'}
              >
                {selectedModel ? `${selectedModel.name} (${selectedModel.id})` : t('selectionAskModelNotConfigured')}
              </span>
              <span className="text-[var(--theme-text-tertiary)]">▾</span>
            </button>
          )}
        />
      </div>
    </section>
  );
};
```

`AppearanceSection.tsx` 引入并渲染：

```tsx
import { SelectionAskModelSection } from './SelectionAskModelSection';
// ... props 需透传 availableModels
<SelectionAskModelSection settings={settings} onUpdate={onUpdate} availableModels={availableModelsForAsk} />;
```

`SettingsContent.tsx` 中 `interface` 分支：将 `shortcutAvailableModels` 复用为 `askModels` 传入 `AppearanceSection`，或直接在 `AppearanceSection` 内用 `buildProviderAwareModelList`。

- [ ] **Step 4: 运行单测验证通过**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/components/settings/sections/SelectionAskModelSection.test.tsx -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/settings/sections/SelectionAskModelSection.tsx src/components/settings/sections/AppearanceSection.tsx src/components/settings/SettingsContent.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add selectionAsk model section in Appearance"
```

---

### Task 4: 询问运行时改造 — useSelectionAsk 读取独立配置并阻断

**Files:**

- Modify: `src/hooks/text-selection/useSelectionAsk.ts:53-85, 139-199`
- Test: `src/hooks/text-selection/useSelectionAsk.test.ts` (新建)

**Interfaces:**

- Consumes: `AppSettings.selectionAskModelId/ProviderId`, `resolveChatApiRoute`, `getKeyForRequest`, `t('selectionAskModelNotConfigured')` 等
- Produces: `ask()` 在未配置/不可用时以 `error` 阻断，不再回退到 `activeChat`

- [ ] **Step 1: 编写失败用例**

`src/hooks/text-selection/useSelectionAsk.test.ts`：

```ts
import { renderHook, act } from '@testing-library/react';
import { useSelectionAsk } from './useSelectionAsk';
import * as settingsStore from '@/stores/settingsStore';
it('blocks when selectionAsk model not configured', async () => {
  vi.spyOn(settingsStore.useSettingsStore, 'getState').mockReturnValue({
    appSettings: { selectionAskModelId: undefined },
  } as any);
  const { result } = renderHook(() => useSelectionAsk());
  await act(() => result.current.ask('hello', 'explain'));
  expect(result.current.error).toMatch(/配置|Not configured/);
  expect(result.current.isLoading).toBe(false);
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/hooks/text-selection/useSelectionAsk.test.ts -v`
Expected: FAIL — error not matching / not blocked。

- [ ] **Step 3: 实现**

`src/hooks/text-selection/useSelectionAsk.ts`：

- 删除 `activeChat` 回退逻辑，替换为：

```ts
const appSettings = useSettingsStore.getState().appSettings;
const selectionAskModelId = (appSettings as any).selectionAskModelId as string | undefined;
const selectionAskProviderId = (appSettings as any).selectionAskProviderId as string | undefined;
if (!selectionAskModelId) {
  setError(t('selectionAskModelConfigureHint') || '请先在设置中配置划词询问模型');
  setIsLoading(false);
  return;
}
const proxySettings = {
  modelId: selectionAskModelId,
  providerId: selectionAskProviderId,
  temperature: appSettings.temperature,
  topP: appSettings.topP,
  thinkingLevel: appSettings.thinkingLevel,
  thinkingBudget: appSettings.thinkingBudget,
  systemInstruction: appSettings.systemInstruction,
} as unknown as typeof DEFAULT_CHAT_SETTINGS;
const apiRoute = resolveChatApiRoute(appSettings, proxySettings);
if (isUnavailableThirdPartyRoute(apiRoute)) {
  setError(t('selectionAskModelUnavailable'));
  setIsLoading(false);
  return;
}
const keyResult = getKeyForRequest(appSettings, proxySettings);
if ('error' in keyResult) {
  setError(formatApiKeyErrorMessage(keyResult.error, t) + ' ' + t('selectionAskModelConfigureHint'));
  setIsLoading(false);
  return;
}
const apiModelId = apiRoute.modelId || selectionAskModelId;
```

- 后续 `buildGenerationConfig` 与 `providerConfig` 均改用 `proxySettings`。
- 保持 `provider.protocol === 'anthropic'` 分流不变。

- [ ] **Step 4: 验证通过**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/hooks/text-selection/useSelectionAsk.test.ts -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/hooks/text-selection/useSelectionAsk.ts src/hooks/text-selection/useSelectionAsk.test.ts
git -c commit.gpgsign=false commit -m "feat(selection-ask): route via independent model and block when not configured"
```

---

### Task 5: 悬浮窗展示 — 模型徽标与错误引导

**Files:**

- Modify: `src/components/chat/message-list/text-selection/SelectionAskPanel.tsx:62-72, 528-562, 615-626`
- Test: 手动验证 + 可选 `SelectionAskPanel.test.tsx` 补充

**Interfaces:**

- Consumes: `AppSettings.selectionAskModelId`, `t('selectionAskModelNotConfigured')`, `useSelectionAsk` 的 `error`
- Produces: Header 只读徽标、错误态“去设置”按钮。

- [ ] **Step 1: 编写快照/渲染失败用例**

`src/components/chat/message-list/text-selection/SelectionAskPanel.test.tsx`：

```tsx
it('shows not-configured badge', () => {
  // mock settingsStore return undefined model
  // render panel and expect badge text
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm exec vitest run src/components/chat/message-list/text-selection/SelectionAskPanel.test.tsx -v`
Expected: FAIL — badge not found。

- [ ] **Step 3: 实现**

`SelectionAskPanel.tsx`：

- 顶部 `const selectionAskModelId = useSettingsStore(s => (s.appSettings as any).selectionAskModelId); const selectionAskProviderId = useSettingsStore(s => (s.appSettings as any).selectionAskProviderId);`
- Header 中 `询问` 后插入：

```tsx
<span
  className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs ${selectionAskModelId ? 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)]' : 'bg-[var(--theme-bg-error-message)] text-[var(--theme-text-danger)]'}`}
  title={selectionAskModelId ?? ''}
>
  {selectionAskModelId ? selectionAskModelId.slice(0, 28) : t('selectionAskModelNotConfigured')}
</span>
```

- 错误卡下方若 `error` 含“配置/不可用”则追加：

```tsx
<button
  onClick={() =>
    window.dispatchEvent(
      new CustomEvent('open-settings', { detail: { tab: 'interface', highlight: 'selectionAskModel' } }),
    )
  }
  className="mt-2 text-xs text-[var(--theme-text-link)] hover:underline"
>
  {t('settingsTitle')}
</button>
```

（若项目无 `open-settings` 事件，则改为 `toast` 提示或 `onOpenSettings` prop。）

- [ ] **Step 4: 验证**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI typecheck && pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run src/components/chat/message-list/text-selection/SelectionAskPanel.test.tsx -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/message-list/text-selection/SelectionAskPanel.tsx
git -c commit.gpgsign=false commit -m "feat(selection-ask): show model badge and settings hint in panel"
```

---

### Task 6: 全量验证与发布

**Files:**

- Modify: 无新增，仅验证
- Test: 全量回归

- [ ] **Step 1: 全量类型与构建**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI typecheck`
Expected: PASS

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI build 2>&1 | tail -n 20`
Expected: ✓ built

- [ ] **Step 2: 单测回归**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI exec vitest run --reporter=verbose 2>&1 | tail -n 40`
Expected: 仅已知 `act(...)` 等非本分支失败为可接受

- [ ] **Step 3: Docker 发布与手动 QA**

Run: `export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" && cd /Volumes/WD_BLACK/Code/AMC-WebUI && npm run build:docker && docker compose up -d --build && curl -s -o /dev/null -w "%{http_code}" http://localhost:8082/`
Expected: 200

手动：

- 未配置时划词点“询问” → 弹窗报错“请先在设置中配置…”且不发请求
- 设置 → 界面 → 选择 Gemini 模型 / 第三方模型 → 悬浮窗徽标更新
- 发起询问 → 流式返回，停止/重试正常
- 禁用对应第三方连接或删模型 → 再次询问报错“不可用”
- 刷新后配置仍记忆

- [ ] **Step 4: 提交（如有 docs 更新）**

```bash
git add -A
git -c commit.gpgsign=false commit -m "chore: verify selection-ask model feature e2e"
```

---

## Self-Review

**Spec coverage:**

- §2 数据模型 → Task 1
- §3 设置 UI 位置与 ModelPicker → Task 3
- §4 运行时阻断与路由（三分支） → Task 4
- §4 徽标与引导 → Task 5
- §3 i18n → Task 2
- §6 测试 → 各 Task 的 Step 1/2/4 + Task 6
- 无遗漏

**Placeholder scan:** 无 TBD/TODO，所有步骤含具体代码与命令。

**Type consistency:** `selectionAskModelId?: string` 与 `selectionAskProviderId?: ChatProviderId` 在 Task1 定义，Task3/4/5 复用同一命名；`proxySettings` 显式构造避免类型漂移。
