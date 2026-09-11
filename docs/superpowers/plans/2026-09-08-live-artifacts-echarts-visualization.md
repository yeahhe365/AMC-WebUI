# Live Artifacts Apache ECharts 可视化集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Live Artifacts 图表可视化引擎全面升级为 Apache ECharts，实现 100% 离线支持、自适应主题、丰富交互（Tooltip/图例/动画）与高质量 PNG 导出。

**Architecture:** 通过 Vite 静态拷贝在本地构建 `dist/vendor/echarts.min.js` 并由代码分包隔离主 bundle；在沙箱内注入 `ECHARTS_RENDERER_SCRIPT`，自动将 `--amc-live-artifact-*` CSS 变量转译为 ECharts 主题并以 SVG 模式驱动图表；在导出链路中同步水合 SVG 保证 PNG 快照像素级一致；同步重构 Prompt 指令强化大跨度对数轴与三段式指标卡。

**Tech Stack:** TypeScript, Apache ECharts 6.x, Vite, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-08-live-artifacts-echarts-visualization-design.md`

## Global Constraints

- 100% 本地离线运行，严禁在沙箱或主应用中请求任何第三方 CDN（如 unpkg, cdnjs）。
- 保持向后兼容：历史会话中的旧版 `{type: "bar", x: [...], series: [...]}` 格式必须能自动转译并在 ECharts 中无缝渲染。
- 图表统一采用 SVG 渲染器（`renderer: 'svg'`），确保高分屏清晰度并天然兼容 html2canvas 快照导出。
- 主应用首屏包体积不得膨胀，ECharts 必须作为独立 vendor chunk 或外部静态脚本分离。

---

### Task 1: Vite 静态构建配置与代码分包隔离

**Files:**

- Modify: `vite/staticAssets.ts`
- Modify: `vite.config.ts`
- Modify: `vite/chunks.ts`
- Test: `src/test/architecture/viteConfig.test.ts`

**Interfaces:**

- Produces: `ECHARTS_COPY_SOURCE` in `vite/staticAssets.ts`
- Target build artifact: `dist/vendor/echarts.min.js`

- [x] **Step 1: Write failing test in architecture suite**

检查 `src/test/architecture/viteConfig.test.ts`，添加对 `ECHARTS_COPY_SOURCE` 和 `echarts-vendor` manualChunk 的断言。

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test src/test/architecture/viteConfig.test.ts`

- [x] **Step 3: Implement Vite config changes**

1. 在 `vite/staticAssets.ts` 中导出 `export const ECHARTS_COPY_SOURCE = 'node_modules/echarts/dist/echarts.min.js';`。
2. 在 `vite.config.ts` 的 `viteStaticCopy` targets 中增加：
   ```ts
   {
     src: ECHARTS_COPY_SOURCE,
     dest: 'vendor',
   }
   ```
3. 在 `vite/chunks.ts` 中将 `echarts` 和 `zrender` 加入 `getManualChunk` 分包规则，输出至 `echarts-vendor`。

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test src/test/architecture/viteConfig.test.ts`

- [x] **Step 5: Commit**

```bash
git add vite/staticAssets.ts vite.config.ts vite/chunks.ts src/test/architecture/viteConfig.test.ts
git commit -m "feat(viz): configure vite static copy and vendor chunk for echarts"
```

---

### Task 2: ECharts 沙箱渲染器与主题自适应

**Files:**

- Create: `src/utils/html-preview/echartsRendererScript.ts`
- Create: `src/utils/html-preview/echartsRendererScript.test.ts`
- Modify: `src/utils/html-preview/previewBridgeScript.ts`

**Interfaces:**

- Produces: `ECHARTS_RENDERER_SCRIPT` string constant.
- Consumes: Theme variables `--amc-live-artifact-*` in DOM.
- Attributes handled: `[data-amc-chart]` (and `[data-amc-echarts]`).

- [x] **Step 1: Write unit tests for ECharts renderer logic**

在 `src/utils/html-preview/echartsRendererScript.test.ts` 中测试：

1. 正常 ECharts Option JSON 解析并设置尺寸（默认 `height: 280px`）。
2. 旧版 DSL (`{type:"bar", x:[...], series:[...]}`) 自动兼容转译为标准 ECharts Option。
3. 未完成的流式 JSON 自动标记 `data-amc-chart-pending="1"` 且不崩溃。
4. 主题颜色映射函数将 CSS 变量转换为 ECharts Theme 配置对象。

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/html-preview/echartsRendererScript.test.ts`

- [x] **Step 3: Implement `echartsRendererScript.ts`**

编写内联脚本，包含：

