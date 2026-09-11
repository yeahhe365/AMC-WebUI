# AMC WebUI Astro Starlight 中英文双语文档站点设计

日期：2026-09-09  
范围：`docs-site/`、`pnpm-workspace.yaml`、`package.json`

---

## 1. 需求背景与目标

AMC-WebUI（All-in-one Model Console WebUI）是一款以 Google Gemini 原生能力为主、兼顾 OpenAI 兼容协议、遵循 Local-First 理念的现代化 Web 控制台。随着 Thinking 深度推理、Live API 双向音视频、Live Artifacts、本地 Python 沙箱 (Pyodide)、MCP (Model Context Protocol) 协议、高级音频压缩以及多服务商双路由架构等复杂功能的全面落地，用户与开发者迫切需要一个体系化、交互友好、支持中英双语的官方文档站点。

### 核心目标

1. **完整功能覆盖**：全面覆盖从新手快速上手、BYOK/代理配置，到深度思考、实时音视频、本地沙箱、MCP 扩展与 Docker 部署的全部技术细节。
2. **极速与轻量 (Zero-JS by default)**：采用 Astro Starlight 架构，默认输出零客户端 JS 的纯静态页面，构建毫秒级，SEO 与离线阅读体验极佳。
3. **原生 React 孤岛支持**：借助 `@astrojs/react`，在关键文档中嵌入实用的 React 18 交互小组件（如环境变量生成器、斜杠命令速查器）。
4. **中英双语 (i18n)**：简体中文（默认根路由）与英文（`/en/`）双语对照，内置离线 Pagefind 全文分词检索。
5. **视觉契合 (Onyx Theme)**：深度定制 Starlight 样式，完美契合 AMC-WebUI 的深曜石紫/蓝科技暗黑风格。
6. **Cloudflare Pages 静态部署**：与主应用静态托管生态保持一致，零服务器成本全球 CDN 分发。

---

## 2. 系统架构与工程组织 (Project Architecture)

### 2.1 目录结构

在主仓库根目录下新建 `docs-site/` 独立子应用：

```text
AMC-WebUI/
├── src/                        # 主前端应用 (React 18 SPA)
├── server/                     # 独立 Node API
├── docs/                       # 原有仓库资源 (截图、model-logos、superpowers specs/plans)
├── docs-site/                  # 【新增】Astro Starlight 文档站点
│   ├── astro.config.mjs        # Astro 与 Starlight 主配置 (i18n, plugins, sidebar)
│   ├── package.json            # 文档站专属依赖声明
│   ├── tsconfig.json           # TypeScript 配置文件
│   ├── src/
│   │   ├── assets/             # 文档专有插图、Logo 与示意图
│   │   ├── styles/
│   │   │   └── custom.css      # Onyx 主题色覆盖与排版微调
│   │   ├── components/         # React 18 交互孤岛组件
│   │   │   ├── EnvConfigGenerator.tsx
│   │   │   ├── SlashCommandFinder.tsx
│   │   │   └── ModelBadgeList.tsx
│   │   └── content/
│   │       ├── docs/           # 简体中文文档 (默认根路径 /)
│   │       │   ├── index.md    # 官网级 Splash 欢迎页
│   │       │   ├── getting-started/
│   │       │   ├── models/
│   │       │   ├── tools/
│   │       │   ├── power-user/
│   │       │   ├── deployment/
│   │       │   └── faq/
│   │       └── docs/en/        # 英文文档 (路径 /en/)
│   │           ├── index.md    # 英文 Splash 欢迎页
│   │           └── ... (与中文一一对称)
│   └── public/                 # 静态资源、favicon
├── pnpm-workspace.yaml         # 纳入 docs-site 管理
└── package.json                # 根目录透传 docs:* 命令
```

### 2.2 依赖声明 (`docs-site/package.json`)

- `astro`: `^5.x`
- `@astrojs/starlight`: `^0.32.x`
- `@astrojs/react`: `^4.x`
- `react`: `^18.3.1` (与主工程版本一致)
- `react-dom`: `^18.3.1`
- `lucide-react`: `^0.417.0` (复用主工程图标)
- `sharp`: 用于图片自动优化与元数据提取

### 2.3 工作区集成 (`pnpm-workspace.yaml` & `package.json`)

在根目录 `pnpm-workspace.yaml` 中声明：

```yaml
packages:
  - '.'
  - 'docs-site'
```

在根目录 `package.json` 中配置便捷脚本：

- `"docs:dev": "pnpm --filter docs-site dev"`
- `"docs:build": "pnpm --filter docs-site build"`
- `"docs:preview": "pnpm --filter docs-site preview"`

---

## 3. 信息架构与侧边栏路由规划 (Information Architecture)

侧边栏采用清晰严谨的**模块功能型分类**，配置于 `astro.config.mjs` 中：

