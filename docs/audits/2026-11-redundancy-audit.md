# AMC-WebUI 冗余代码审计报告

- **审计对象**: `/Volumes/WD_BLACK/Code/AMC-WebUI` (v1.23.0, HEAD `72a8740e` + 工作区未提交改动)
- **代码规模**: `src` 1736 文件 / 295,759 行，`server` 82 / 14,313，`shared` 16 / 1,151，`docs-site` 47 / 23,483 — TS/TSX 合计约 **31 万行**
- **审计方式**: 只读静态分析（本报告为新增文件）。**后续已按本报告第七节实施一批修复，见下一节。**
- **基线健康度**（审计前实测，全部通过）: `tsc --noEmit` = 0 错误；`eslint --max-warnings=0` = 0 问题；`vitest` = **672 文件 / 5423 用例全部通过**；`vite build` 成功；`knip` = 0 问题；`i18n:check` = 2122/2122 键 × 7 语言齐全

---

## 〇、本次已实施的修复（附实测收益）

按"收益/风险"顺序落地了第七节的第 1、1b、1c、2、3、5、11、12、13、14、17 项。**全部通过完整 `verify` 门禁**：`format:check` ✓、`i18n:check` ✓、`tsc --noEmit` ✓、`eslint --max-warnings=0` ✓、`vitest` **672 文件 / 5417 用例全绿** ✓、`knip` ✓、`vite build` ✓、`build:api` ✓。

| #   | 改动                                                                                                                                                                                                                                                    | 文件                                                                                                                 | 验证方式                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1b  | **echarts 改为按需导入**：移除 `chartRendererScript.ts` 顶层 `import * as echarts`，`hydrateChartsIntoDocument` 改为 `async` 并在函数内 `await import('echarts')`；文档无图表时提前返回、完全不触发该次网络请求                                         | `src/utils/html-preview/chartRendererScript.ts`、`src/utils/html-preview/previewDocument.ts`（两处调用点加 `await`） | 类型检查 + 重写后的 `chartRendererHydration.test.ts`（6 用例，含"无图表不加载"守卫） |
| 1   | 预加载排除 `model-icons`                                                                                                                                                                                                                                | `vite/chunks.ts`                                                                                                     | 构建后 `dist/index.html` 已无该 chunk                                                |
| 1c  | 预加载排除 `echarts-vendor`                                                                                                                                                                                                                             | `vite/chunks.ts`                                                                                                     | 同上                                                                                 |
| 5   | **删除 157 个不可达图标（2.12 MiB）**：先用修正后的解析规则逐层模拟 `resolveIconRef`（K1=120 / K2=58 / 33 别名 / 24 模板 + 8 legacy），与独立审计的 49/74/14/20 交叉验证一致后方才删除；**保留 `dashscope.svg`**（唯一的 1 文件分歧，5.5 KB，宁可不删） | 4 个图标目录                                                                                                         | 两个测试文件的旧假设已更新（见下）；构建产物实测下降                                 |
| —   | 预缓存排除 `echarts-vendor` / `model-icons` / `e2e-seed.html`                                                                                                                                                                                           | `vite.config.ts`                                                                                                     | `dist/sw.js` 中三者命中数均为 0                                                      |
| 2   | 删除 `sanitizeMcpServers` 死副本（连同只覆盖它的测试）                                                                                                                                                                                                  | `shared/mcpServerConfig.ts`（150→87 行）、`shared/mcpServerConfig.test.ts`                                           | `sanitizeMcpTimeout` 等生产在用函数保留；相关测试通过                                |
| 3   | 删除 `mcpClient` 两个不可达方法（`listResources`/`listResourceTemplates`，逻辑已含于 `listResourcesAndTemplates`）及其接口成员；`mcpRoutes` 的类型改由统一方法推导                                                                                      | `server/src/mcp/mcpClient.ts`、`mcpTypes.ts`、`mcpRoutes.ts`                                                         | `mcpClient.test.ts` / `mcpRoutes.test.ts` 全过                                       |
| 3   | 删除 `void options.enablePrivateHttp;` 空操作与失实注释                                                                                                                                                                                                 | `server/src/mcp/mcpRoutes.ts`                                                                                        | lint（无未使用形参）                                                                 |
| 3   | 删除两个冗余 re-export（`createServer` 的 `readMacOsClipboardPng`、`streamJobs` 的 `abortJob`/`readJobSecret`），改为从真实来源导入                                                                                                                     | `server/src/createServer.ts`、`createServer.test.ts`、`stream-jobs/streamJobs.ts`                                    | `createServer.test.ts` 通过                                                          |
| 3   | 删除死导出 `THIRD_PARTY_PROVIDER_LOGO`（250+ 项映射，唯一消费者是测试）及随之无用的导入                                                                                                                                                                 | `src/components/shared/ModelIcon.tsx`、`ModelIcon.test.tsx`                                                          | 测试通过；`custom.png` 仍由 registry 引用                                            |
| 17  | 删除 `public/assets/.DS_Store`（会被拷进产物）                                                                                                                                                                                                          | —                                                                                                                    | 构建产物不再含该文件                                                                 |
| 13  | 删除 `eslint.config.js` 两个空操作规则块（生效值已由全局块提供，`--print-config` 实测为 `[0]`）                                                                                                                                                         | `eslint.config.js`                                                                                                   | lint 全绿；守卫测试 `codeStyleBoundaries` 通过                                       |
| 11  | `deploy-docs.yml` 改用 `node-version-file: .nvmrc`（原 `22` 与 `engines: ">=24 <27"` + `engine-strict` 冲突），并去掉重复声明的 `CLOUDFLARE_API_TOKEN`                                                                                                  | `.github/workflows/deploy-docs.yml`                                                                                  | 与其余 4 个工作流一致                                                                |
| 12  | 把 `i18n:check` 加入 CI 的 lint-and-typecheck job（此前无人执行）                                                                                                                                                                                       | `.github/workflows/ci.yml`                                                                                           | —                                                                                    |

**实测收益（`vite build` 产物对比）**

| 指标                                          | 改动前                 | 改动后                 | 变化              |
| --------------------------------------------- | ---------------------- | ---------------------- | ----------------- |
| 启动关键路径 JS（`script` + `modulepreload`） | 12 文件 / **3896 KB**  | 10 文件 / **2321 KB**  | **−1575 KB**      |
| `model-icons` chunk                           | 486 KB                 | **258 KB**             | −228 KB           |
| Service Worker 预缓存                         | 289 项 / **16363 KiB** | 237 项 / **12795 KiB** | **−3568 KiB**     |
| 产出的 SVG 文件                               | 166 个 / 5438 KB       | 117 个 / 3446 KB       | −56 个 / −1992 KB |
| echarts 是否在启动路径                        | 是（预加载）           | **否**（导出时按需）   | —                 |

**因改动而同步更新的测试**（这两处是"测试在钉住冗余/旧契约"，属必须一并修正）：

- `src/components/shared/modelIconRegistry.test.ts`：原断言 `CHERRY_MODEL_LOGOS > 150` 个键——等于把冗余本身写成不变式。改为"图标集非空 + 所有 URL 有效 + 不可达副本确实不存在（`zai` 无、`glm` 有；模型目录无 `openai`、服务商目录有）"。
- 原 `chartRendererSync.test.ts` → 重命名为 `chartRendererHydration.test.ts` 并全部 `await`（同步契约已不存在），新增"无图表时不得加载 echarts"守卫。

**尚未实施（剩余项，按第七节顺序）**：4（4 个无客户端路由别名）、6（统一 `probeMediaDuration` / `isEditableElement` / `parseOffsetSeconds`）、7–8、9（dev 插件委托服务端 handler）、10、15–16、18、19（Modal 外壳统一）、20、21。其中第 6 项与第 9 项涉及**行为契约选择**（例如两份 `parseOffsetSeconds` 对"是否强制 `s` 后缀""失败返回 `null` 还是 `0`"的判断相反），建议先确认期望语义再动。

---

## 一、总体结论

**机械层面的冗余已经被清理得很干净，剩余冗余集中在"语义重复"和"跨层契约重复"。**

这类冗余 `knip`、`jscpd` 这类工具**看不见**，因为它们不是"未被引用的导出"，也不是"文本级复制粘贴"：

| 检查项                                                                                        | 结果                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 未被引用的文件 / 导出 / 依赖（knip）                                                          | **0 问题**（且 `ignoreIssues` 已被清空，说明是真实通过而非压制） |
| 文本级重复（jscpd, ≥12 行/70 token）                                                          | 2.89%，其中 **仅 49/368 对属于生产代码**，最大跨模块重复 76 行   |
| 字节级完全相同的文件                                                                          | 代码/配置类 **0 个**；资产类 **7 对**（见 L4，多数为有意保留）   |
| 孤儿模块（无任何导入者）                                                                      | 0 个（7 个"无导入者"文件经核实均为入口/Worker/`.d.ts`，合理）    |
| 仅被测试引用的模块                                                                            | **0 个**                                                         |
| 文件名冗余标记（legacy/old/backup/v2/unused）                                                 | 0 个                                                             |
| `@deprecated` 标记                                                                            | 全库仅 **1 处**，且为有意保留                                    |
| `if (false)` / 恒值特性开关 / 未使用开关                                                      | 0 个（服务端所有 flag 均被消费）                                 |
| CSS 重复选择器                                                                                | 1 处                                                             |
| i18n 键覆盖                                                                                   | 2122/2122 完整（但**覆盖完整 ≠ 无死键**，见下）                  |
| i18n 死键 / 仅测试在用键                                                                      | **93 个**（84 死 + 9 仅测试），见 P2-12                          |
| i18n 七语言完全相同的重复译文                                                                 | 94 组 / 136 条，见 P2-13                                         |
| i18n 跨文件重复键（静默遮蔽）                                                                 | 1 处，见 P2-14                                                   |
| 组件/feature 层语义重复                                                                       | **10 项**（F1–F10，另有一批低优先级），见 P1-5 与 P2-15          |
| 跨文件**逐字节相同**的函数体（`src`/`server`/`shared`/`vite` 中 ≥10 行的导出函数，共 921 个） | **仅 1 对**，见 P3-16                                            |

