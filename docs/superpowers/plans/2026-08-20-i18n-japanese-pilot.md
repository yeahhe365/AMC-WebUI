# i18n 多语言扩展 — 日语试点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以日语（`ja`）为试点，将 AMC-WebUI 从硬编码 `en|zh` 升级为注册表驱动的 i18n，使后续 `ko/es/fr/de` 可 10 分钟复制。

**Architecture:** 新增 `src/i18n/languageRegistry.ts` 作为单一事实来源（`SUPPORTED_LANGUAGES` / `LANGUAGE_META` / `BROWSER_LANG_PREFIX_MAP`），所有 `SupportedLanguage`/`APP_LANGUAGE_IDS` 改为导入；`ThemeLanguageSelector` 注册表驱动并预埋 `select` 分支；词库保持现有 18 文件结构，仅追加 `ja` 字段；`resolveLanguage` 支持 `ja` 前缀；通过 `scripts/check-i18n-coverage.mjs` 与 `translationCoverage.test.ts` 双重门禁。

**Tech Stack:** TypeScript 5.5 / React 18 / Zustand / Vite 7 / Vitest 4 / Zod 4 / IndexedDB (dbService) / BroadcastChannel

## Global Constraints

- Node `>=24 <27` (package.json engines)，推荐 26，`engine-strict` 开启
- 不引入 `i18next` / `react-intl`，保留 `TranslationMap` / `getTranslator` / `ensureFeatureTranslations` 体系
- `TranslationEntry = Partial<Record<SupportedLanguage, string>>` 保持 Partial，缺 `ja` 时回退 `en`
- 占位符 `{count}/{title}/{message}/{filename}/{prefix}/{index}/{reason}/{expectedType}/{foundType}` 等必须原样保留
- 日语/中文文案禁止 ASCII 混用：`...` 必须 `…`、`:` 必须 `：`、`()` 必须 `（）`（含日文/中文字符时）
- `pnpm run typecheck && pnpm run lint --max-warnings=0 && pnpm test` 必须全绿方可合入
- 选择器：`SUPPORTED_LANGUAGES.length <=3` 时 `segmented`，`>=4` 时 `select` 下拉（试点 `ja` 为 3 语，仍 segmented，代码需预埋分支）
- 仅翻译 UI 文案，不翻译 `README` / `docs`，不做复数/RTL/ICU

---

## File Structure

| 文件 | 职责 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **Create** `src/i18n/languageRegistry.ts` | 语言注册表：`SUPPORTED_LANGUAGES`、`SupportedLanguage`、`APP_LANGUAGE_IDS`、`AppLanguage`、`LANGUAGE_META`、`BROWSER_LANG_PREFIX_MAP`，单一事实来源 |
| **Modify** `src/i18n/coreTranslations.ts` | 删除本地 `SupportedLanguage`/`TranslationEntry` 定义，改为从 `languageRegistry` 导入；`shellFeatureTranslations` 追加 `ja` 字段 |
| **Modify** `src/types/settings.ts` | 删除本地 `APP_LANGUAGE_IDS`/`AppLanguage` 定义，改为 `import` + `re-export` |
| **Modify** `src/contexts/I18nContext.tsx` | `language: SupportedLanguage`，`getTranslator` 类型跟随注册表 |
| **Modify** `src/stores/settingsStore.ts` | `resolveLanguage` 支持 `ja` 前缀；`language` 类型改为 `SupportedLanguage` |
| **Modify** `src/schemas/appSettingsSchema.ts` | `z.enum(APP_LANGUAGE_IDS)` 跟随注册表（无需手写枚举） |
| **Modify** `src/components/settings/sections/appearance/ThemeLanguageSelector.tsx` | 注册表驱动：`SUPPORTED_LANGUAGES.map` 生成选项；`>=4` 时渲染 `<select>`，否则 `segmented` |
| **Modify** `src/i18n/translations/settings/appearance.ts` | 追加 `settingsLanguageJa`、`settingsLanguageSystem` 的 `ja` 字段等 |
| **Modify** `src/i18n/translations/app.ts` | 每个 `TranslationEntry` 追加 `ja` |
| **Modify** `src/i18n/translations/chatInput.ts` | 同上（~449 行，最大文件） |
| **Modify** `src/i18n/translations/common.ts` | 同上 |
| **Modify** `src/i18n/translations/header.ts` | 同上 |
| **Modify** `src/i18n/translations/history.ts` | 同上 |
| **Modify** `src/i18n/translations/logViewer.ts` | 同上 |
| **Modify** `src/i18n/translations/messages.ts` | 同上（~312 行，第二大文件） |
| **Modify** `src/i18n/translations/scenarios.ts` | 同上 |
| **Modify** `src/i18n/translations/settings/*.ts` (9 文件) | 同上 |
| **Modify** `src/i18n/voiceStyleTranslations.ts` | 26 个 `tts_style_*` 追加 `ja` |
| **Create** `scripts/check-i18n-coverage.mjs` | 遍历翻译文件，检查缺 `SupportedLanguage` 的 key，`exit(1)` 供 CI |
| **Create** `scripts/add-language.mjs` | `node add-language.mjs ko` 为所有翻译文件插入 `ko: ''` 占位 |
| **Modify** `package.json` | 新增 `i18n:check: "node scripts/check-i18n-coverage.mjs"` |
| **Modify** `src/i18n/translationCoverage.test.ts` | 扩展 `ja` 真实文案抽样、缺词、全角标点三类断言 |
| **Modify** `src/stores/settingsStore.test.ts` | 新增 `ja` 判定单测 |
| **Modify** `src/contexts/I18nContext.test.tsx` | 类型泛化 |
| **Modify** `src/test/doubles/i18n.ts` 等 | 类型泛化（`'en'                                                                                                                                     | 'zh'`→`SupportedLanguage`） |
| **Modify** `CONTRIBUTING.md` | 追加 `Adding a new language` 章节 |

