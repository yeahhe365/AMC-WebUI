# i18n 多语言扩展 — 日语试点设计

Date: 2026-08-20
Status: approved, awaiting implementation plan
Target: 先以日语（`ja`）为试点，验证可扩展支架；通过后再批量复制 `ko`/`es`/`fr`/`de`

---

## 1. Goal

在保留现有 `TranslationMap` / `getTranslator` / 懒加载体系的前提下，将语言从硬编码 `en|zh` 升级为注册表驱动，使新增一门语言只需：

1. 在注册表加一行元数据
2. 在各 `translations/*.ts` 补对应 `ja: '...'` 字段（可由脚本生成占位）
3. 无需改动类型、判定逻辑、选择器、测试门禁

试点产出：日语完整可用（`system` 跟随浏览器 `ja`、设置页可切换、所有 `t()` 有日语、CI 缺词拦截）。

## 2. Non-goals

- 不迁移到 `i18next` / `react-intl` / `next-intl`（350 key 规模不值得重写门禁与测试）
- 不翻译 `README.md` / `docs/` 文档（仅 UI 文案）
- 不做复数/性别/日期/数字的 ICU 格式化（当前 `interpolate` 仅 `{name}` 占位）
- 不做 RTL 语言（`ar`/`he`）的布局镜像
- 本次不一次性上 `ko/es/fr/de`，但支架必须让它们 10 分钟可复制

## 3. 现状与约束

- 类型散落：`SupportedLanguage = 'en'|'zh'` 在 `coreTranslations.ts`、`I18nContext.tsx`、`settingsStore.ts`、`types/settings.ts:APP_LANGUAGE_IDS` 等 10+ 处重复字面量
- 选择器：`ThemeLanguageSelector.tsx` 为 `segmented control`，3 项刚好，≥4 项溢出（移动端尤甚）
- 判定：`resolveLanguage(language)` 仅处理 `zh` 前缀，其余一律 `en`
- 门禁：`translationCoverage.test.ts` 仅保护 `zh` 的真实文案与全角标点；`t()` 缺词检查仅在测试中，未在 CI 脚本中显式报错
- 词库分布：18 文件、~1747 行、`~350 key`；`core` 同步、`settings/logViewer/scenarios` 懒加载
- 约定：占位符 `{count}/{title}/{message}/{filename}` 等必须原样保留；中文已约定全角 `…`/`：`/`（ ）`，日语需同样遵循全角标点

## 4. Architecture

### 4.1 语言注册表（单一事实来源）

新增 `src/i18n/languageRegistry.ts`：

```ts
export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja'] as const; // 试点后扩展到 7
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
  // 后续 ko/es/fr/de 在此追加
};
```

- `coreTranslations.ts` 的 `SupportedLanguage` / `TranslationEntry` 改为从此注册表导入，不再本地定义
- `types/settings.ts` 删除本地 `APP_LANGUAGE_IDS` 定义，改为 `import` 并 `re-export`，保持对外 API 不变
- `I18nContext.tsx`、`settingsStore.ts`、`test` 等所有字面量 `'en'|'zh'` 统一改为 `SupportedLanguage`

### 4.2 翻译类型

```ts
export type TranslationEntry = Partial<Record<SupportedLanguage, string>>;
// 保留 Partial，缺 ja 时回退 en（getTranslator 已实现 fallback 链）
```

不改为 `Required`，避免试点期间未翻完就阻塞渲染。

### 4.3 选择器策略

`ThemeLanguageSelector.tsx`：

- 当前 `segmented control` 在 `SUPPORTED_LANGUAGES.length <= 3` 时保留；
- `>= 4` 时自动切换为 `<select>` 下拉（带 `nativeLabel`），避免溢出。试点阶段 `ja` 加入后即为 3 语，仍可保留 segmented；但代码需预埋下拉分支，供 `ko` 等后续语言直接生效。
- 选项数据来源于 `SUPPORTED_LANGUAGES.map(id => LANGUAGE_META[id])`，不再手写 3 个对象。
- `settingsLanguageJa: { en:'Japanese', zh:'日语', ja:'日本語' }` 等标签需同时提供 3 语，`t()` 在不同界面语言下显示对应译名（与现有 `settingsLanguageEn/Zh` 保持一致）。