**结论：不存在成片的死代码，但存在大量"同一件事写了两遍"的实质冗余 —— 其中 5 项影响交付体积或落在启动关键路径上（P1），15 项属同名同义的双份实现或死副本（P2），另有 13 项跨层常量/样式重复与 11 项 CI/配置/测试层面的重复。多项已产生可观测的行为漂移，而非仅仅是"可以更 DRY"。**

> 一句话回答"有没有冗余的代码"：**有，但不是"死代码成堆"，而是"重复实现成堆"**。机械可检测的冗余（未使用导出、文本复制、孤儿文件）已基本清零；残余冗余需要跨文件语义比对才能发现，其中最值得先修的是 P1-1（1.94 MiB 死图标被强制预缓存）、P1-3（1.1 MB echarts 挂在启动路径）、P1-2（服务端与 dev 插件两套端点已漂移）与 P1-5（三套 Modal 外壳 + 手写焦点陷阱）。

---

## 二、P1 — 高优先级（影响体积 / 已产生漂移）

### P1-1 `model-icons`：486 KB 预加载 + **157 个不可达 SVG（2.11 MiB），其中 1.94 MiB 被 Service Worker 强制预缓存**

**证据链**

1. `src/components/shared/modelIconRegistry.ts:9-27` 用 **4 个 `import.meta.glob(..., { eager: true })`** 把 4 个目录的 **全部 408 个 SVG** 静态打进 bundle。
2. 构建产物 `dist/assets/model-icons-*.js` = **485.97 KB（gzip 150.76 KB）**，其中 245 个小图标以 data-URI 内联（**430 KB = 该 chunk 的 91%**），166 个以独立文件产出（**5.4 MB**）。
3. 该 chunk **被预加载**：`dist/index.html` 中存在 `<link rel="modulepreload" href="/assets/model-icons-*.js">`，而 `vite/chunks.ts:50-61` 的 `HEAVY_PRELOAD_PATTERNS` **不包含**它 —— 即 486 KB 落在每次页面加载的关键路径上。值得注意的是 `vite/chunks.ts:87-93` 专门把 model-icons 切成独立 chunk，说明"独立出来"是有意的，只是漏了配套的预加载排除。
4. **可达性判定规则**（已通读 `modelIconRegistry.ts:1-499` 与 `ModelIcon.tsx:1-200` 后确定，仅 `resolveIconRef()` 一个运行时入口，调用点为 `ModelIcon.tsx:100,175`、`ProviderAvatar.tsx:76`）：
   - L1：`MODEL_ICON_PATTERNS` 的 catalogKey → `CHERRY_MODEL_LOGOS[k] || CHERRY_PROVIDER_LOGOS[k]`（**模型目录优先**）
   - L2：`MODEL_TO_PROVIDER_PATTERNS` 的 catalogKey → `CHERRY_PROVIDER_LOGOS[k] || CHERRY_MODEL_LOGOS[k]`（**服务商目录优先**）
   - L3：`rawKey = templateId || providerId` → 经 `PROVIDER_ID_ALIASES` 后 `PROVIDER_LOGOS[alias] || MODEL_LOGOS[alias] || PROVIDER_LOGOS[rawKey]`
   - 失败兜底返回 `custom`，**不会**让任何表外文件变可达
   - **关键点**：L2/L3 都先查服务商目录，因此当同名文件在两个目录都存在时，**模型目录的那份是死的**（遮蔽/ shadowing）。这一点比"文件名是否出现在任何表里"更严格。
5. 按此规则逐个判定：**157 个 SVG 不可达 = 2.11 MiB** —— `cherry-models` 49、`providers/cherry` 74、`cherry-models-dark` 14、`providers/cherry-dark` 20。
   - 其中 **49 个（≥4 KiB）= 1,938,824 B (1.94 MiB)** 被产出为 `dist/assets/*.svg`，且**已确认出现在 `dist/sw.js` 的预缓存清单中**（实测 `dangbei-DhWd5xUu.svg`、`dmxapi-*.svg`、`dola-*.svg`、`mcpso-*.svg` 均命中）—— 即**每个用户都会被下载这 1.94 MiB 死图标**（`vite.config.ts:42` 的 `globPatterns` 覆盖 `svg`，`globIgnores:43-62` 未排除图标）。
   - 其余 **108 个（<4 KiB）= 169.9 KiB** 因 Vite 默认 4 KiB `assetsInlineLimit` 被内联为 base64，约占 chunk 中 ~233 KiB JS。
6. 遮蔽子集（同一 basename 在 `cherry-models` 与 `providers/cherry` 都存在，且模型侧永远轮不到）：实测两目录**共有 44 个同名 basename**，其中 16 个的模型副本为死文件（`openai`、`google`、`anthropic`、`moonshot`、`aihubmix`、`jimeng` 等，合计 73.3 KiB）。已核实 `'openai'` 只出现在 `MODEL_TO_PROVIDER_PATTERNS`（`:200`）与别名（`:324`），从不出现在 `MODEL_ICON_PATTERNS`。
7. 抽样反证：`skywork`、`ace`、`phind`、`openchat`、`udio`、`rwkv`、`tii`、`menlo` 在全库代码中 **0 处引用**；而被 `[/jamba|j2-/i, 'ai21']` 覆盖的 `ai21` 被正确判为可达（说明判定逻辑有效）。
8. 单个最大死图标：`cherry-models/gpt-5-chat-latest.svg`（**37,603 B**）被可达的 `gpt-5-chat.svg`（规则 `:82`）取代。

**置信度**: `cherry-models` 类（需表项却不存在）为**确定**；`providers/cherry` 类为**高可能** —— 理论上只有"持久化数据里存在非枚举 providerId 字符串"才可能命中，而模板 ID 受类型约束、连接 ID 为 UUID，故仅陈旧 localStorage 可能触发。

**建议**

1. 删除 157 个不可达 SVG（保守做法：先只删 49 个 ≥4 KiB 的，即可立刻停止 1.94 MiB 死预缓存；要保留作品牌参考可移到 `docs/model-logos/`）。
2. 补一条守卫测试：断言每个被 glob 的 basename 必然是某个表的 key、别名值或模板/legacy ID。
3. 把 `/^assets\/model-icons-.*\.js$/` 加入 `HEAVY_PRELOAD_PATTERNS`，将 486 KB 移出关键路径。
4. 删除 `ModelIcon.tsx:38-56` 的 `THIRD_PARTY_PROVIDER_LOGO` —— 它 spread 出 250+ 项映射，但**唯一引用者是 `ModelIcon.test.tsx:4,120`**（同样因"测试算入口"而骗过 knip），无任何运行时消费。

---

### P1-2 服务端与 Vite 开发插件重复实现同一组端点，且已经漂移

| 端点       | 生产实现                                       | dev 插件实现                     |
| ---------- | ---------------------------------------------- | -------------------------------- |
| 图片代理   | `server/src/proxy/imageProxy.ts:11-127`        | `vite/localApiPlugin.ts:111-176` |
| 剪贴板图片 | `server/src/clipboardImage.ts:10-42`           | `vite/localApiPlugin.ts:178-199` |
| 临时令牌   | `server/src/security/ephemeralToken.ts:45-128` | `vite/localApiPlugin.ts:228-277` |

**重复证据**: 检查顺序一致、错误字符串字面量一致（`'Image proxy target did not return an image.'`、`'No local clipboard image is available.'` 等）、同一常量两处定义 —— 已核实 `MAX_IMAGE_PROXY_BYTES = 25 * 1024 * 1024` 同时存在于 `imageProxy.ts:8` 与 `localApiPlugin.ts:12`。

**漂移证据（真正的代价）**

- 生产实现有 `AbortController` + 超时，超时映射 **504**；dev 副本无超时、永远只能返回 502。
- 剪贴板文件名的 `encodeURIComponent` 仅生产端有（`clipboardImage.ts:33`），dev 端裸传，而浏览器端会 decode（`src/hooks/chat-input/useChatInputClipboard.ts:76`）。
- dev 令牌路由硬编码 `generativelanguage.googleapis.com`，忽略 `serverKeyPriority`/`liveGeminiApiKey`，丢失默认 `uses`/`expireTime` 与 `bidiGenerateContentSetup` 归一化，并原样转发上游错误体。

**置信度**: 确定（两处路径均可达）。

**建议**: 复用已有先例 `shared/imageProxyFetch.ts`（已把 SSRF/重定向核心单一化），把 fetch 后的校验与响应头逻辑下沉到 `shared/`；或让 dev 中间件通过 `writeHead` 适配器直接委托服务端 handler。

---

### P1-3 echarts 被打包两次，且其中 1.1 MB 被静态提升到启动路径

**事实（均已实测）**

1. `dist/vendor/echarts.min.js` = **1,121,883 B (1.07 MB)** —— 由 `vite/staticAssets.ts:5` 的 `ECHARTS_COPY_SOURCE` 拷贝，供**沙箱 iframe** 通过 `ECHARTS_SCRIPT_SRC = /vendor/echarts.min.js`（`src/utils/html-preview/echartsRendererScript.ts:258`）加载。这份是必需的。
2. `dist/assets/echarts-vendor-*.js` = **1,126.66 KB** —— 由 `src/utils/html-preview/chartRendererScript.ts:20` 的 `import * as echarts from 'echarts'` 打进 bundle。这份用于**父页面侧的 PNG 导出 SVG 水合**。
3. 该 chunk 被静态提升进入口：`dist/assets/index-*.js` 中存在裸静态导入 `import"./echarts-vendor-DKI42x5t.js"`，因此它出现在 `dist/index.html` 的 `modulepreload` 列表中。

**关键发现**：唯一使用该模块的 `hydrateChartsIntoDocument()`（`chartRendererScript.ts:557`，用到 `echarts.init(null, theme, { renderer: 'svg', ssr: true })` + `renderToSVGString()`）**只被两处调用**，且都位于**本来就是 `async` 的函数内**：

- `src/utils/html-preview/previewDocument.ts:681`，位于 `createStaticPreviewSnapshotContainer`（`:649`，导出 PNG 快照用）
- `src/utils/html-preview/previewDocument.ts:796`，位于 `buildStandaloneHtmlArtifact`（`:760`，导出用；其调用点 `useHtmlPreviewModal.ts:304` **本来就已是动态导入**）