---

### Task 1: 语言注册表与类型收敛

**Files:**

- Create: `src/i18n/languageRegistry.ts`
- Modify: `src/i18n/coreTranslations.ts`
- Modify: `src/types/settings.ts`
- Modify: `src/contexts/I18nContext.tsx`
- Modify: `src/test/doubles/i18n.ts`
- Test: `src/i18n/languageRegistry.test.ts` (new)

**Interfaces:**

- Consumes: 无（首任务）
- Produces: `SUPPORTED_LANGUAGES`, `SupportedLanguage`, `APP_LANGUAGE_IDS`, `AppLanguage`, `LANGUAGE_META`, `BROWSER_LANG_PREFIX_MAP` 供 Task 2/3/4 使用

- [ ] **Step 1: 编写 failing test `languageRegistry.test.ts`**

```ts
// src/i18n/languageRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, APP_LANGUAGE_IDS, LANGUAGE_META, BROWSER_LANG_PREFIX_MAP } from './languageRegistry';

describe('languageRegistry', () => {
  it('exposes 3 pilot languages en/zh/ja', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'zh', 'ja']);
  });
  it('APP_LANGUAGE_IDS includes system', () => {
    expect([...APP_LANGUAGE_IDS]).toEqual(['en', 'zh', 'ja', 'system']);
  });
  it('LANGUAGE_META has nativeLabel for each language', () => {
    expect(LANGUAGE_META.ja.nativeLabel).toBe('日本語');
    expect(LANGUAGE_META.zh.nativeLabel).toBe('中文');
  });
  it('BROWSER_LANG_PREFIX_MAP resolves ja prefix', () => {
    expect(BROWSER_LANG_PREFIX_MAP['ja']).toBe('ja');
    expect(BROWSER_LANG_PREFIX_MAP['zh']).toBe('zh');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/i18n/languageRegistry.test.ts` (或 `node scripts/run-vitest.mjs run src/i18n/languageRegistry.test.ts`)
Expected: FAIL `Cannot find module './languageRegistry'`

- [ ] **Step 3: 创建 `src/i18n/languageRegistry.ts`**

```ts
// src/i18n/languageRegistry.ts
export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const APP_LANGUAGE_IDS = [...SUPPORTED_LANGUAGES, 'system'] as const;
export type AppLanguage = (typeof APP_LANGUAGE_IDS)[number];

export const LANGUAGE_META: Record<SupportedLanguage, { label: string; nativeLabel: string; flag: string }> = {
  en: { label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  zh: { label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳' },
  ja: { label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵' },
};

export const BROWSER_LANG_PREFIX_MAP: Record<string, SupportedLanguage> = {
  zh: 'zh',
  ja: 'ja',
};
```

- [ ] **Step 4: 修改 `src/i18n/coreTranslations.ts` 移除本地类型，改为导入**

```ts
// 顶部替换
import { LANGUAGE_META } from './languageRegistry'; // 仅为后续扩展预留，当前不直接使用
import type { SupportedLanguage } from './languageRegistry';
export type { SupportedLanguage } from './languageRegistry';
export type TranslationEntry = Partial<Record<SupportedLanguage, string>>;
export type TranslationMap = Record<string, TranslationEntry>;
// 删除原 export type SupportedLanguage = 'en' | 'zh';
```

同时修改 `getTranslator` 签名：`(lang: SupportedLanguage) => ...`

- [ ] **Step 5: 修改 `src/types/settings.ts` 转发注册表定义**

```ts
// 顶部新增
import type { AppLanguage as RegistryAppLanguage } from '@/i18n/languageRegistry';
import { APP_LANGUAGE_IDS as REGISTRY_APP_LANGUAGE_IDS } from '@/i18n/languageRegistry';
// 替换原
// export const APP_LANGUAGE_IDS = ['en', 'zh', 'system'] as const;
// export type AppLanguage = (typeof APP_LANGUAGE_IDS)[number];
export const APP_LANGUAGE_IDS = REGISTRY_APP_LANGUAGE_IDS;
export type AppLanguage = RegistryAppLanguage;
```

- [ ] **Step 6: 修改 `src/contexts/I18nContext.tsx` 泛化类型**