```javascript
sidebar: [
  {
    label: '🚀 快速上手',
    translations: { en: '🚀 Getting Started' },
    items: [
      { label: '项目简介', slug: 'getting-started/introduction', translations: { en: 'Introduction' } },
      { label: '快速启动', slug: 'getting-started/quickstart', translations: { en: 'Quickstart' } },
      {
        label: '服务商与 API 配置',
        slug: 'getting-started/api-configuration',
        translations: { en: 'API Configuration' },
      },
      { label: 'PWA 与多端体验', slug: 'getting-started/pwa', translations: { en: 'PWA & Desktop' } },
    ],
  },
  {
    label: '🧠 模型与深度推理',
    translations: { en: '🧠 Models & Reasoning' },
    items: [
      { label: '内置模型矩阵', slug: 'models/model-matrix', translations: { en: 'Model Matrix' } },
      { label: '深度思考 (Thinking)', slug: 'models/thinking', translations: { en: 'Thinking Mode' } },
      { label: '实时音视频 (Live API)', slug: 'models/live-api', translations: { en: 'Live API' } },
      { label: '第三方兼容模型', slug: 'models/openai-compatible', translations: { en: 'OpenAI-Compatible' } },
    ],
  },
  {
    label: '🛠️ 生产力工具箱',
    translations: { en: '🛠️ Productivity Tools' },
    items: [
      {
        label: '联网检索 (Search & Maps)',
        slug: 'tools/web-search-maps',
        translations: { en: 'Search & Maps Grounding' },
      },
      { label: '代码执行与本地沙箱', slug: 'tools/code-and-sandbox', translations: { en: 'Code & Python Sandbox' } },
      { label: 'Live Artifacts 构件', slug: 'tools/live-artifacts', translations: { en: 'Live Artifacts' } },
      { label: '高级文件与多模态', slug: 'tools/files-multimodal', translations: { en: 'Files & Multimodal' } },
      { label: 'MCP 协议生态', slug: 'tools/mcp', translations: { en: 'Model Context Protocol' } },
    ],
  },
  {
    label: '⚡ 极客高效操作',
    translations: { en: '⚡ Power User Guide' },
    items: [
      { label: '斜杠命令速查', slug: 'power-user/slash-commands', translations: { en: 'Slash Commands' } },
      { label: '快捷键与快速切换', slug: 'power-user/shortcuts', translations: { en: 'Shortcuts & Gestures' } },
      { label: '语音合成与转写', slug: 'power-user/tts-transcribe', translations: { en: 'TTS & Transcribe' } },
      {
        label: '会话与数据管理',
        slug: 'power-user/data-management',
        translations: { en: 'Data & Session Management' },
      },
    ],
  },
  {
    label: '🚢 架构与私有化部署',
    translations: { en: '🚢 Deployment & Architecture' },
    items: [
      {
        label: '架构原理与 Local-First',
        slug: 'deployment/architecture',
        translations: { en: 'Architecture & Local-First' },
      },
      { label: 'Docker Compose 双容器部署', slug: 'deployment/docker', translations: { en: 'Docker Compose' } },
      { label: '静态托管 + 独立 API', slug: 'deployment/static-and-api', translations: { en: 'Static Hosting + API' } },
      { label: '环境变量与安全边界', slug: 'deployment/environment-variables', translations: { en: 'Env & Security' } },
      { label: '精确计费与开发者日志', slug: 'deployment/pricing-and-logs', translations: { en: 'Pricing & Logs' } },
    ],
  },
  {
    label: '❓ 常见问题与排错',
    translations: { en: '❓ FAQ & Troubleshooting' },
    items: [
      { label: '典型报错排查', slug: 'faq/common-errors', translations: { en: 'Common Errors' } },
      { label: '网络与代理排查', slug: 'faq/network-and-proxy', translations: { en: 'Network & Proxy' } },
      { label: '缓存维护与数据迁移', slug: 'faq/storage-and-reset', translations: { en: 'Storage & Reset' } },
    ],
  },
];
```

---

## 4. 视觉主题与官网级首页设计 (Visual Design & Splash)

### 4.1 视觉主题定制 (`src/styles/custom.css`)

- **暗黑背景 (Onyx)**：
  - 页面背景：`--sl-color-bg: #090d16;`
  - 侧边栏与卡片底色：`--sl-color-bg-sidebar: #0e1422;`、`--sl-color-bg-nav: #090d16;`
  - 边框微光：`--sl-color-hairline: #1e293b;`
- **品牌高亮 (Gemini Violet & Cyan)**：
  - 主色强调：`--sl-color-accent: #8b5cf6;`（紫罗兰）
  - 辅助强调：`--sl-color-accent-high: #06b6d4;`（冰青蓝）
- **高对比度浅色模式 (Pearl)**：保证白底黑字、对比清晰的日间阅读体验。

### 4.2 官网级欢迎页 (Hero & Feature Grid)

中英文首页 `index.md` 采用 `template: splash`：