而注入 iframe 的脚本字符串 `CHART_RENDERER_SCRIPT` 用的是 `window.echarts`（走 `/vendor/echarts.min.js`），**不需要**这个模块导入；`buildEchartsThemeFromCssVars`/`normalizeEchartsOption` 位于 `echartsRendererScript.ts`，同样不含 echarts 导入。
即：**1.1 MB 的 echarts 为了两条"用户主动导出"的路径，被静态挂在应用启动图上。**

**建议**: 把 `hydrateChartsIntoDocument` 拆到独立模块，在两处调用点改为 `await import(...)`（两处都已是 async，改动很小）；随后把 `/^assets\/echarts-vendor-.*\.js$/` 加入 `HEAVY_PRELOAD_PATTERNS`。预计启动路径减少约 **1.1 MB（raw）**。

### P1-4 关键路径整体偏重（附带测量）

本次构建 `dist/index.html` 的 `script` + `modulepreload` 共 **12 个 JS 文件、3896 KB（raw）**：

| 大小          | chunk                  | 是否在 `HEAVY_PRELOAD_PATTERNS` |
| ------------- | ---------------------- | ------------------------------- |
| 1416.9 KB     | `index`                | — （入口）                      |
| **1100.3 KB** | `echarts-vendor`       | **否（未排除）**                |
| **474.6 KB**  | `model-icons`          | **否（未排除）**                |
| 341.9 KB      | `ui-vendor`            | —                               |
| 168.7 KB      | `html-preview-runtime` | —                               |
| 139.1 KB      | `react-vendor`         | —                               |
| 其余 6 个合计 | ~255 KB                | —                               |

对照：`HEAVY_PRELOAD_PATTERNS`（`vite/chunks.ts:50-61`）已正确排除 graphviz(1320 KB)、CodeEditor(1028 KB)、xlsx(488 KB)、markdown/math/highlight/genai/pdfjs(291-387 KB)、html2canvas —— 却**漏掉全应用第二大的 `echarts-vendor` 与 `model-icons`**。该文件的存在意图正是"把重 chunk 挡在预加载之外"，因此这两项更像是遗漏而非有意设计（`vite/chunks.ts:87-93` 还专门把 model-icons 单独切了 chunk）。

### P1-5 三套并行的 Modal 外壳，且 `Modal` 手写重实现了已存在的 `useFocusTrap`

**并行的三套外壳**

- 手写 portal 外壳：`src/components/shared/Modal.tsx:219-240`（portal + backdrop），焦点处理 `:50-87`，Escape/Tab 焦点陷阱 `:108-159`，`inert`/`aria-hidden` 兄弟节点清扫 `:161-206`，动画状态 `:38-48,89-106`
- Radix Dialog 外壳：`src/components/shared/Dialog.tsx:13-22`（overlay）、`:29-56`（content portal）
- Radix AlertDialog 外壳：`src/components/shared/AlertDialog.tsx:24-41` —— 与 Dialog 结构相同（同样的居中包裹、overlay 类、content 类，仅宽度不同）
- 另有第三个手写 portal 外壳：`src/components/modals/HtmlPreviewModal.tsx:99-225`（自带 `Z_INDEX_MODAL_BACKDROP` + 动画 + `role="dialog"`，无焦点陷阱）

**重复证据（本次实测）**：`Modal.tsx:5` **只**从 `@/hooks/ui/useFocusTrap` 引入了 `getFocusableElements` 这一个工具函数，然后在 `:68`、`:129` 自己重写了初始聚焦与 Tab 循环 —— 而 `useFocusTrap` 这个完整 hook（`src/hooks/ui/useFocusTrap.ts:36-118`，含初始聚焦、Tab 循环、焦点归还）**只被 `TableBlock.tsx:68` 一处使用**。
调用方两侧都活跃：`Modal` ← 19+ 个文件（`SettingsModal.tsx:4`、`FilePreviewModal.tsx:6`、`LogViewer.tsx:6`、`LibraryPickerModal.tsx:3` 等）；`Dialog` ← `Command.tsx:5`、`McpTrustDialog.tsx:3`；`AlertDialog` ← `ConfirmationModal.tsx:7`、`McpToolApprovalDialog.tsx:8`、`McpShareInstallGate.tsx:8`、`AssistantApiKeyDialog.tsx:8`。

**已发生的漂移**

1. Escape 语义冲突：`Modal` 接受 `role='alertdialog'`（`:19,228`）却无条件响应 Escape 关闭（`:120-123`），而 Radix alert-dialog 有意不响应 —— 传入该 prop 就得到一个"会被 Esc 关掉的 alert dialog"。
2. `inert` 纪律不对称：只有 `Modal` 会清扫 `document.body` 其他子节点并置 `inert`+`aria-hidden`（`:171-194`），而 Radix portal 从不带其豁免标记 `data-modal-backdrop="true"`；叠加打开时（如先开 Cmd+K 面板再开 `Modal` 弹窗）可能把面板容器置为 inert。
3. 外壳默认值漂移：`DialogContent` `max-w-lg`/`p-6`/默认带关闭按钮 vs `AlertDialogContent` `max-w-md`/无关闭按钮；`space-y-1.5` vs `space-y-2`；footer 则完全一致。
4. `ConfirmationModal.tsx:81-98` 重新手写 `AlertDialogCancel`/`AlertDialogAction` 的样式 —— 其 cancel 类名与 `AlertDialog.tsx:98` **逐字符相同**。

**置信度**: 重复确定；跨系统交互风险高可能（未做浏览器实测，但每条都附有可执行的证伪步骤）。
**建议**: 让 `Modal` 成为 Radix Dialog 的薄包装（或抽出 `ModalShell` + `useModalA11y`），直接复用 `useFocusTrap`，并把 AlertDialog 的类名差异参数化到同一外壳。

---

## 三、P2 — 中优先级（同名同义的两份实现 / 死副本）

### P2-1 `probeMediaDuration` 存在两份活的实现

- `src/utils/file/mediaDuration.ts`（49 行，签名 `(blob, mimeType)`，**硬编码 1500 ms** 超时）
- `src/utils/media/mediaDuration.ts`（67 行，签名 `(type, file, timeoutMs = 3000)`，有 `settled` 守卫与 `URL.createObjectURL`/`Audio` 能力检测）

两者都是"探测音频/视频 Blob 时长"，且**都有各自独立的测试**（`mediaDuration.test.ts` × 2）。
真实调用方均存在：`src/services/embedding/multimodalSearchEngine.ts:18` 用前者；`src/features/audio/audioDuration.ts:1`、`src/utils/pricing/tokenEstimation.ts:4` 用后者。
**风险**: 同一段媒体在两条路径上可能得到不同结果（1.5 s vs 3 s 超时）。
**置信度**: 确定。**建议**: 保留更健壮的 `utils/media` 版本，把超时参数化后统一。

### P2-2 `isEditableElement` 存在两份活的实现（行为不同）

- `src/hooks/text-selection/selectionDomUtils.ts:12-26`：跨文档构造器安全、额外校验 `contentEditable === 'true'` 与 `getAttribute('contenteditable')`、接受 `null`
- `src/utils/chat-input/focus.ts:22-26`：额外把 **`SELECT`** 视为可编辑

调用方分别 2 处与 5 处，均在活跃代码中（`useSelectionCopyHandler.ts:3`、`SelectionAskPanel.tsx:7` / `useGlobalShortcuts.ts:9`、`FilePreviewModal.tsx:31` 等）。
另有第三份内联在 `src/utils/html-preview/previewBridgeScript.ts:201`，但那是注入 iframe 的脚本文本，**无法 import，属合理**。
**置信度**: 确定。**建议**: 以 `selectionDomUtils` 版本为基准统一，`SELECT` 语义用参数区分。

### P2-3 `parseOffsetSeconds` 两份实现语法不一致（潜在缺陷）

- `src/utils/pricing/tokenEstimation.ts:27-31`：正则 `^(\d+(?:\.\d+)?)s$` —— **必须带 `s`**，失败返回 `null`
- `src/utils/video-subtitles/subtitleFormatter.ts:26-31`：正则 `^([0-9]+(?:\.[0-9]+)?)s?$` —— **`s` 可选**，失败返回 `0`

两者都在解析视频元数据的 `start_offset`/`end_offset`（`tokenEstimation.ts:67-68` 读 `file.videoMetadata`；`subtitleFormatter.ts:80-127` 读 `word.start_offset`）。同一份偏移量若不带 `s`，一边解析成功、另一边静默得到 `null`/`0`。
**置信度**: 确定（重复与语义分歧均已读码确认）。**建议**: 统一为共享函数，明确"是否强制 `s`"与失败语义。

### P2-4 `shared/mcpServerConfig.ts` 的 `sanitizeMcpServers` 是死副本

已核实：全库仅 `shared/mcpServerConfig.test.ts:2` 引用它，**无任何生产调用方**；前端实际使用的是 `src/schemas/appSettingsSchema.ts:139-202`（同逻辑的私有副本，接在 `:371`），服务端另有更严格的 `mcpRoutes.ts:130-245 parseMcpServer`。
之所以 `knip` 报干净：**测试文件本身被 knip 当作入口**，于是"只有测试在用"的代码逃过检测。
**置信度**: 确定（已 grep 全仓 + 逐个确认；`sanitizeMcpTimeout` 仍被 `mcpClient.ts:11` 使用，不在死代码之列）。**建议**: 删除共享副本，或把前端副本上移到 `shared/` 单一实现。

### P2-5 `mcpClient` 的两个方法不可达，且与第三个方法重复分页逻辑

`server/src/mcp/mcpClient.ts:515-536 listResources` 与 `:538-559 listResourceTemplates` 各自 ~45 行分页逻辑，与 `:561-602 listResourcesAndTemplates` **完全重复**（也互相重复）。
已核实调用面：`mcpRoutes.ts:517-521` 只调用 `listResourcesAndTemplates`；`mcpRoutes.ts:507-508` 仅把它们当**类型**引用；测试文件只是 mock。二者是接口可选成员（`mcpTypes.ts:61-66`），故 knip 无法上报。
**置信度**: 确定。**建议**: 删除两个实现，保留 `listResourcesAndTemplates`。