### 4.4 词库组织

保持现有文件拆分（`app.ts` / `chatInput.ts` / `messages.ts` / `settings/*` 等），不引入 `ja.json`。原因：现有测试直接 `import` 各模块并 `Object.assign`，拆 JSON 会改动懒加载链路。

每个 `TranslationMap` 条目追加 `ja`：

```ts
export const appTranslations = {
  appSwitchingModel: { en: 'Switching model...', zh: '切换模型中…', ja: 'モデルを切り替え中…' },
};
```

`ttsStyleTranslations` 等 26 个语音风格词亦同。

### 4.5 判定与持久化

`settingsStore.ts: resolveLanguage(language: string): SupportedLanguage`:

```ts
function resolveLanguage(language: string): SupportedLanguage {
  if (language === 'system' || !language) {
    const prefix = navigator.language.toLowerCase().split('-')[0];
    return BROWSER_LANG_PREFIX_MAP[prefix] ?? 'en';
  }
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language) ? (language as SupportedLanguage) : 'en';
}
```

- `schemas/appSettingsSchema.ts`: `z.enum(APP_LANGUAGE_IDS)` 自动跟随注册表
- 已持久化的 `language: 'zh'` / `'en'` 兼容；非法值回退 `en`

## 5. Data Flow

```
用户在设置页选择 ja
  → onUpdate('language', 'ja')
  → settingsStore.setAppSettings({language:'ja'}) + sanitize + IndexedDB + BroadcastChannel
  → useSettingsStore.language === 'ja'
  → I18nContext: getTranslator('ja')
  → t(key) 查找 translations[key].ja ?? translations[key].en ?? key
  → interpolate 处理 {count} 等占位

system 模式：
  navigator.language === 'ja-JP' → BROWSER_LANG_PREFIX_MAP['ja'] → 'ja'
  navigator.language === 'zh-CN' → 'zh'
  navigator.language === 'fr-FR' (试点阶段未支持) → 'en'（后续加 fr 后自动命中）
```

懒加载：`ensureFeatureTranslations('settings')` 等在加载后 `registerTranslations`，其中 `ja` 字段一并注册，无需改动加载逻辑。

## 6. UI / UX

- 设置 → 外观 → 语言：试点后显示 `System / English / 中文 / 日本語`（三语时仍为分段按钮，四语起自动下拉）
- `system` 文案：`settingsLanguageSystem: { en:'System Default', zh:'跟随系统', ja:'システムに合わせる' }`
- 语言名自称：`settingsLanguageEn: { en:'English', zh:'English', ja:'English' }` 保持英文自称；`settingsLanguageJa: { en:'Japanese', zh:'日语', ja:'日本語' }`
- 日语排版：全角标点（`…` / `：` / `（ ）` / `。`），`translationCoverage` 对 `ja` 同样校验 ASCII 混用

## 7. Tooling & Scripts

- `scripts/check-i18n-coverage.mjs`（新增）：遍历 `src/i18n/translations/**/*.ts`，解析所有 `TranslationMap`，检查任意 `key` 缺 `SupportedLanguage` 中的某语，输出缺失清单，`process.exit(1)` 供 CI 调用。`package.json` 新增 `i18n:check`。
- `scripts/add-language.mjs`（新增）：`node scripts/add-language.mjs ko` 遍历所有翻译文件，在每个 `{ en:..., zh:... }` 后插入 `ko: ''` 占位（正则匹配，确保不破坏注释与格式），供后续批量机翻。
- 机翻流程（试点由本任务执行）：以 `en` 为源，批量生成 `ja`，保留所有 `{placeholder}` 原样，人工抽检高频页面（聊天输入、设置、消息操作）约 30 个 key。

## 8. Testing Strategy