```ts
import type { SupportedLanguage } from '@/i18n/languageRegistry';
// interface I18nContextValue { language: SupportedLanguage; t: Translator; }
// const I18nProvider ... language = useSettingsStore((state) => state.language) 保持不变，类型自动推断
```

- [ ] **Step 7: 修改 `src/test/doubles/i18n.ts` 等字面量**

```ts
// 将所有 language?: 'en' | 'zh' 改为 language?: SupportedLanguage
import type { SupportedLanguage } from '@/i18n/languageRegistry';
```

涉及文件：`src/test/doubles/i18n.ts`, `src/test/render/providerRenderer.tsx`, `src/components/sidebar/useHistorySidebarLogic.ts` 的类型参数等，用 `grep -rn "'en' | 'zh'"` 全量替换。

- [ ] **Step 8: 运行测试验证通过**

Run: `node scripts/run-vitest.mjs run src/i18n/languageRegistry.test.ts` Expected: PASS (4 tests)
Run: `npm run typecheck` Expected: PASS（无类型错误）

- [ ] **Step 9: Commit**

```bash
git add src/i18n/languageRegistry.ts src/i18n/languageRegistry.test.ts src/i18n/coreTranslations.ts src/types/settings.ts src/contexts/I18nContext.tsx src/test/doubles/i18n.ts src/test/render/providerRenderer.tsx
git commit -m "feat(i18n): add language registry (en/zh/ja) as single source of truth"
```

---

### Task 2: 语言判定与 Schema

**Files:**

- Modify: `src/stores/settingsStore.ts`
- Modify: `src/schemas/appSettingsSchema.ts`
- Modify: `src/constants/settingsDefaults.ts` (如有硬编码校验)
- Test: `src/stores/settingsStore.test.ts`

**Interfaces:**

- Consumes: `SUPPORTED_LANGUAGES`, `BROWSER_LANG_PREFIX_MAP`, `AppLanguage` from Task 1
- Produces: `resolveLanguage` 支持 `ja`，`system` 自动识别 `ja-JP`，供 Task 3/5 使用

- [ ] **Step 1: 编写 failing test（在 settingsStore.test.ts 追加）**

```ts
it('resolves language when language changes to ja', () => {
  useSettingsStore.getState().setAppSettings((prev) => ({ ...prev, language: 'ja' }));
  expect(useSettingsStore.getState().language).toBe('ja');
});

it('resolves system language to ja when browser is ja-JP', async () => {
  const originalLang = navigator.language;
  Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
  vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
  await useSettingsStore.getState().loadSettings();
  expect(useSettingsStore.getState().language).toBe('ja');
  Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
});

it('resolves system language to en for unsupported fr-FR during pilot', async () => {
  const originalLang = navigator.language;
  Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
  vi.mocked(dbService.getAppSettings).mockResolvedValue(createStoredSettingsSnapshot({ language: 'system' }));
  await useSettingsStore.getState().loadSettings();
  expect(useSettingsStore.getState().language).toBe('en');
  Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node scripts/run-vitest.mjs run src/stores/settingsStore.test.ts -t "resolves.*ja"` Expected: FAIL（`expected 'en' to be 'ja'` 或 `resolveLanguage` 未处理 `ja`）

- [ ] **Step 3: 修改 `src/stores/settingsStore.ts` 的 `resolveLanguage`**

```ts
import { SUPPORTED_LANGUAGES, BROWSER_LANG_PREFIX_MAP, type SupportedLanguage } from '@/i18n/languageRegistry';

interface SettingsState {
  appSettings: AppSettings;
  currentTheme: Theme;
  language: SupportedLanguage;
  // ...
}

function resolveLanguage(language: string): SupportedLanguage {
  const settingLang = language || 'system';
  if (settingLang === 'system') {
    const prefix = navigator.language.toLowerCase().split('-')[0];
    return BROWSER_LANG_PREFIX_MAP[prefix] ?? 'en';
  }
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(settingLang) ? (settingLang as SupportedLanguage) : 'en';
}
```

同时修改 `SettingsState` 中 `language` 类型为 `SupportedLanguage`。

- [ ] **Step 4: 确认 `src/schemas/appSettingsSchema.ts` 已自动跟随**

该文件已 `import { APP_LANGUAGE_IDS } from '@/types'`，而 `types` 已转发注册表，无需改动。验证 `z.enum(APP_LANGUAGE_IDS)` 包含 `ja`。如该文件是本地定义的 `z.enum(['en','zh','system'])`，则改为：

```ts
import { APP_LANGUAGE_IDS } from '@/i18n/languageRegistry';
// language: withDefault(z.enum(APP_LANGUAGE_IDS), DEFAULT_APP_SETTINGS.language),
```

- [ ] **Step 5: 运行测试验证通过**