- **Hero 核心区**：
  - 标题：`AMC WebUI`
  - Tagline：以 Gemini 原生能力为主，兼具 OpenAI 兼容生态的极客级 AI 控制台
  - Actions：
    - `快速上手` (`/getting-started/introduction/`)
    - `在线演示` (`https://all-model-chat.pages.dev/`)
    - `GitHub 仓库` (`https://github.com/yeahhe365/AMC-WebUI`)
- **核心特性网格 (CardGrid)**：
  - 🧠 **深度推理 (Thinking)**：Token 预算精细控制、思维链实时展开与自动翻译。
  - 🎙️ **实时音视频 (Live API)**：双向低延迟语音通话、屏幕共享与视觉识别全代理。
  - 🧩 **Live Artifacts**：代码实时渲染为交互式沙箱、Mermaid 流程图与 Graphviz 图。
  - 🐍 **本地 Python 沙箱 (Pyodide)**：浏览器 WASM 独立环境运行科学计算，图表自动捕获。
  - 🔌 **MCP 协议生态**：本地 stdio 与远程 SSE/Stream 双驱动，带严谨的工具审批机制。
  - 🛡️ **Local-First 隐私优先**：IndexedDB + Web Locks 本地持久化，双 API 路由严格隔离。

---

## 5. React 交互孤岛组件 (Interactive Islands)

在 `docs-site/src/components/` 下开发 3 个专属 React 18 小工具，在 MDX 中以 `<Component client:load />` 嵌入：

1. **`<EnvConfigGenerator client:load />`**
   - 交互功能：勾选部署模式（Docker 双服务 / 静态前端 / BYOK 模式 / 服务端密钥统一托管）、开关 Live WS 代理、开启 MCP stdio；输入自定义端口与上游地址。
   - 输出：实时生成格式完备且带注释的 `.env` 文件或 `docker-compose.yml` 代码块，支持一键复制。
2. **`<SlashCommandFinder client:load />`**
   - 交互功能：支持模糊搜索与类别筛选（会话类 / 工具类 / 系统类），实时展示 `/model`、`/fast`、`/deep`、`/online`、`/maps`、`/code` 等命令的触发方式、适用模型与对应快捷键。
3. **`<ModelBadgeList client:visible />`**
   - 交互功能：直观展示 `gemini-3.8-flash`、`gemini-robotics-er-2-preview`、`gemini-3.5-flash-lite` 等模型的特性标签（Thinking 支持、Live 支持、视觉能力、上下文窗口）。

---

## 6. 构建与 Cloudflare Pages 部署 (Build & Deployment)

### 6.1 产物输出

- 运行 `pnpm run docs:build`，Astro 生成纯静态文件至 `docs-site/dist/`。
- Pagefind 自动遍历静态 HTML 完成中文与英文双语的分词索引构建，生成离线搜索库。

### 6.2 Cloudflare Pages 自动化流水线

- **Build command**: `pnpm --filter docs-site build`
- **Build output directory**: `docs-site/dist`
- **Root directory**: `/` (或在 Pages 控制台指定单仓构建)
- **环境变量**:
  - `NODE_VERSION`: `24` (或 `26`)
  - `PNPM_VERSION`: `11.22.0`

---

## 7. 分阶段实施计划 (Implementation Milestones)

- **阶段 1：工程基建与双语 Splash 首页**
  1. 初始化 `docs-site/` 基础配置、依赖安装与 pnpm workspace 关联。
  2. 配置 `astro.config.mjs`（i18n 中英双语、侧边栏路由定义、React 集成、Pagefind）。
  3. 配置 `custom.css` 主题色变量，构建中英文欢迎页 `index.md`。
- **阶段 2：全量中文核心文档编写与 React 交互组件落地**
  1. 依次编写 6 大板块全量中文 MDX 文档。
  2. 实现 `<EnvConfigGenerator />`、`<SlashCommandFinder />` 与 `<ModelBadgeList />` 交互孤岛。
- **阶段 3：英文对照补齐、离线搜索验证与构建验收**
  1. 对应补齐 `src/content/docs/en/` 下的全量英文 MDX。
  2. 验证本地开发服务 (`docs:dev`) 与生产构建 (`docs:build`)，检查 Pagefind 中英文检索能力。
  3. 提交 Git 变更并准备上线部署。

---

## 8. 验证与验收标准

1. **类型与构建检查**：`pnpm --filter docs-site build` 零报错通过，成功生成 `docs-site/dist/`。
2. **多语言与路由切换**：
   - 访问 `/` 正常加载中文首页及中文侧边栏；
   - 访问 `/en/` 正常加载英文首页及英文侧边栏；
   - 页面右上角语言切换器能够精准平跳对应页面。
3. **全文检索验证**：
   - 在中文环境下搜索“本地沙箱”、“Thinking”、“Docker”，能精准检索并高亮跳转；
   - 在英文环境下搜索“Pyodide”、“Live API”、“Slash Command”，能精准检索英文条目。
4. **交互孤岛验证**：
   - `<EnvConfigGenerator />` 切换选项时，生成的 `.env` 内容正确更新，一键复制功能正常。
   - `<SlashCommandFinder />` 搜索过滤响应实时顺畅。