- `translationCoverage.test.ts`：
  - 扩展 `getTranslator('zh')` 断言组为 `['zh','ja']` 双语保护（抽样 20+ 个核心 key 的日语真实文案）
  - 全角标点检查：对 `ja` 同样禁止 `...` / `:` / `()` 混入含日文字符的文案
  - 新增硬编码检查：`t()` 覆盖率检查中 `translations` 需包含 `ja` 字段的完备性
  - 新增 `does not miss ja for any key` 单测
- `settingsStore.test.ts`：
  - 新增 `resolves system to ja when browser is ja-JP`
  - 新增 `resolves language when language changes to ja`
- `I18nContext.test.tsx` / `providerRenderer`：`language?: SupportedLanguage` 泛化
- `ThemeLanguageSelector.test`（如有）：验证 3 语 segmented、4 语下拉切换
- 手测清单：`system(ja-JP)/ja/en/zh` 四档切换，刷新持久化，`BroadcastChannel` 跨 Tab 同步

## 9. Risks & Mitigations

| 风险 | 缓解 |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `SupportedLanguage` 字面量散落，漏改导致 `ja` 回退到 `en` | 注册表单一来源 + `grep -r "'en' \\                      | 'zh'"`在 PR 中全量替换 +`check-i18n-coverage.mjs` |
| segmented 放不下 4+ 语言 | 预埋下拉分支，`SUPPORTED_LANGUAGES.length >=4` 自动切换 |
| 机翻占位符丢失（如 `{count}` 被译为 `｛カウント｝`） | 脚本校验占位符集合一致性，测试中 `interpolate` 覆盖 |
| 日语全角/半角混用被测试拦截 | 测试与实现同改，明确 `ja` 也执行全角校验 |
| 旧用户 `IndexedDB` 存 `language:'zh'` 升级后类型变 | `resolveLanguage` 对非法值回退 `en`，`z.enum` 兼容 |

## 10. Implementation Order

1. **注册表与类型收敛**：新增 `languageRegistry.ts`，迁移 `SupportedLanguage` / `APP_LANGUAGE_IDS` 定义，`settingsStore` / `I18nContext` / `types` 改为导入。
2. **判定与 Schema**：重写 `resolveLanguage` 支持 `ja` 前缀，`appSettingsSchema` 跟随注册表。
3. **选择器 UI**：`ThemeLanguageSelector` 注册表驱动 + 下拉分支预埋；`appearance.ts` 追加 `settingsLanguage*` 日语标签。
4. **词库机翻（试点执行）**：18 文件补 `ja`，`voiceStyleTranslations` 同步，脚本校验占位符。
5. **测试与门禁**：扩展 `translationCoverage` / `settingsStore` 测试，新增 `check-i18n-coverage.mjs` 与 `add-language.mjs`，`package.json` 脚本，`CONTRIBUTING.md` 追加 `Adding a new language`。
6. **验收**：`pnpm lint && typecheck && test && i18n:check` 全绿，手动四档切换验证。

## 11. Success Criteria

- [ ] `pnpm i18n:check` 无缺失；`pnpm test` / `typecheck` / `lint` 全绿
- [ ] 设置页可在 `system / en / zh / ja` 间切换，`ja-JP` 浏览器 `system` 自动为日语
- [ ] 所有 `t(key)` 在 `ja` 下返回日语而非 `en`/`key`（抽样 20+ 核心 key）
- [ ] `ThemeLanguageSelector` 在 3 语时 segmented 正常，代码已支持 4+ 语下拉
- [ ] `scripts/add-language.mjs ko` 可一键为 `ko` 生成占位，后续 4 门 10 分钟可复制
- [ ] `CONTRIBUTING.md` 说明新增语言的 3 步流程

## 12. Future Expansion

- 批量追加 `ko` / `es` / `fr` / `de`：在 `SUPPORTED_LANGUAGES` 加一项，跑 `add-language.mjs`，机翻补齐，测试保护追加对应语言抽样
- 如需 `zh-TW` / `pt-BR` 等区域变体，`BROWSER_LANG_PREFIX_MAP` 支持 `zh-tw` 精确匹配
- 如后续引入复数/日期格式化，再评估 `Intl` 或 `i18next`，当前 `interpolate` 保持不变