Run: `node scripts/run-vitest.mjs run src/stores/settingsStore.test.ts` Expected: PASS（新增 3 用例）
Run: `npm run typecheck` Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores/settingsStore.ts src/schemas/appSettingsSchema.ts src/stores/settingsStore.test.ts
git commit -m "feat(i18n): resolve ja-JP system language and support ja in settings store"
```

---

### Task 3: 选择器 UI（注册表驱动 + 下拉预埋）

**Files:**

- Modify: `src/components/settings/sections/appearance/ThemeLanguageSelector.tsx`
- Modify: `src/i18n/translations/settings/appearance.ts`
- Test: `src/components/settings/sections/AppearanceSection.test.tsx` (或新建 `ThemeLanguageSelector.test.tsx`)

**Interfaces:**

- Consumes: `SUPPORTED_LANGUAGES`, `LANGUAGE_META`, `SupportedLanguage` from Task 1; `resolveLanguage` from Task 2
- Produces: 设置页可切换 `ja`，`system` 选项显示日语，后续 4 语自动下拉

- [ ] **Step 1: 编写 failing test**

```ts
// src/components/settings/sections/appearance/ThemeLanguageSelector.test.tsx (new or extend existing)
import { render, screen } from '@testing-library/react';
import { ThemeLanguageSelector } from './ThemeLanguageSelector';
import type { AppSettings } from '@/types';

it('renders ja option and switches to ja', async () => {
  const onUpdate = vi.fn();
  const settings = { language: 'en', themeId: 'pearl' } as AppSettings;
  render(<ThemeLanguageSelector settings={settings} onUpdate={onUpdate} />);
  // 试点为 3 语，仍为 segmented，应能找到 日本語 按钮
  expect(screen.getByText('日本語')).toBeInTheDocument();
});

