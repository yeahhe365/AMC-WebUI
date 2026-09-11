# Live Artifacts Apache ECharts 可视化集成设计

日期：2026-09-08
范围：`src/utils/html-preview/`、`src/features/prompts/liveArtifacts.ts`、`vite/`

## 需求背景

当前 AMC-WebUI 的 Live Artifacts 功能使用轻量自研 SVG 渲染器（`data-amc-chart`），存在明显的体验与能力短板：

1. **跨数量级失真**：小数值与大数值（如 0.02 vs 4.0）共用线性 Y 轴时，小数值柱子贴地不可读；缺少对数轴与双 Y 轴支持。
2. **文字排版缺陷**：中文字符宽度估算不准，导致图例方块与文本紧贴重叠；缺少自动防遮挡与自适应换行。
3. **缺乏现代交互**：缺乏鼠标悬停 Tooltip 浮窗、数据项高亮与图例点击切换能力。
4. **Prompt 冗余**：模型需要遵循专有自研 DSL，表达力受限且消耗 Prompt Token。

目标：**全面转向 Apache ECharts**，作为 Live Artifacts 的核心图表可视化引擎，100% 本地化离线支持，大幅提升视觉与交互质感。

---

## 方案设计

### 1. 依赖与离线资源分发（Static Asset Pipeline）

- **依赖安装**：在 `package.json` 中引入 `echarts`。
- **本地托管**：
  - 在 `vite/staticAssets.ts` 中声明 `ECHARTS_COPY_SOURCE = 'node_modules/echarts/dist/echarts.min.js'`。
  - 在 `vite.config.ts` 的 `viteStaticCopy` 中配置规则，构建时将 `echarts.min.js` 复制到 `dist/vendor/echarts.min.js`。
  - 在 Vite dev server 与 Docker 容器（`/app/public`）中同源托管，完全不依赖任何外部 CDN，支持 100% 离线和私有内网运行。
- **代码分割**：
  在 `vite/chunks.ts` 中将 `echarts` 归入独立 vendor chunk，不增加主应用首屏 bundle 负担。

### 2. 沙箱加载与渲染器设计（Iframe Sandbox & ECharts Renderer）

- **Iframe 动态注入机制**：
  - 沙箱具备 CSP：`script-src 'unsafe-inline' https: blob:;`。
  - 在 `previewDocument.ts` 中：
    - 针对包含 `[data-amc-chart]` 的文档，父窗口通过 `URL.createObjectURL(new Blob([echartsSource], { type: 'application/javascript' }))` 创建单例 Blob URL，或以本地 `/vendor/echarts.min.js` 脚本标签引入。
    - 仅在文档中实际出现图表时按需加载，无图表 Artifacts 不增加额外加载负担。
- **自适应主题（ECharts Theme Integration）**：
  - 在沙箱内编写 `echartsRendererScript.ts`：
    - 读取根元素计算样式或 CSS 变量（`--amc-live-artifact-*`）。
    - 动态注册 `amc-theme` 主题：
      - 调色板映射：`[accent, success, warning, danger, text, subtle]`
      - 背景透明（`backgroundColor: 'transparent'`）
      - 文字字体采用系统字体栈，颜色绑定 `--amc-live-artifact-text`
      - 坐标轴线与分隔线绑定 `--amc-live-artifact-border`（分隔线采用虚线）
      - 柱状图增加微圆角：`bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } }`
      - 浮动 Tooltip：采用卡片背景、圆角及柔和阴影，与 AMC-WebUI 整体 SaaS 风格融为一体
- **SVG 渲染模式**：
  - 使用 `echarts.init(node, 'amc-theme', { renderer: 'svg' })`。
  - SVG 矢量模式具备极高的清晰度、低内存占用，并天然支持导出。

### 3. 流式生成与向后兼容（Streaming & Compatibility）

- **流式 JSON 容错（Pending State）**：
  - 模型在流式生成 `<div data-amc-chart='{...}'>` 时，JSON 字符串是不完整的。
  - 渲染脚本使用 try-catch 解析 JSON：
    - 若 JSON 未闭合，标记 `data-amc-chart-pending="1"`，暂不初始化；
    - 一旦 JSON 闭合成功，移除 pending 属性，执行 `chart.setOption(option, true)`；
    - 节点已有 chart 实例时，平滑更新而非销毁重建，避免画面剧烈闪烁。
- **向后兼容适配（Legacy DSL Adapter）**：
  - 自动检测历史旧会话的 DSL 格式（`{ type: "bar", x: [...], series: [...] }`）：
    - 自动转译为等效的 ECharts Option 配置；
    - 确保过去保存的旧会话历史打开时依然完美呈现，且自动升级为 ECharts 高级样式。

### 4. 静态快照与导出保障（PNG Export Hydration）

- 在 `previewDocument.ts` 的 `createStaticPreviewSnapshotContainer` 导出链路中：
  - 使用 `hydrateChartsIntoDocument` 在内存 DOM 树中同步/异步调用 ECharts（SVG 渲染器）生成完整 SVG 元素；
  - 替换 `<div data-amc-chart>` 占位节点为真实 SVG 结构，确保 html2canvas 截屏输出的 PNG 图像与屏幕所见 100% 像素级一致。

### 5. Prompt 指令优化（System Prompt Redesign）

修改 `src/features/prompts/liveArtifacts.ts`（中英文双语）：

1. **图表声明更新**：
   - 规定使用 `<div data-amc-chart='{...}' style="height: 280px;"></div>` 输出标准 ECharts Option JSON。
   - 默认启用 `tooltip: { trigger: 'axis' }`。
2. **可视化业务规约**：
   - 当遇到数量级差异极大（>10倍）的数据对比时，强制指导模型使用对数轴（`yAxis: { type: 'log' }`）或双 Y 轴，杜绝贴地不可读现象。
   - 强调指标卡（Metrics）必须包含「指标名 (label) + 主数值 (value) + 辅助区间 (subtext)」三要素。
   - 严禁“指标卡、表格、图表机械重复陈述相同 3 个数据”的三重冗余。

---

## 测试与验证计划

1. **单元测试**：
   - 编写 `echartsRendererScript.test.ts`：验证 ECharts 主题注册、配置合并、旧 DSL 兼容转译、流式 pending 处理。
   - 验证 `chartRendererSync.test.ts` / `previewDocument.test.ts`：验证离线导出与快照容器中图表 SVG 渲染完整。
   - 验证 `promptRegistry.test.ts`：断言新 prompt 中包含对 ECharts 与可视化规范的约束。
2. **构建与离线包验证**：
   - 运行 `pnpm build:docker`，验证 `dist/vendor/echarts.min.js` 正确生成，主应用 bundle 体积未被污染。
3. **服务部署验证**：
   - `docker compose up -d --build`，进入容器验证离线加载与图表功能正常。