1. 主题注册：`buildThemeFromCssVars(root)` -> `echarts.registerTheme('amc-live-artifact', ...)`，配置 `bar.itemStyle.borderRadius: [4, 4, 0, 0]`，虚线网格，柔和 Tooltip。
2. 历史兼容适配器 `normalizeChartOption(raw)`。
3. MutationObserver 监听 `[data-amc-chart]`，在 `window.echarts` 就绪时以 SVG 模式执行 `echarts.init(node, 'amc-live-artifact', { renderer: 'svg' })`。
4. ResizeObserver / window resize 自动重绘。
5. 在 `src/utils/html-preview/previewBridgeScript.ts` 中引入并嵌入 `${ECHARTS_RENDERER_SCRIPT}` 替换旧的 `${CHART_RENDERER_SCRIPT}`。

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/html-preview/echartsRendererScript.test.ts`

- [x] **Step 5: Commit**

```bash
git add src/utils/html-preview/echartsRendererScript.ts src/utils/html-preview/echartsRendererScript.test.ts src/utils/html-preview/previewBridgeScript.ts
git commit -m "feat(viz): implement sandboxed echarts renderer with theme adaptation"
```

---

### Task 3: 脚本离线注入与 PNG 导出静态快照

**Files:**

- Modify: `src/utils/html-preview/previewDocument.ts`
- Modify: `src/utils/html-preview/previewDocument.test.ts`
- Modify: `src/utils/html-preview/chartRendererSync.test.ts`

**Interfaces:**

- Produces: `hydrateChartsIntoDocument(doc, options)` using ECharts SVG renderer.
- Manages: `<script src="/vendor/echarts.min.js">` (or Blob URL injection) inside `buildHtmlPreviewSrcDoc`.

- [x] **Step 1: Write test for ECharts injection and snapshot hydration**

更新 `src/utils/html-preview/previewDocument.test.ts` 和 `chartRendererSync.test.ts`，验证：

1. 包含 `data-amc-chart` 的内容会自动注入 ECharts 脚本标签；
2. `hydrateChartsIntoDocument` 能在离线 DOM 中正确初始化 ECharts 并生成对应 `<svg>` 结构供快照截屏。

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/html-preview/previewDocument.test.ts src/utils/html-preview/chartRendererSync.test.ts`

- [x] **Step 3: Implement injection & export hydration in `previewDocument.ts`**

1. 在 `previewDocument.ts` 中识别 `data-amc-chart` / `data-amc-echarts`，在 Iframe `<head>` 注入本地脚本标签 `<script src="/vendor/echarts.min.js"></script>`（并保证 CSP 允许本地路径与 blob）。
2. 在 `hydrateChartsIntoDocument` 中调用 `echarts.init(node, theme, { renderer: 'svg' })`，将图表渲染为真实的静态 SVG，完成后 dispose，完美衔接 html2canvas。

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/utils/html-preview/previewDocument.test.ts src/utils/html-preview/chartRendererSync.test.ts`

- [x] **Step 5: Commit**

```bash
git add src/utils/html-preview/previewDocument.ts src/utils/html-preview/previewDocument.test.ts src/utils/html-preview/chartRendererSync.test.ts
git commit -m "feat(viz): support offline script injection and synchronous svg snapshot hydration"
```

---

### Task 4: Prompt 协议重构与业务规约升级

**Files:**

- Modify: `src/features/prompts/liveArtifacts.ts`
- Modify: `src/features/prompts/promptRegistry.test.ts`

**Interfaces:**

- Updates `LIVE_ARTIFACTS_INLINE_SYSTEM_PROMPT_ZH` and `LIVE_ARTIFACTS_INLINE_SYSTEM_PROMPT_EN`.

- [x] **Step 1: Update prompt unit test expectations**

更新 `src/features/prompts/promptRegistry.test.ts` 中涉及 `data-amc-chart` 的断言，改为对 ECharts option 和新规约的检查。

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/prompts/promptRegistry.test.ts`

- [x] **Step 3: Update `liveArtifacts.ts` system prompts**

1. 中英文 Prompt 的图表章节改为基于标准 ECharts Option 的规范，给出简洁范例：
   ```html
   <div
     data-amc-chart='{"tooltip":{"trigger":"axis"},"xAxis":{"type":"category","data":["Q1","Q2"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[100,200]}]}'
     style="height:280px;"
   ></div>
   ```
2. 规范约束：
   - 跨数量级（>10x）数据强制使用对数轴（`yAxis: { type: "log" }`）或双 Y 轴；
   - 包含 `tooltip: { trigger: 'axis' }`；
   - 指标卡（Metrics）必须包含「指标名 (label) + 核心数值 (value) + 辅助说明 (subtext)」完整三要素；
   - 杜绝同构数据三重重复。

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/prompts/promptRegistry.test.ts`

- [x] **Step 5: Commit**

```bash
git add src/features/prompts/liveArtifacts.ts src/features/prompts/promptRegistry.test.ts
git commit -m "feat(viz): update live artifacts system prompt for echarts and visual guardrails"
```

---

### Task 5: 综合验证与 Docker 重新部署

**Files:**

- Test all: `pnpm typecheck` & `pnpm test`
- Deploy: `pnpm run build:docker` & `docker compose up -d --build`

- [x] **Step 1: Run typecheck**
      Run: `pnpm typecheck`

- [x] **Step 2: Run full test suite related to previews and prompts**
      Run: `pnpm test src/utils/html-preview src/features/prompts`

- [x] **Step 3: Build docker artifacts**
      Run: `pnpm run build:docker`
      Verify: `dist/vendor/echarts.min.js` exists.

- [x] **Step 4: Redeploy docker containers**
      Run: `docker compose up -d --build`

- [x] **Step 5: Verify runtime health**
      Run: `docker compose ps` and `curl -I http://localhost:8082`