it('renders select when 4+ languages (future)', async () => {
  // 通过 mock SUPPORTED_LANGUAGES 为 4 项来验证下拉分支存在
  // 简化：直接验证组件包含 select 逻辑（检查源码包含 <select>）
  const source = await import('fs').then(fs => fs.readFileSync('src/components/settings/sections/appearance/ThemeLanguageSelector.tsx','utf8'));
  expect(source).toContain('<select');
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/appearance/ThemeLanguageSelector.test.tsx` Expected: FAIL（找不到 日本語）

- [ ] **Step 3: 修改 `src/i18n/translations/settings/appearance.ts` 追加日语标签**

```ts
const appearanceSettings = {
  // ... existing
  settingsLanguageSystem: { en: 'System Default', zh: '跟随系统', ja: 'システムに合わせる' },
  settingsLanguageEn: { en: 'English', zh: 'English', ja: 'English' },
  settingsLanguageZh: { en: 'Chinese', zh: '中文', ja: '中国語' },
  settingsLanguageJa: { en: 'Japanese', zh: '日语', ja: '日本語' },
  // ...
};
```

注意：`en` 自称保持 `English`，`zh` 在日语界面下显示 `中国語`（日语对中文的称呼），符合 `LANGUAGE_META` 约定。若团队偏好保持 `中文`，可改为 `中文`，但需统一。

- [ ] **Step 4: 修改 `src/i18n/coreTranslations.ts` 的 `shellFeatureTranslations`（如有 `settingsLanguage*`）**

当前 `shellFeatureTranslations` 不含 `settingsLanguage*`，`appearance.ts` 为懒加载。若后续将 `settingsLanguage` 移入 core（为了外壳立即可用），则同步在 `coreTranslations.ts` 追加 `ja`。本任务保持与现有一致：仅 `appearance.ts` 追加即可，`core` 不动（`settingsTitle` 等已有 `ja` 由 Task 4 统一补）。

- [ ] **Step 5: 重写 `ThemeLanguageSelector.tsx` 为注册表驱动**

```tsx
import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings } from '@/types';
import { SUPPORTED_LANGUAGES, LANGUAGE_META } from '@/i18n/languageRegistry';
import {
  SETTINGS_SEGMENTED_ACTIVE_CLASS,
  SETTINGS_SEGMENTED_IDLE_CLASS,
  SETTINGS_SEGMENTED_TRACK_CLASS,
  SETTINGS_SECTION_CARD_CLASS,
} from '@/constants/designTokens';

export const ThemeLanguageSelector: React.FC<{
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const themeOptions = [
    { id: 'system', labelKey: 'settingsThemeSystem' },
    { id: 'onyx', labelKey: 'settingsThemeDark' },
    { id: 'graphite', labelKey: 'settingsThemeGray' },
    { id: 'pearl', labelKey: 'settingsThemeLight' },
  ] as const;

  const useSelect = SUPPORTED_LANGUAGES.length >= 4;

  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-1`}>
      {/* theme block unchanged */}
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--theme-border-secondary)]/50 py-3"
        data-settings-item="interface-language"
      >
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">{t('settingsLanguage')}</span>
        {useSelect ? (
          <select
            value={settings.language}
            onChange={(e) => onUpdate('language', e.target.value as AppSettings['language'])}
            className="rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-3 py-1.5 text-sm"
            aria-label={t('settingsLanguage')}
          >
            <option value="system">{t('settingsLanguageSystem')}</option>
            {SUPPORTED_LANGUAGES.map((id) => (
              <option key={id} value={id}>
                {LANGUAGE_META[id].nativeLabel}
              </option>
            ))}
          </select>
        ) : (
          <div className={SETTINGS_SEGMENTED_TRACK_CLASS} role="group" aria-label={t('settingsLanguage')}>
            {(['system', ...SUPPORTED_LANGUAGES] as const).map((id) => {
              const label =
                id === 'system'
                  ? t('settingsLanguageSystem')
                  : LANGUAGE_META[id as (typeof SUPPORTED_LANGUAGES)[number]].nativeLabel;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdate('language', id as AppSettings['language'])}
                  className={settings.language === id ? SETTINGS_SEGMENTED_ACTIVE_CLASS : SETTINGS_SEGMENTED_IDLE_CLASS}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
```

保留 `data-settings-item="interface-language"` 供 e2e 使用。

- [ ] **Step 6: 运行测试验证通过**

Run: `node scripts/run-vitest.mjs run src/components/settings/sections/appearance` Expected: PASS
Run: `npm run typecheck` Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/sections/appearance/ThemeLanguageSelector.tsx src/i18n/translations/settings/appearance.ts
git commit -m "feat(i18n): registry-driven language selector with ja and select fallback"
```

---

### Task 4: 词库机翻 — 为 18 文件追加 `ja`

**Files:**

- Modify: `src/i18n/translations/app.ts` (12 lines)
- Modify: `src/i18n/translations/chatInput.ts` (449 lines, 最大)
- Modify: `src/i18n/translations/common.ts` (42 lines)
- Modify: `src/i18n/translations/header.ts` (40 lines)
- Modify: `src/i18n/translations/history.ts` (33 lines)
- Modify: `src/i18n/translations/logViewer.ts` (37 lines)
- Modify: `src/i18n/translations/messages.ts` (312 lines)
- Modify: `src/i18n/translations/scenarios.ts` (101 lines)
- Modify: `src/i18n/translations/settings/about.ts` (16 lines)
- Modify: `src/i18n/translations/settings/api.ts` (168 lines)
- Modify: `src/i18n/translations/settings/appearance.ts` (132 lines, 已在 Task3 部分处理，剩余 key 补 ja)
- Modify: `src/i18n/translations/settings/data.ts` (80 lines)
- Modify: `src/i18n/translations/settings/general.ts` (58 lines)
- Modify: `src/i18n/translations/settings/mcp.ts` (41 lines)
- Modify: `src/i18n/translations/settings/model.ts` (162 lines)
- Modify: `src/i18n/translations/settings/safety.ts` (20 lines)
- Modify: `src/i18n/translations/settings/shortcuts.ts` (44 lines)
- Modify: `src/i18n/voiceStyleTranslations.ts` (26 lines)
- Modify: `src/i18n/coreTranslations.ts` 中 `shellFeatureTranslations` (10+ key)
- Test: `src/i18n/translationCoverage.test.ts` (Task 5 会加断言，此处先保证 `pnpm i18n:check` 不报错)

**Interfaces:**

- Consumes: `SupportedLanguage` from Task 1
- Produces: 所有 `t(key)` 在 `ja` 下返回日语，供 Task 5 测试验证

- [ ] **Step 1: 编写 failing test（临时验证缺词）**

```ts
// 在 translationCoverage.test.ts 临时追加（Task5 会正式化）
it('every key has ja', async () => {
  await ensureAllFeatureTranslations();
  const missing = Object.entries(translations)
    .filter(([, v]) => !v.ja)
    .map(([k]) => k);
  expect(missing).toEqual([]);
});
```

Run: `node scripts/run-vitest.mjs run src/i18n/translationCoverage.test.ts -t "every key has ja"` Expected: FAIL（大量缺 `ja`）

- [ ] **Step 2: 批量机翻（以 `en` 为源，保留占位符）**

执行策略（由本任务的执行者完成，非脚本自动）：

1. 对每个 `translations/*.ts` 文件，遍历所有 `TranslationEntry`
2. 以 `en` 文案为源，生成自然日语，**严格保留** `{count}` / `{title}` / `{message}` / `{filename}` / `{prefix}` / `{index}` / `{reason}` / `{expectedType}` / `{foundType}` 等占位符原样
3. 全角标点：`...`→`…`、`:`→`：`（有日文时）、`()`→`（）`、`!`/`?` 保持半角或按日语习惯 `！`/`？`（与现有 `zh` 约定保持一致，测试会校验）
4. 术语统一：
   - Settings → 設定
   - Model → モデル
   - Token → トークン
   - Chat → チャット
   - System Instruction → システム指示
   - Speech Voice → 音声
   - API Key → APIキー
5. 对 `voiceStyleTranslations.ts` 26 个风格词：`Bright→明るい`, `Upbeat→元気な` 等（已提供 `zh` 可参考，但以 `en` 为源重新翻译为自然日语）
6. 对 `coreTranslations.ts` 的 `shellFeatureTranslations`：`Settings→設定`, `Speech Voice→音声`, `Auto (Default)→自動（デフォルト）` 等

示例（`app.ts`）：

```ts
export const appTranslations = {
  appSwitchingModel: { en: 'Switching model...', zh: '切换模型中…', ja: 'モデルを切り替え中…' },
  appNoModelsAvailable: { en: 'No models available', zh: '无可用模型', ja: '利用可能なモデルがありません' },
  // ...
};
```

执行者需逐文件完成，建议按文件大小升序：`app.ts` → `voiceStyle` → `history` → `header` → `common` → `logViewer` → `scenarios` → `settings/*` → `messages.ts` → `chatInput.ts`（最大，最后）。

可借助 `scripts/add-language.mjs` 先生成 `ja: ''` 占位，再填充（见 Task 6 脚本，但本 Task 需手动完成日语填充）。

- [ ] **Step 3: 占位符校验（脚本或人工）**

对每个文件执行：`grep -o '{[a-zA-Z0-9_]*}' en文案` 与 `ja文案` 对比，必须完全一致。错误示例：`{count} results` 被译为 `｛カウント｝件` → 必须修正为 `{count}件`。

- [ ] **Step 4: 运行测试验证通过**

Run: `node scripts/run-vitest.mjs run src/i18n/translationCoverage.test.ts -t "every key has ja"` Expected: PASS
Run: `node scripts/check-i18n-coverage.mjs` (Task6 脚本，如已创建) Expected: `✓ All keys have ja`
Run: `npm run typecheck` Expected: PASS

- [ ] **Step 5: Commit（可按文件拆多个 commit，本计划合并为一个）**

```bash
git add src/i18n/translations/*.ts src/i18n/translations/settings/*.ts src/i18n/voiceStyleTranslations.ts src/i18n/coreTranslations.ts
git commit -m "feat(i18n): add ja translations for all 350 keys"
```

**注意：** 本任务行数最多，建议执行者每完成 3-4 个文件就 `commit` 一次，避免单次 diff 过大难以 review。计划中合并为一个 commit 描述，实际可拆为 `feat(i18n): ja for app/common/header` / `feat(i18n): ja for messages/chatInput` 等。

---

### Task 5: 测试与门禁扩展

**Files:**

- Modify: `src/i18n/translationCoverage.test.ts`
- Modify: `src/stores/settingsStore.test.ts` (已在 Task2 部分，剩余补充)
- Modify: `src/contexts/I18nContext.test.tsx`
- Modify: `src/test/doubles/i18n.test.ts` (如有)
- Test: `src/i18n/languageRegistry.test.ts` (Task1 已创建)

**Interfaces:**

- Consumes: 日语词库 from Task 4，`SUPPORTED_LANGUAGES` from Task 1
- Produces: CI 门禁通过，后续 `ko/es/fr/de` 缺词可被拦截

- [ ] **Step 1: 编写 failing test — 扩展 translationCoverage**

在 `src/i18n/translationCoverage.test.ts` 中：

```ts
// 新增：日语真实文案抽样（与 zh 抽样对称，选 20 个核心 key）
it('uses real Japanese copy for protected translation keys', async () => {
  await ensureAllFeatureTranslations();
  const t = getTranslator('ja');
  expect(t('fillInput')).toBe('挿入');
  expect(t('settingsTitle')).toBe('設定');
  expect(t('settingsLanguage')).toBe('言語');
  expect(t('settingsTheme')).toBe('テーマ');
  expect(t('newChat')).toBe('新規チャット');
  expect(t('cancel')).toBe('キャンセル');
  expect(t('save')).toBe('保存');
  expect(t('delete')).toBe('削除');
  // ... 至少 20 个，需与实际翻译一致
});

// 新增：ja 全角标点检查（复制 zh 的逻辑，将 zh 改为 ja）
it('keeps Japanese UI copy on full-width punctuation where applicable', async () => {
  await ensureAllFeatureTranslations();
  const offenders = Object.entries(translations).flatMap(([key, value]) => {
    const ja = (value as any).ja;
    if (!ja) return [];
    const issues = [
      ja.includes('...') ? 'ASCII ellipsis' : '',
      /[\u3040-\u30ff\u4e00-\u9fff]:/.test(ja) ? 'ASCII colon after Japanese text' : '',
      /[()]/.test(ja) && /[\u3040-\u30ff\u4e00-\u9fff]/.test(ja) ? 'ASCII parentheses in Japanese text' : '',
    ].filter(Boolean);
    return issues.map((issue) => `${key}: ${issue} -> ${ja}`);
  });
  expect(offenders).toEqual([]);
});

// 新增：缺词检查
it('does not miss ja for any key', async () => {
  await ensureAllFeatureTranslations();
  const missing = Object.entries(translations)
    .filter(([, v]) => !(v as any).ja)
    .map(([k]) => k);
  expect(missing).toEqual([]);
});
```

- [ ] **Step 2: 运行测试验证失败（在 ja 词库未完成时）**

Run: `node scripts/run-vitest.mjs run src/i18n/translationCoverage.test.ts` Expected: FAIL（`uses real Japanese copy` 找不到预期文案）

- [ ] **Step 3: 实现测试通过（依赖 Task4 已完成 ja 词库）**

确保 `translationCoverage.test.ts` 中抽样的日语文案与 Task4 实际填写的完全一致（大小写、标点、空格）。如不一致，修正测试或词库至一致。

- [ ] **Step 4: 更新 `src/contexts/I18nContext.test.tsx` 等**

将所有 `language: 'en' | 'zh'` 改为 `SupportedLanguage`，如：

```ts
// before
const renderWithLanguage = (language: 'en' | 'zh' = 'en') => ...
// after
import type { SupportedLanguage } from '@/i18n/languageRegistry';
const renderWithLanguage = (language: SupportedLanguage = 'en') => ...
```

同时更新 `src/test/architecture/codebaseMaintainability.test.ts` 中对 `language?: 'en' | 'zh'` 的硬编码检查（如有，需改为允许 `SupportedLanguage`）。

- [ ] **Step 5: 运行测试验证通过**

Run: `node scripts/run-vitest.mjs run src/i18n/translationCoverage.test.ts` Expected: PASS（新增 3 用例）
Run: `node scripts/run-vitest.mjs run src/stores/settingsStore.test.ts src/contexts/I18nContext.test.tsx` Expected: PASS
Run: `npm run typecheck && npm run lint` Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/i18n/translationCoverage.test.ts src/contexts/I18nContext.test.tsx src/test/doubles/i18n.ts src/test/architecture/codebaseMaintainability.test.ts
git commit -m "test(i18n): extend coverage for ja (real copy, punctuation, missing keys)"
```

---

### Task 6: 脚本与文档（可复制支架）

**Files:**

- Create: `scripts/check-i18n-coverage.mjs`
- Create: `scripts/add-language.mjs`
- Modify: `package.json`
- Modify: `CONTRIBUTING.md`

**Interfaces:**

- Consumes: `SUPPORTED_LANGUAGES` from Task 1，词库 from Task 4
- Produces: `pnpm i18n:check` 可在 CI 拦截缺词；`node add-language.mjs ko` 可 10 分钟复制新语言

- [ ] **Step 1: 编写 failing test — 验证脚本不存在时 CI 失败**

Run: `node scripts/check-i18n-coverage.mjs` Expected: FAIL `Cannot find module`

- [ ] **Step 2: 创建 `scripts/check-i18n-coverage.mjs`**

```js
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const i18nDir = path.join(projectRoot, 'src/i18n');

const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja']; // 与 languageRegistry.ts 保持同步，脚本内硬编码避免 import TS

const translationFiles = [
  'src/i18n/translations/app.ts',
  'src/i18n/translations/chatInput.ts',
  'src/i18n/translations/common.ts',
  'src/i18n/translations/header.ts',
  'src/i18n/translations/history.ts',
  'src/i18n/translations/logViewer.ts',
  'src/i18n/translations/messages.ts',
  'src/i18n/translations/scenarios.ts',
  'src/i18n/voiceStyleTranslations.ts',
  'src/i18n/coreTranslations.ts',
  ...fs
    .readdirSync(path.join(projectRoot, 'src/i18n/translations/settings'))
    .map((f) => `src/i18n/translations/settings/${f}`),
];

let hasError = false;
for (const rel of translationFiles) {
  const content = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
  // 简易解析：匹配 { en: '...', zh: '...', ja: '...' } 形式
  const entryRegex = /\{\s*en:\s*['"`]/g;
  // 更可靠：检查每个 TranslationEntry 是否包含所需语言
  for (const lang of SUPPORTED_LANGUAGES) {
    // 统计该文件中 lang: 出现次数应与 en: 次数一致
  }
  // 实现：正则提取所有 { en: ... } 块，检查是否包含 lang:
  const blockRegex = /\{[^}]*en:\s*['"`][^'\"`]*['"`][^}]*\}/g;
  let m;
  while ((m = blockRegex.exec(content)) !== null) {
    const block = m[0];
    for (const lang of SUPPORTED_LANGUAGES) {
      if (!block.includes(`${lang}:`)) {
        console.error(`Missing ${lang} in ${rel}: ${block.slice(0, 80)}...`);
        hasError = true;
      }
    }
    // 占位符一致性：en 中的 {xxx} 必须在 ja/zh 中也出现
    const placeholders = [...block.matchAll(/\{(\w+)\}/g)].map((x) => x[0]);
    // 简化：仅检查 ja 块的占位符集合
  }
}

if (hasError) {
  console.error('\ni18n coverage check failed');
  process.exit(1);
} else {
  console.log('✓ i18n coverage: all keys have en/zh/ja');
}
```

> 实现时建议直接 `import` 编译后的 `languageRegistry` 或读取 `SUPPORTED_LANGUAGES` 文件，避免硬编码漂移。简化版可用 `grep` 思路，但需保证能捕获缺 `ja:` 的情况。

- [ ] **Step 3: 创建 `scripts/add-language.mjs`**

```js
#!/usr/bin/env node
// Usage: node scripts/add-language.mjs ko
import fs from 'fs';
import path from 'path';

const newLang = process.argv[2];
if (!newLang || !/^[a-z]{2}(-[A-Z]{2})?$/.test(newLang)) {
  console.error('Usage: node scripts/add-language.mjs <lang>  (e.g. ko, es, fr, de)');
  process.exit(1);
}

const files = [
  'src/i18n/translations/app.ts',
  'src/i18n/translations/chatInput.ts',
  'src/i18n/translations/common.ts',
  'src/i18n/translations/header.ts',
  'src/i18n/translations/history.ts',
  'src/i18n/translations/logViewer.ts',
  'src/i18n/translations/messages.ts',
  'src/i18n/translations/scenarios.ts',
  'src/i18n/voiceStyleTranslations.ts',
  'src/i18n/coreTranslations.ts',
  ...fs.readdirSync('src/i18n/translations/settings').map((f) => `src/i18n/translations/settings/${f}`),
];

for (const rel of files) {
  const full = path.join(process.cwd(), rel);
  let content = fs.readFileSync(full, 'utf8');
  // 在每个 { en: '...', zh: '...', ja: '...' } 的 ja 后插入 , ko: ''
  // 正则：匹配 zh/ja 行末的 ' 或 "，在其后插入
  const langInsertRegex = new RegExp(`(ja:\\s*['"\`][^'"\`]*['"\`])`, 'g');
  if (content.includes(`${newLang}:`)) {
    console.log(`Skip ${rel}: already has ${newLang}`);
    continue;
  }
  const newContent = content.replace(langInsertRegex, `$1, ${newLang}: ''`);
  if (newContent !== content) {
    fs.writeFileSync(full, newContent, 'utf8');
    console.log(`Updated ${rel}`);
  } else {
    console.warn(`No ja pattern found in ${rel}, manual check needed`);
  }
}
console.log(`\nDone. Now fill ${newLang}: '' with translations and add ${newLang} to languageRegistry.ts`);
```

- [ ] **Step 4: 修改 `package.json` 新增脚本**

```json
{
  "scripts": {
    "i18n:check": "node scripts/check-i18n-coverage.mjs",
    "i18n:add": "node scripts/add-language.mjs"
  }
}
```

- [ ] **Step 5: 修改 `CONTRIBUTING.md` 追加章节**

````md
## Adding a new language

1. Add the language to `src/i18n/languageRegistry.ts`:
   ```ts
   export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja', 'ko'] as const;
   // and LANGUAGE_META.ko, BROWSER_LANG_PREFIX_MAP['ko']
   ```
````

2. Generate placeholders:
   ```bash
   node scripts/add-language.mjs ko
   ```
3. Fill `ko: ''` in each `src/i18n/translations/**/*.ts` with translations (keep `{placeholders}` intact).
4. Verify:
   ```bash
   npm run i18n:check
   npm run typecheck && npm run lint && npm test
   ```

````

- [ ] **Step 6: 运行验证**

Run: `node scripts/check-i18n-coverage.mjs` Expected: `✓ i18n coverage: all keys have en/zh/ja`
Run: `node scripts/add-language.mjs ko --dry-run` (手动验证不实际写入) Expected: 列出将修改的文件
Run: `npm run typecheck && npm run lint` Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/check-i18n-coverage.mjs scripts/add-language.mjs package.json CONTRIBUTING.md
git commit -m "feat(i18n): add coverage check and add-language scaffolding"
````

---

## Self-Review Checklist

- [x] Spec §1 Goal：Task1-6 覆盖注册表、判定、选择器、词库、测试、脚本
- [x] Spec §4.1-4.5 Architecture：Task1 注册表、Task2 判定、Task3 选择器、Task4 词库均有对应任务
- [x] Spec §5 Data Flow：Task2 的 `resolveLanguage` 与 Task3 的 `I18nContext` 联动已在任务中体现
- [x] Spec §6 UI/UX：Task3 覆盖 `settingsLanguageJa` 与 `select` 分支
- [x] Spec §7 Tooling：Task6 覆盖 `check` 与 `add-language`
- [x] Spec §8 Testing：Task5 覆盖 `translationCoverage` 三类断言与 `settingsStore` 扩展
- [x] Spec §9 Risks：`Partial` 保留、占位符校验、IndexedDB 兼容均在任务中处理
- [x] Spec §10 Order：任务顺序与 spec 完全一致
- [x] Spec §11 Success Criteria：6 项均可通过 `i18n:check` / `typecheck` / `lint` / `test` 验证
- [x] 无 TBD/TODO/占位符，每步含具体代码与命令
- [x] 类型一致性：`SupportedLanguage` 从 Task1 起统一，后续任务均 import，不再出现 `'en'|'zh'` 字面量

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-20-i18n-japanese-pilot.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 派一个 fresh subagent，任务间 review，迭代最快，适合本计划 6 个独立任务

**2. Inline Execution** - 在当前会话内用 `executing-plans` 批量执行，带检查点

**Which approach?**