### P2-6 四个没有任何客户端调用的路由别名

| 别名                            | 位置                                 | 实际调用者                                                                                                                     |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/v1/auth/verify`           | `server/src/createServer.ts:170`     | **全仓仅此一处**（已 grep 全类型文件）；前端只用 `/api/auth/verify`                                                            |
| `/api/auth_tokens`              | `ephemeralToken.ts:5-6`              | 前端只用 `/api/live/ephemeral-token`；旧路径只存活于 dev 插件自己的副本                                                        |
| `/api/stream-abort`（"统一"版） | `stream-jobs/streamJobsRoutes.ts:10` | **仅服务端测试**引用；浏览器实际 POST 的是 legacy `/api/gemini/stream-abort`（`src/features/stream-jobs/streamAbortUrl.ts:4`） |
| `/api/health`                   | `createServer.ts:147`                | 仅 `createServer.test.ts`；docker-compose 健康检查用的是 `/health`（保留）                                                     |

`createServer.ts:254/262` 是把同一个 handler 注册了两次。
**置信度**: 确定"仓内无客户端"；"线上不可达"为高可能。**建议**: 每个端点保留一条规范路径；若需兼容旧版，改为带日期的显式弃用而非长期未测分支。

### P2-7 服务端三份"API key 优先级"规则

`proxy/proxyHeaders.ts:100-120`、`proxy/thirdPartyProxy.ts:75-92,120-131`、`proxy/liveWsProxy.ts:53-95` 三处都在实现同一规则（空 `SERVER_MANAGED_API_KEY` → `serverKeyPriority && serverKey` → 浏览器 key → 服务端 key → 失败），仅取 key 的 header/参数名不同，且各自注释都写明"与另一处保持一致"。
**置信度**: 确定。**建议**: 抽出 `resolveApiKeyPrecedence({ browserKey, serverKey, serverKeyPriority })`。

### P2-8 两套 SSRF「解析到公网」+ 重定向校验

`server/src/mcp/mcpHttpSecurity.ts:13-62,67-116`（重定向上限 5、301/302/303 改写为 GET）与 `shared/imageProxyDns.ts:24-63` + `shared/imageProxyFetch.ts:39-96`（上限 3、3xx 上抛）结构相同：剥 IPv6 括号 → 拒绝私有字面量 → IP 跳过 DNS → `dns.lookup` → 空结果报错 → 逐地址判私有网段。
漂移旁证：`imageProxyDns.ts:16-23` 的注释引用了**过时路径** `server/src/mcpHttpSecurity.ts`（实际为 `server/src/mcp/mcpHttpSecurity.ts`），说明两份是各自独立改的。
**置信度**: 确定。**建议**: 单一 `assertHostResolvesPublic()`，重定向循环保留为策略薄包装。

### P2-9 `LibraryToolbar` 与 `LibraryPickerToolbar` 重复 92 行且已漂移

`src/components/library/LibraryToolbar.tsx:217-292` ↔ `src/components/modals/library-picker/LibraryPickerToolbar.tsx:182-262`：筛选菜单与排序菜单的 JSX、排序项数组（`date_desc/date_asc/size_desc/size_asc/name_asc/name_desc`）完全一致，但类名已漂移（`text-xs` vs `text-[11px]`、有无 `type="button"`、有无 `cursor-pointer`）。
两者分别被 `LibraryView.tsx` 与 `LibraryPickerModal.tsx` 使用（均为活跃功能），因此这是**可抽取的共享组件**而非死代码：建议抽出 `<LibraryFilterMenu>`。
同源问题：`useLibraryViewLogic.ts:70-161` ↔ `useLibraryPickerFiles.ts:70-207`（合计 ~59 行重复）。

### P2-10 同名不同义的类型/函数（命名碰撞，易误用）

- `ModelCapabilities`：`src/types/settings.ts:7`（vision/thinking/tools 等 8 个特性位）vs `src/utils/model/modelCapabilities.ts:274`（Gemini 专属布尔集）。约 15 处从后者导入，2 处从前者的 barerl 导入。
- `normalizeModelId`：`src/utils/model/modelId.ts:5`（仅小写 + 去 `models/` 前缀）vs `src/utils/model/knownModelsCatalog.ts:26`（去 provider 前缀、Bedrock 前缀、`:free/:nitro` 后缀、版本号等完整归一化）。同名但语义深度不同，5+ 处使用前者。
- `extractSnippet`：`chatMemorySearch.ts:19`（未命中返回 `''`）vs `librarySearch.ts:52`（未命中返回**前 `radius*2` 个字符**），行为不同。

**建议**: 至少改名（如 `ModelRuntimeCapabilities` / `normalizeFullModelId`）以消除歧义；能合并则合并。

### P2-11 同一段"上下文文件收集"算法重复

`src/features/local-js/executionFiles.ts:7-31` 与 `src/features/local-python/executionFiles.ts:4-26` 共享同一套遍历（targetIndex → 截断 → 仅 user → 跳过 `generated-`/`edited-` → 校验 `uploadState`/`error`），仅产出类型不同（文本 map vs `UploadedFile` 列表），且 `targetMessageId` 一处可选、一处必填。
**置信度**: 确定。**建议**: 抽出 `collectActiveContextFiles(messages, targetMessageId, predicate)`。

### P2-12 93 个 i18n 键是死键或仅测试在用（≈30.6 KiB 源码 / ~651 条译文）

**方法**：解析全部 2122 个键（与 `scripts/check-i18n-coverage.mjs` 的 2122/2122 完全吻合），"被引用" = 在 `src/ e2e/ scripts/ shared/ server/` 中除定义文件外出现该键字面量；已排除仅有的几处动态拼接前缀（`virtualMcpLocalization.ts:10,27`、`ConsoleTab.tsx:41,42`、`ToolResultBlock.tsx:132`）。

**84 个完全无引用的死键**（本次实测抽查全部为 0 引用）：

- `src/i18n/translations/settings/api.ts` **占 64 个 / 23.4 KiB**：`thirdParty*` 向导/遗留块（`:706,733,742,760,769,778,1114,…,2176 thirdPartyWizardTitle,2185,2194,…,2554 thirdPartyDetect,2635-2752`）；以及**已被取代**的无前缀 `serverAccessPassword*`（`:2581-2626`）—— 实际组件用的是 `settingsServerAccessPassword*`（定义 `api.ts:83,92,101,110,119`，使用 `ServerAccessPasswordInput.tsx:38,56,72,108,124`、`settingsSearchCatalog.ts:344-345`）
- `settings/model.ts:6,15,24,33,42`（`modelsSubNav*`，已被 `settingsTab*` 取代）
- `settings/general.ts:85,94,103`（`settingsScope*`）+ `:350`；`settings/safety.ts:38`；`common.ts:1205,1403,1412,1421`；`library.ts:472,508,526,535`；`messages.ts:1633`；`history.ts:448`

**9 个仅测试存活的键**（被断言引用、但从不渲染）：`appDefaultModelsLoadError`、`historyCopySuffix`、`settingsFinishModelListEdit`、`settingsLanguageJa/Ko/Es/Fr/De`、`settingsOpenAICompatibleRequestUrlPreview`。
其中 `settingsLanguage*` 可证明为死：语言下拉渲染的是硬编码 `LANGUAGE_META[id].nativeLabel`（`ThemeLanguageSelector.tsx:80-83`、`languageRegistry.ts:7-15`），且**连 `settingsLanguageEn/Zh` 都不存在** —— 是一个被 `transcribeLang*`/`translationTargetLanguage*` 重复了 3 遍的半套键。

**取代证据**：`grep -rn Wizard src` 只命中 i18n 文件（向导 UI 已被 `ProviderCreateDrawer.tsx` 取代）；`grep -rn "SubNav" src` 只命中 i18n 文件；字幕抽屉只用 `downloadSrt`/`downloadVtt`，条数直接渲染 `{cues.length}`（`VideoSubtitlesDrawer.tsx:155`），故 `videoSubtitlesCount` 从未接线。
**建议**: 删除 84+9 个键，并把"未使用键"检查加入 `check-i18n-coverage.mjs`（目前它只校验语言/占位符齐全性）。

### P2-13 94 组 / 136 条译文七语言逐字节相同（≈25.5 KiB）

按 7 语言完整取值元组比对，有 94 组完全一致（若只比 `en` 则 137 组）。典型：6× `Copied`、6× `All`、6× `Error`、5× `Audio`、4× 各 `Copy`/`Name`/`Default`/`Tools`/`Preview`，以及 3× 各语言名、3× `Select all`/`Deselect all`/`Built-in`/`Edit File` 等。
而 `common.ts` **已有**通用键可直接复用：`copy:105`、`cancel:3`、`close:58`、`clear:8`、`search:136`、`enabled:29`、`disabled:30`、`preview:49`。
（P2-12 与 P2-13 并集 = 220 个键/条目、54.5 KiB。）
**建议**: 合并到 `common.*` 通用键；属翻译维护成本与体积问题，非功能缺陷。

### P2-14 跨文件重复键造成静默遮蔽 + 陈旧守卫

- `settingsMcpVirtualBadge` 在两处**值完全相同**：`src/i18n/coreTranslations.ts:128-136`（eager 壳层）与 `src/i18n/translations/settings/mcp.ts:806-814`（懒加载包）。合并顺序为 eager 先、`registerTranslations` → `Object.assign` 后（`coreTranslations.ts:152-154`、`featureTranslations.ts:61`），即**包总是覆盖壳层**；唯一消费者 `VirtualMcpServerCard.tsx:118` 位于设置弹窗内，而该弹窗会 `await ensureFeatureTranslations('settings')`（`AppModals.tsx:105`）—— 因此**壳层那份是冗余的**。
- 全库扫描确认：**跨文件重复键仅此 1 处**，不存在其他遮蔽。
- 陈旧守卫：`translationCoverage.test.ts:873` 仍把 `settingsTitle` 列入允许重复表，但它现在只存在于 `coreTranslations.ts:33`；`coreTranslations.ts:26-29` 的注释同样已过时。

### P2-15 `src/components/**` 与 `src/features/**` 层其余语义重复（逐条读码验证）

对 514 个非测试文件做了结构化近似重复扫描（token-shingle Jaccard + 跨文件滑窗块匹配）提名候选，再**逐个人工读码 + 全库 grep 调用方**核实。已剔除一大类假阳性：`Component.tsx` ↔ 其自身 `use*Logic.ts` 的"重复块"实为解构列表 vs `return {...}`（如 `McpSection.tsx:17-58` ↔ `useMcpSectionLogic.ts:356-398`），以及调用点 vs 函数签名（`standardChatApiCall.ts:216-254` ↔ `standardChatGemini.ts:91-128`）。

| 编号 | 严重度 | 内容                                                          | 关键位置                                                                                                                                                                                          | 漂移/风险                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3   | 中     | 4 套 `LibraryItem` 渲染器；picker 硬编码蓝色、且无键盘可选    | `library/LibraryGridView.tsx:174-200`、`LibraryListView.tsx:103-129`、`modals/library-picker/LibraryPickerGrid.tsx:25-91`、`LibraryPickerList.tsx:32-113`                                         | **已实测**：picker 选中态写死 `border-blue-500 ring-2 ring-blue-500/40 bg-blue-500/5`（`LibraryPickerGrid.tsx:37`）、`bg-blue-600 text-white`（`:47`），而 library 用 `focus-visible:ring-[var(--theme-accent)]`（`LibraryGridView.tsx:63`）→ picker 选中态不跟随主题；且 picker grid 的 `tabIndex/onKeyDown/role` 出现次数为 **0**，library grid 为 **6** → 键盘用户无法在 picker 中选中 |
| F4   | 中     | 已有共享组件 `VideoSegmentBar`，却被两处内联副本绕过          | 共享：`shared/file-preview/video/VideoSegmentBar.tsx:17-36`；副本：`media-nav/MediaNavView.tsx:267-298`、`YoutubeNavPlayer.tsx:158-189`                                                           | **已实测** test id 分叉：共享与 MediaNav 用 `media-segment-loop`/`media-segment-exit`，YouTube 用 `youtube-segment-loop`/`youtube-segment-exit`（`YoutubeNavPlayer.tsx:175,185`，其自身测试也绑定了新 id）→ 任何按共享 id 编写的自动化都会静默漏掉 YouTube 播放器；循环开关的接线方式也各不相同                                                                                           |
| F6   | 中     | `extractSnippet` 两份实现，默认值与语义均已漂移               | `features/library-search/librarySearch.ts:52-74`（radius 70、折叠换行、未命中返回前缀）vs `features/chat-memory/chatMemorySearch.ts:19-35`（radius 80、trim 守卫、未命中返回 `''`、保留原始换行） | 两者分别被 `libraryVirtualMcpServer.ts:136`、`chatMemoryVirtualMcpServer.ts:93` 包装并在 `index.tsx:9-10` 初始化；chat-memory 的片段可能把裸换行带进模型上下文/UI；end offset 一处用 `query.length`、一处用 `lowerQuery.length`                                                                                                                                                           |
| F2   | 中     | `SessionItemMenu` 与 `SessionItemContextMenu` 90% 相同        | `sidebar/SessionItemMenu.tsx:6-18,33-68` vs `SessionItemContextMenu.tsx:6-17,31-62`                                                                                                               | 同一父组件同时使用（`SessionItem.tsx:474` 与 `:518`）；前者传 `align="end" sideOffset={4}` 且 `stopPropagation`，后者都不传 → 同一菜单两个入口的对齐/事件传播行为不同                                                                                                                                                                                                                     |
| F5   | 中     | 面板拖拽 resize 实现了三遍，钳制策略与键盘步长都不同          | `sidebar/useSidebarResize.ts:95-113`、`layout/SidePanel.tsx:132-150`、`media-nav/MediaNavPanel.tsx:169-187`                                                                                       | 三段 `useEffect` 逐字节相同；键盘步长 **10px**（`useSidebarResize.ts:68,79`）vs **20px**（`SidePanel.tsx:283,294`、`MediaNavPanel.tsx:222,225`）；`SidePanel.tsx:271-276` 设了 `role="separator"`/`aria-valuenow`/`aria-valuemin` 但**漏了 `aria-valuemax`**（另两处都有）；三套钳制范围各异                                                                                              |
| F8   | 中     | `MultimodalSearchItem → LibraryItem` 映射复制 4 次            | `search/useMultimodalSearchLogic.ts:109-121`、`:198-210`、`search/MultimodalSearchResultCard.tsx:31-43`                                                                                           | 13 行逐字段相同的对象字面量；新增字段或改 `thumbnailUrl→dataUrl` 时，插入/下载/展示三条路径会静默不一致                                                                                                                                                                                                                                                                                   |
| F7   | 低-中  | 缩略图外壳（size→class 阶梯、object-fit 剥离）在 8 个文件重复 | `library/thumbnails/` 下 7 个 + `LibraryItemThumbnail.tsx:91-98`；另 `chat/input/files/PdfFileThumbnail.tsx:37`                                                                                   | 相同的 4 分支尺寸阶梯与逐字节相同的 `containerClassName` 正则；改 `lg` 档需改 8 处；已有轻微漂移（仅 `PdfThumbnail.tsx:38` 抽取了 `objectFitClass`）                                                                                                                                                                                                                                      |
| F9   | 低-中  | 音频倍速两套实现                                              | `features/audio/useAudioPlayback.ts:34,115-119` vs `shared/AudioPlayer.tsx:15,28-35`，均为 `[1,1.25,1.5,2]`                                                                                       | 改一处即让两个界面不同步；且 `AudioPlayer.tsx:38` 把下载名扩展名写死为 `.wav`，而录音实际产出 `m4a`/`ogg`/`webm`（`AudioRecorder.tsx:32-47`）→ 下载文件扩展名错误                                                                                                                                                                                                                         |
| F10  | 低     | 输入框菜单样板重复                                            | `AttachmentMenu.tsx:114,122-133` vs `ToolsMenu.tsx:206,214-225`                                                                                                                                   | trigger 类名与 `DropdownMenuContent` 块（含 `onCloseAutoFocus`/`isItemActionTriggeredRef` 焦点归还 workaround）完全一致；该 bug 的修复需要改两处                                                                                                                                                                                                                                          |

**更细的一批（已核实、低优先级）**：定位按钮的 box2d→百分比几何与激活类名重复（`InlineImageLocateButton.tsx:150-153,177-181` ↔ `InlinePdfLocateButton.tsx:113-116,135-139`，图标尺寸已漂移 10 vs 9）；高亮浮层锚点数学重复 3 处（`PdfHighlightOverlay.tsx:83-96` ↔ `VideoHighlightOverlay.tsx:130-143`，`ImageHighlightOverlay.tsx` 已漂移）；执行输入文件策略重复（`local-js/executionFiles.ts` ↔ `local-python/executionFiles.ts`，即 P2-11）；工具循环回调块重复 3 处（`standardChatGemini.ts:351-368`、`:446-463`、`standardChatThirdParty.ts:167-184`）；两个"给模型看的摘要"模块的密钥处理策略相反（`settings-mcp/mcpRedaction.ts:32-38` 打码 vs `settings-assistant/providerRedaction.ts:39-51` 返回**明文** apiKey，后者注释声明是有意为之 —— 属命名/策略一致性风险而非确定泄漏）；自动标题资格判定被推导两遍（`useSidebarAutoTitle.ts:113-122` 重新实现了 `autoTitleSession.ts:138-139,159-165` 已封装的"完成一轮交换"判定）。

---

## 四、P3 — 低优先级（跨层常量/契约重复、样式重复）

1. **13 个 API 路径字面量在客户端与服务端各写一遍**（已实测）。三处重复的：`/api/live/ephemeral-token`、`/api/local-clipboard-image`；两处重复的：`/api/auth_tokens`、`/api/gemini/stream-abort`、`/api/image-proxy`，以及 6 个 `/api/mcp/*`。
2. **MCP DTO 在 `server/src/mcp/mcpTypes.ts:5-51` 与 `src/services/api/mcpApi.ts:6-51,93-119` 逐字段重复，且已漂移**：服务端 `McpLogEntry.level` 是联合类型（含 `'stderr'`），客户端是 `string`。
3. **常量重复**：`MAX_IMAGE_PROXY_BYTES`（两处）；job header 名（服务端 `JOB_SECRET_HEADER` 私有，前端硬编码三个 header）；`JOB_TTL_MS = 10 * 60_000`（`server/src/stream-jobs/streamJobStore.ts:37`）与 `PENDING_JOB_TTL_MS = 10 * 60_000`（`src/features/stream-jobs/amcStreamJobs.ts:54`，注释写着"match server-side job TTL"）—— 两处独立维护，静默漂移风险。
4. **三个有界 body 读取器，三种失败语义**：`mcpRoutes.ts:91-120`（1 MiB→413/400）、`ephemeralToken.ts:16-43`（1 MiB→静默 `{}`）、`localApiPlugin.ts:55-73`（**无上限**）。`1 MiB` 字面量重复两处。
5. **鉴权与来源校验重复**：`createServer.ts:79-103 isAuthorized` ↔ `liveWsProxy.ts:294-318`；`server/src/cors.ts:3-23` ↔ `liveWsProxy.ts:257-263`（后者注释自认"mirrors the HTTP CORS layer"）。
6. **无效语句 + 误导注释**：`server/src/mcp/mcpRoutes.ts:638-648` 的 `void options.enablePrivateHttp;` 是空操作，注释却声称做了私有地址防护（该路由本身是活的）。
7. **冗余 re-export**：`createServer.ts:26` 仅为 `createServer.test.ts:3` 转出 `readMacOsClipboardPng`（`clipboardImage.ts:8` 已转出）；`streamJobs.ts:10` 转出 `abortJob`/`readJobSecret`，唯一非测试使用方是 `createServer.ts:21`；`streamJobs.ts:52-56` 重复解析 `streamJobStore.ts:391-395` 已解析过的 job-id header。
8. **CSS 重复选择器**：`src/styles/markdown.css:43` 与 `:291` 各自声明了一次 `.markdown-body pre`（可合并；两处均带 `!important`）。
9. **别名式再导出**：`src/types/settings.ts:207-208` 把 `APP_LANGUAGE_IDS`/`AppLanguage` 从 `src/i18n/languageRegistry.ts` 再导出，形成同一符号的两条导入路径（`@/types` 1 处 vs `@/i18n/languageRegistry` 7 处）。
10. **长 className 字面量跨文件重复**：1794 个长类名字面量中 130 个出现在多个文件（共 409 次）。典型：`text-[var(--theme-text-secondary)] shrink-0`（17 次/6 文件）、`p-1.5 rounded-lg text-[var(--theme-text-secondary)] hover:text-... hover:bg-...`（图标按钮样式，6 次/3 文件）、`h-1.5 w-1.5 -ml-0.5 rounded-full bg-[var(--bg-accent)] shadow-[...]`（4 次/2 文件）。项目已有 `src/constants/designTokens.ts` 这一归属地（如 `SETTINGS_KBD_KEY_CLASS`），可沿用。
11. **协议处理器间的重复**（`jscpd` 生产代码 top 项，属"结构相似但有意分离"，建议仅在改动时注意）：`openai-compatible` ↔ `openai-responses` ↔ `anthropic` 各 32-35 行；`SidePanel` ↔ `MediaNavPanel` 38 行；`LibraryGridView` ↔ `LibraryListView` 34 行；`PdfHighlightOverlay` ↔ `VideoHighlightOverlay` 22 行；`seekAudio` ↔ `seekVideo` 18 行；`useLiveAudio` ↔ `useLiveTranscription` 23 行。
12. **本地 macOS 垃圾文件被打进产物**：`public/assets/.DS_Store`（6,148 B，**未被 git 跟踪**）会被 Vite 原样拷贝，实测 `dist/assets/.DS_Store` 存在。该文件其实已被 `.gitignore` 覆盖，只是仍躺在 `public/` 里。建议删除，并确认 `.dockerignore` 也排除 `**/.DS_Store`。
13. **`src/assets/model-icons` 内 3 组 md5 完全相同的死副本**：`cherry-models/zai.svg == glm.svg`（312 B）、`cherry-models-dark/zai.svg == glm.svg`（312 B）、`cherry-models/hunyuan.svg == providers/cherry/hunyuan.svg`（2,022 B，此二者均可达，属纯副本）。
14. **两套 localStorage 访问方式并存，直接调用方绕过了防护**：仓库已有统一封装的 `src/stores/persistentStorage.ts`（`readPersistentStorageItem:25`、`writePersistentStorageItem:33`、`removePersistentStorageItem:48`），已被 **16 个模块**使用；但仍有 **9 个生产文件直接用 `localStorage.`**：`stores/mediaNavStore.ts`、`components/sidebar/useSidebarResize.ts`、`components/chat/width/chatWidthState.ts`、`components/chat/width/ChatWidthControls.tsx`、`components/layout/SidePanel.tsx`、`components/media-nav/MediaNavPanel.tsx`、`hooks/chat/history/useHistoryClearer.ts`、`hooks/chat/history/sessionInitialLoad.ts`、`services/db/appDataSize.ts`。
    该封装提供的正是直接调用所缺失的三件事：**① try/catch 容错**（受限或被禁用存储的环境下 `localStorage` 会抛异常，见 `:26-30,42-45,49-53`）；**② `getDefaultStorageArea()` 的存在性守卫**（`:17-23`）；**③ 经 `notifyPersistedStateUpdate` 的跨标签页同步广播**（`:56-62`）。因此这不只是风格问题：这些面板宽度/滚动位置类偏好在受限浏览器环境可能静默失效，且不参与跨标签同步。
    另注：`src/utils` 与 `src/hooks` 层经专门排查**未发现**其他经典重复 —— 全库只有 1 个 `formatFileSize`，也没有重复的 `debounce`/`throttle`/`clamp`/`sleep`/`deepClone` 等；该层仅剩 P2-1、P2-2 两处已列出的重复。
15. **同一套"有界 LRU 缓存"被实现 4 遍**（我的独立结构比对得出的该层唯一新增项）：
    - `src/utils/library/thumbnailCaches.ts:7-23`（snippet，上限 256）
    - `src/utils/library/thumbnailCaches.ts:29-49`（thumbnail blob URL，上限 64，唯一带 `onEvict` → `cleanupFilePreviewUrl`）
    - `src/utils/library/thumbnailCaches.ts:55-71`（spreadsheet，上限 128）
    - `src/utils/media/audioWaveform.ts:5-21`（waveform peaks，上限 50）
      四者的 `read`（`get` → `delete` → 重新 `set` 以更新 LRU 次序）与 `write`（`delete` → `set` → `while size > LIMIT` 淘汰最旧）**逐语句相同**，仅值类型、上限常量与那一个可选淘汰回调不同。抽成 `createLruCache<T>({ limit, onEvict })` 可把约 60 行收敛到约 20 行，并让淘汰策略（尤其是 blob URL 必须释放这一条）只存在一处。
    > 同层另有若干"同名近似"候选经核实**不是**冗余，已排除：`containsTexMathMarkdown` vs `hasLikelyTexMathMarkdown`（`markdownMathConfig.ts:30,44`，后者有意更严格并排除代码段，注释已说明）、`normalizeAspectRatioForModel` vs `normalizeImageSizeForModel`、`buildPdfLocateDirective` vs `buildVideoLocateDirective`、`getQuickSwitchModelIds` vs `getTabCycleModelIds`、以及 `utils/third-party/presets.ts` 的 `THIRD_PARTY_PROVIDER_LABELS`/`THIRD_PARTY_TEMPLATE_LABELS`（全库仅定义一次，`ModelIcon.tsx` 只是引用）。
    > 说明：我曾用"标识符归一化后哈希"的方式对 `src/utils`+`src/hooks` 的 450 个 ≥7 行的导出函数做结构比对，该方法对 hook 产生了大量假阳性（所有"解构入参→返回回调"的 hook 归一化后同形），因此**未**据此下结论；上表与本节列出的均为人工读码确认的结果。
16. **全库唯一的"逐字节相同函数体"：一个纯透传的 prop 转发层**（用"仅归一化空白、保留全部标识符与字面量"的严格比对，扫描 `src`/`server`/`shared`/`vite` 中 **921** 个 ≥10 行导出函数，只命中这 1 对）：
    - `src/hooks/core/useAppEvents.ts:6-19` 的 `AppEventsProps` 接口与 `src/hooks/core/useGlobalShortcuts.ts:10-23` 的 `UseGlobalShortcutsProps` **逐字段相同**（12 个字段）
    - `useAppEvents` 的解构形参表（`useAppEvents.ts:25-38`）与 `useGlobalShortcuts` 的完全相同
    - 函数体（`useAppEvents.ts:39-56`）实际只做两件事：调 `usePwaLifecycle`，再把**这 12 个 prop 原样转发**给 `useGlobalShortcuts`（`:41-54`），然后 `return pwa`
      即它是"为了顺带调用 `usePwaLifecycle`"而完整复制了一遍快捷键 hook 的 prop 面。**风险**：给 `useGlobalShortcuts` 增删一个 prop 时，`AppEventsProps` 与转发块必须同步手改，否则静默丢参。
      **建议**：调用方直接组合 `usePwaLifecycle()` + `useGlobalShortcuts(props)`（或用 `Omit`/展开复用同一接口类型），删掉重复的接口与转发块。
      这个"921 个函数里只有 1 对真·复制粘贴"的结果，本身就是本仓库**几乎没有文本级重复**的最强证据。

---

## 五、CI / 配置 / 测试层面的冗余

### 5-1 【高】`deploy-docs` 工作流的 Node 版本与 `engines` 冲突，安装应直接失败

- `.github/workflows/deploy-docs.yml:32` → `node-version: 22`
- `package.json:6-8` → `"engines": { "node": ">=24 <27" }`；`.npmrc:2` → `engine-strict=true`；`.nvmrc` → `26`
- 其余工作流均用 `node-version-file: .nvmrc`（`ci.yml:21,42,55,91`、`docker-publish.yml:34`），仅此一处例外

在 `engine-strict=true` 下，`pnpm install --frozen-lockfile`（`:36`）会因 Node 版本不满足 engines 而报 `ERR_PNPM_UNSUPPORTED_ENGINE`。同文件 `CLOUDFLARE_API_TOKEN` 还重复声明了两次（job 级 `:21` 与 step 级 `:45`）。
**置信度**: 版本冲突确定，失败模式高可能。**建议**: 改用 `node-version-file: .nvmrc`。

### 5-2 【中】`verify` 脚本是 CI 的手工副本，且已经漂移：`i18n:check` 无人执行

- `package.json:24` 的 `verify` 包含 `i18n:check`；但 `grep -rn "i18n" .github/workflows/` **无任何匹配** —— CI 从不校验翻译完整性（本次实测本地可过：2122/2122）。
- 反向漂移：`ci.yml:28` 执行 `pnpm audit --prod`，而 `verify` 不含它。
- 仓库无 git hooks，故 `scripts/check-i18n-coverage.mjs` 只能靠人工执行。
  **置信度**: 确定。**建议**: 把 `i18n:check` 提升进 CI 的 lint-and-typecheck job。

### 5-3 【中】架构守卫测试之间互相重复断言

`src/test/architecture/` 共 28 文件 / ~4.5k 行，本身是"防重复"层，却存在重复断言（逐条比对 `expect(` 原文确认）：

- import-context 懒加载：`viteConfig.test.ts:277,280,281` 与 `detailQualityBoundaries.test.ts:148,149,150` 三条断言完全相同
- `droppedItems` 动态导入：`viteConfig.test.ts:271,278` ↔ `detailQualityBoundaries.test.ts:18,17`
- 常量拆分：`refactorBoundaries.test.ts:8-21` ↔ `detailQualityBoundaries.test.ts:203-204`（另有 5 处存在性断言重复）
- 已移除的 barrel：`codebaseMaintainability.test.ts:99` ↔ `namingStructureOptimizations.test.ts:203`；`codeStyleBoundaries.test.ts:110` ↔ `projectStructureBoundaries.test.ts:107`
  **置信度**: 文本重复确定；判定为冗余覆盖为高可能。**建议**: 每个不变式保留唯一归属文件。

### 5-4 【中】env 变量清单三处手工维护，已漂移（11 个键未文档化）

- `.env.example` 24 键（超集）；`docker-compose.yml:8-30` 22 键（严格子集）；`docs-site/.../environment-variables.mdx` 仅 **12** 键（中英各一份）
- 实测：compose 的 22 个键全部出现在 `.env.example`；文档只覆盖 12 个
- 未文档化的 11 个包含安全相关项：`ACCESS_PASSWORD`、`SERVER_ACCESS_TOKEN`、`ENABLE_MCP_PRIVATE_HTTP`、`ENABLE_THIRD_PARTY_PRIVATE_HTTP`、`RUNTIME_*` 等
  **置信度**: 计数确定。**建议**: 以 `.env.example` 为唯一事实来源，文档表由它生成。

### 5-5 【中】测试工厂重复：6 个本地 `makeSession` + 一份 26 行 `baseProps` 字面量

`SessionItem.quick-actions.test.tsx:8`、`SessionItem.completed-badge.test.tsx:9`、`SessionItem.running-dot.test.tsx:9`、`SessionItem.drop.test.tsx:8`、`SessionItem.pinned-crossfade.test.tsx:8`、`GroupItem.quota.test.tsx:8` 各自实现同形状的 `makeSession`；而 `src/test/data/factories.ts:105` 的 `createSavedChatSession` **已被 102 个文件使用**，`src/test/sidebar/historySidebar.ts:37` 也已有 sidebar 专用工厂。
另有 `SessionItem.completed-badge.test.tsx:17-43` 与 `SessionItem.drop.test.tsx:17-42` 是同一份 23 键 `baseProps`，二者 `diff` 仅差一行（`draggingSessionId: null`）。
**置信度**: 确定（重复）/ 高可能（可安全合并）。

### 5-6 【中】`docs:deploy` 脚本与 CI 部署命令互为副本

`package.json:39` 的 `wrangler pages deploy docs-site/dist --project-name=... --branch=main --commit-dirty=true` 与 `.github/workflows/deploy-docs.yml:47` **逐字节相同**，但 CI 只调用 `docs:build`（`:39`），从不调用该脚本。旁证：`knip.json:15` 的 `"ignoreBinaries": ["wrangler"]` 只为它而存在。
**置信度**: 确定。**建议**: 让工作流改调 `pnpm run docs:deploy`，或删除脚本与该 knip 条目。

### 5-7 【低】两处 ESLint 规则块是空操作（已用 `--print-config` 实测）

全局块 `eslint.config.js:41-58` 已对 `**/*.{ts,tsx}` 关闭 `@typescript-eslint/no-explicit-any`、`react-hooks/immutability`、`react-hooks/purity`、`react-hooks/refs`。

- `eslint.config.js:59-67`（`**/*.test.{ts,tsx}`, `**/*.d.ts`）重复关闭同样四条 → 整块可删
- `eslint.config.js:74-81`（`src/test/chat-input/harness.tsx`）重复关闭其中三条 → 整块可删

实测 `eslint --print-config src/test/chat-input/harness.tsx` 返回这四条均为 `[0]`（off），即生效值来自全局块。
注意**相邻块并非冗余**：`:68-73`（`src/test/**` 关 only-export-components）与 `:82-87`、`:110-124`、`:125-139` 都有实际作用。

### 5-8 【低】E2E 专用 fixture 进入生产产物并被 Service Worker 预缓存

`public/e2e-seed.html`（248 B，已跟踪）唯一使用方是 `e2e/helpers/appHarness.ts:173`。`vite.config.ts:42` 的 `globPatterns` 覆盖 `**/*.html` 且 `globIgnores:43-62` 未排除它。
**实测确认**: 本次构建后 `dist/e2e-seed.html` 存在（248 B），且 `dist/sw.js` 中出现该路径（即被预缓存）。
**建议**: 移出 `public/`，或至少加入 `globIgnores`。

### 5-9 【低】路径别名声明三处，且 vitest 已与 vite 漂移

`'@'` 别名在 `vite.config.ts:93`、`vitest.config.ts:10`（推断）、`tsconfig.json:20` 各声明一次；`@panzoom/panzoom` 在 vite 与 vitest 两处重复。
已存在的漂移：`vitest.config.ts` 额外把 `pdfjs-dist` 指向 `build/pdf.mjs`，`vite.config.ts` 没有。
覆盖不对称：`vite.config.ts` 有 370 行架构测试守卫、`eslint.config.js` 有守卫，而 `vitest.config.ts`/`playwright.config.ts`/`tsconfig.json` **无任何守卫**。
**建议**: 抽出共享 alias 常量，并补一条守护测试。

### 5-10 【低】7 对逐字节相同的已提交资产（已实测 shasum）

`docs-site/public/favicon.png` == `public/favicon.png`；`docs/model-logos/gemini-sparkle.svg` == `src/assets/model-icons/gemini.svg`；`docs/model-logos/gemma-color.svg` == `.../gemma.svg`；`docs/model-logos/nanobanana-color.svg` == `.../nanobanana.svg`；`cherry-models/hunyuan.svg` == `providers/cherry/hunyuan.svg`；`cherry-models/glm.svg` == `cherry-models/zai.svg`；`cherry-models-dark/glm.svg` == `cherry-models-dark/zai.svg`。
其中 `docs/model-logos/*` 三对在 `docs/model-logos/README.md` 中**明确说明为设计参考副本**（有意保留）；其余 4 对属上游 Cherry 图库自身的别名/跨目录副本。

### 5-11 【极低】`node24-build-compatibility` job 逐行复制 `build` job 的步骤

`ci.yml:58-59` 与 `:79-80` 命令完全相同，仅 Node 版本不同（`.nvmrc` vs `24`）——这是有意的双版本覆盖，仅"步骤列表手工维护两份"这一点冗余。注意 `codeStyleBoundaries.test.ts:41` 断言了该 job 名称，改名需同步。

---

## 六、工作区中"正在进行"的冗余清理（未提交）

工作区有 50 个文件未提交修改（`+39 / −441`），性质就是 **knip 驱动的死导出清理**：

- `knip.json`：删除全部 28 条 `ignoreIssues` 压制项，改为让 knip 真实通过
- 同步删除对应的未使用导出（`chatWidthState.ts` −100 行、`ContextMenu.tsx`/`DropdownMenu.tsx` 各 −66 行、live-ui / message-sender / prompts / i18n 等）
- 移除未使用依赖 `cookie`（已核实全库 0 处 import），保留 `sharp`

该改动经本次实测**健康**：typecheck 0、lint 0、**5423 用例全绿**、build 成功。

> 注意：`knip.json` 中 `rules.duplicates: "off"` 关闭了重复导出检测；本报告的 P2/P3 多数项正属于该规则本可覆盖的范围。

---

## 七、建议的修复顺序（按"收益/风险"排序）

| 顺序 | 动作                                                                                                                         | 类型                               | 风险                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| 1    | `HEAVY_PRELOAD_PATTERNS` 增加 `model-icons` 规则                                                                             | 1 行配置，移出 486 KB 关键路径     | 极低                                   |
| 1b   | `hydrateChartsIntoDocument` 改为动态 `import('echarts')`（两处调用点本就是 async），并排除 `echarts-vendor`                  | 移出 **1.1 MB** 关键路径           | 低                                     |
| 1c   | `HEAVY_PRELOAD_PATTERNS` 与 `manualChunks` 对齐检查（防止再次漏项）                                                          | 配置                               | 极低                                   |
| 2    | 删除 `shared/mcpServerConfig.ts` 的 `sanitizeMcpServers` 死副本（连同其测试）                                                | 纯删除                             | 低                                     |
| 3    | 删除 `mcpClient` 两个不可达方法；删除 `void options.enablePrivateHttp`；清理冗余 re-export                                   | 纯删除                             | 低                                     |
| 4    | 删除 4 个无客户端路由别名                                                                                                    | 纯删除                             | 低-中（需确认无外部调用方）            |
| 5    | 剔除 157 个不可达 SVG（**优先删 49 个 ≥4 KiB 的，立刻止住 1.94 MiB 死预缓存**）                                              | 资源删除                           | 低（建议先留档到 `docs/model-logos/`） |
| 6    | 统一 `probeMediaDuration` / `isEditableElement` / `parseOffsetSeconds`                                                       | 小重构                             | 中（需覆盖测试）                       |
| 7    | 抽取 `resolveApiKeyPrecedence`、`assertHostResolvesPublic`、`readBoundedJsonBody`                                            | 小重构                             | 中                                     |
| 8    | 抽出 `<LibraryFilterMenu>` 与共享上下文文件收集函数                                                                          | 重构                               | 中                                     |
| 9    | dev 插件委托服务端 handler（P1-2）                                                                                           | 设计改动                           | 中-高，但**唯一已产生可见漂移**的一项  |
| 10   | DTO/路径/常量下沉到 `shared/`；统一 className 常量                                                                           | 收敛                               | 低-中                                  |
| 11   | 修 `deploy-docs.yml:32` 的 Node 版本（改为 `node-version-file: .nvmrc`）                                                     | 1 行，修复应当失败的 CI            | 极低                                   |
| 12   | `verify` 与 CI 对齐：把 `i18n:check` 加入 CI                                                                                 | 补上无人执行的校验                 | 极低                                   |
| 13   | 删除 `eslint.config.js:59-67`、`:74-81` 两个空操作块                                                                         | 纯删除（已实测证明无效果）         | 极低                                   |
| 14   | `e2e-seed.html` 移出 `public/` 或加入 `globIgnores`                                                                          | 避免测试 fixture 进生产与 PWA 缓存 | 低                                     |
| 15   | 删除 `docs:deploy` 或让 CI 调用它；统一 env 文档与 6 个测试工厂                                                              | 收敛                               | 低                                     |
| 16   | 删除 93 个 i18n 死键/仅测试键，并把"未使用键"检查加入 `i18n:check`                                                           | 纯删除 + 加一道门禁                | 低                                     |
| 17   | 删除 `THIRD_PARTY_PROVIDER_LOGO`、16 个被遮蔽的模型图标、`public/assets/.DS_Store`、过时的 `settingsTitle` 守卫              | 纯删除                             | 极低                                   |
| 18   | 合并 94 组相同译文到 `common.*`                                                                                              | 收敛                               | 低                                     |
| 19   | 统一 Modal 外壳为 Radix 薄包装并复用 `useFocusTrap`（P1-5 / F1）                                                             | 结构性收敛，**波及面最广**         | 中-高                                  |
| 20   | picker 复用 `LibraryGridCard`/`LibraryListView`，并改用主题 token + 补键盘可选（F3）                                         | 修 a11y 与主题缺陷                 | 中                                     |
| 21   | 让两处面板改用共享 `VideoSegmentBar`（F4）；统一 `extractSnippet`（F6）；抽 `usePanelResize`（F5）；抽 `toLibraryItem`（F8） | 收敛                               | 中                                     |

---

## 八、检查过且确认干净的方面

- **依赖重叠**：一度怀疑 `react-virtuoso` 与 `@tanstack/react-virtual` 双虚拟化、`docx-preview` 与 `mammoth` 双 DOCX、`echarts`/`mermaid`/`@viz-js/viz` 三图形库重叠——经核实均为**动态导入且用途不同**（`@viz-js/viz`、`katex`、`html2canvas` 走 `import()`，静态 grep 会误报为 0 引用）。
- **`public/fonts` 34 MB CJK 字体**：**不是冗余**。`src/utils/export/markdownPdfFonts.ts` 定义分片 URL，`markdownPdfRenderer.ts:118-120` 经 jsPDF `addFileToVFS`/`addFont` 嵌入，`markdownPdf.test.ts:126-127` 断言按需 fetch 两个分片；且 `vite.config.ts:62` 已将 `**/fonts/NotoSansCJKsc-VF.ttf.part-*` 排除出 Service Worker 预缓存 —— 设计与实现均正确。
- **`src/utils/import-context/loaders.ts`（14 行）** 与 **`src/utils/export/loaders.ts`**：**不是冗余**，是有意的懒加载/代码分割边界，且被 `src/test/architecture/*` 架构测试强制约束。
- **`src/components/message/blocks`、`utils/live-ui`、`utils/markdown` 等**：`knip` 的 `ignoreIssues` 已清空，说明此前记在压制清单里的未使用导出**已被真实删除**。
- **服务端**：provider 转发/SSE 管线已单一化（`proxyForward.ts`、`proxyHeaders.ts`、`streamJobStore.ts` 的 `maybeStreamWithSharedJob` 等）；MCP 六条路由已由 `runPerServerConcurrently`/`respondToSingleServerRequest` 统一；无重复路由注册；无恒值特性开关；无平行 `v2` 实现；测试脚手架复用 `server/test/httpServer.ts`。
- **i18n**：2122/2122 键 × 7 语言完整；**无缺失**。i18n 模块与导出**无孤儿**：barrel `src/i18n/translations.ts` 被 `AppModals.tsx:6` 等使用；9 个 `settings/*` 包均在 `featureTranslations.ts:9-19` 引入；`voiceStyleTranslations.ts` 的 `tts_style_*` 经 `src/constants/voiceOptions.ts:14-28` 存活；`ensureFeatureTranslations`/`ensureAllFeatureTranslations` 均在用；仅被 `settingsSearchCatalog.ts` 引用的 7 个键属合法（`settingsSearch.ts:50,88` 泛化解析 `labelKey`，且 `tab:` id 都在 `settingsTabs.ts:1-15` 内）。
- **`public/fonts` 与 public 图片**：7 个 public 图片 md5 互不相同且全部被引用（`SidebarHeader.tsx:39`、`AboutSection.tsx:118`、`index.html:7-9`、`manifest.json:12,17,23`、`MessageActions.tsx:46`、`sw.ts:23,39`）；`docs-site` 的 logo 是不同文件。
- **CSS**：1866 行样式，无重复 `@keyframes`，仅 1 处同选择器拆成两块。
- **仓库卫生**：`git` 层面干净 —— 无被跟踪的构建产物（`dist/`、`playwright-report/`、`test-results/`、`coverage/`、`server/dist/` 均未入库）；无"被跟踪但同时被 gitignore"的文件（`git ls-files | git check-ignore --stdin` 无输出）。**唯一例外**是未被跟踪但仍留在 `public/` 并被拷进产物的 `public/assets/.DS_Store`（见 P3-12）。
- **测试基建**：全库**无 snapshot 文件**、无 `__mocks__` 目录；672 个测试文件**全部能解析到存活的被测模块**（3 个初看像孤儿的文件实为源码文本守卫测试，目标存在）；`src/test/render/providerRenderer.tsx` 正确复用 `renderer.tsx`、`moduleMocks.ts` 正确复用 `services.ts`，未重复实现；除已列出的 H2 外，其余"同模块多测试文件"经逐一比对均为**不同行为**的覆盖。
- **构建脚本与配置**：`scripts/lib/i18nFiles.mjs` 已是 i18n 脚本共享的单一文件清单来源；`knip.json` 的 3 个 ignore 路径与 3 个 ignoreDependencies 均真实存在/仍需忽略；`eslint.config.js` 中 25 个例外路径**全部存在**；`Dockerfile.api` 与 `Dockerfile.web` 无重复构建步骤。
- **文档**：`README.md` 与 `docs-site` 的 59 个 mdx **无共享长行**（README.md / README.en.md 是翻译而非副本）；`docs/` 仅含 `model-logos/` 参考资产与一张截图，不存在根 docs 与 docs-site 的镜像重复。
- **已提交的生成物**：仅 `src/components/message/code/materialIcons.generated.ts` 一个，带 `AUTO-GENERATED ... do not edit` 头，且正常构建不产出它——属有意提交，非冗余。
- **组件/feature 层经核实为"非重复"的重要项**：`LiveUiFrame` 与 `LiveUiInteractionFrame` **不是**重复（前者是 iframe/HTML+流式桥，后者是字段规格的原生 React 表单渲染器，props 与用途都不同）；`MarkdownTocSidebar` 是组合 `MarkdownTocPanel` 而非重写；整个模型选择家族已收敛到带 `variant` 的单一 `ModelCatalogList`（`ModelCatalogList.tsx:17,52`），`ModelPicker.tsx`、`HeaderModelSelector.tsx`、`settings/controls/ModelSelector.tsx` 均为其分层使用而非第二套实现；日志查看器三个用量标签页数据源不同；MCP 审批/信任/分享三个对话框用途不同，只是共用 `AlertDialog` 原语；虚拟 MCP 服务器是干净的注册表插件模式（`virtualMcpRegistry.ts:17-38`，各 server 自行注册，共享谓词从 `shared/predicates.ts` 引入而非重写）；`AudioRecorder` 组件消费 `useAudioRecorder` hook 而非复制状态机；PDF 缩略图缓存为单例（`LibraryItemThumbnail.tsx:7`）。
- **`ContextMenu.tsx` 与 `DropdownMenu.tsx`**：确实存在类名字符串重复（SubTrigger/SubContent/Content/Item/Separator/Shortcut 六处），但二者包裹的是 Radix 两个不同原语，且差异是有意的（`DropdownMenuContent` 增加了 `portalled`、`sideOffset` 与 pointerdown 兼容层，`DropdownMenu.tsx:10-37`）—— 属"可抽出共享类名常量"的低价值优化，不算缺陷。

---

## 九、附录：可复现命令

```bash
# 未使用文件/导出/依赖（已通过）
node_modules/.bin/knip

# 文本级重复（本次阈值：≥12 行 / ≥70 token）
npx --yes jscpd@4 --min-lines 12 --min-tokens 70 \
  --format typescript,tsx --ignore "**/node_modules/**,**/dist/**,**/i18n/translations/**" \
  --reporters console,json --output /tmp/jscpd-amc src server shared

# 基线健康度
node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint . --max-warnings=0
node scripts/run-vitest.mjs run && node_modules/.bin/vite build
node scripts/check-i18n-coverage.mjs

# 逐字节相同的已提交文件（本报告 P3-10 / 5-10 用的就是它）
git ls-files -z | xargs -0 shasum | sort | \
  awk -F'\t' '{if($1==p){if(!s){print pl; s=1} print $2} else {s=0} p=$1; pl=$2}'

# 关键路径 JS 体积（script + modulepreload）
python3 - <<'PY'
import re, os
html = open('dist/index.html').read()
files = re.findall(r'(?:src|href)="/assets/([^"]+\.js)"', html)
tot = sum(os.path.getsize(os.path.join('dist/assets', f)) for f in files if os.path.exists(os.path.join('dist/assets', f)))
print(f'{len(files)} files, {tot/1024:.0f} KB raw')
PY

# 确认死图标进入了 Service Worker 预缓存
grep -o "dangbei[^\"']*\.svg" dist/sw.js

# 确认 ESLint 规则块的生效值（用于判定空操作块）
node_modules/.bin/eslint --print-config src/test/chat-input/harness.tsx | \
  python3 -c "import json,sys; r=json.load(sys.stdin)['rules']; print({k:r.get(k) for k in ['@typescript-eslint/no-explicit-any','react-hooks/immutability','react-hooks/purity','react-hooks/refs']})"

# 未被跟踪但仍在 public/ 因而会被拷进产物的文件
ls -la public/assets/.DS_Store dist/assets/.DS_Store
```

_审计阶段为只读：为取得第一手体积数据执行过一次 `vite build`，因此 `dist/`（已被 `.gitignore` 忽略）被重建为当前源码对应的产物。随后的修复批次（见第〇节）**改动了源码**，已通过完整 `verify` 门禁；`dist/` 再次重建以核对收益。修复前后的产物哈希自然不同（这正是体积下降的体现）。所有被删除的图标均为 git 已跟踪文件，可用 `git checkout` 恢复；编译产物（`dist/`、`server/dist/`）未纳入版本控制。_
