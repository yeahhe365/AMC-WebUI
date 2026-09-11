# Astro Starlight 中英文双语文档站点实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AMC-WebUI 项目构建基于 Astro Starlight 的中英文双语官方文档站点（位于子目录 `docs-site/`），覆盖全量核心功能、包含 React 交互孤岛小组件，并支持 Cloudflare Pages 静态自动化构建。

**Architecture:** 采用 Astro 5 + Starlight 架构，默认输出零 JS 纯静态页面与 Pagefind 离线检索索引；通过 `@astrojs/react` 嵌入独立 React 18 交互小部件（配置生成器、斜杠命令速查器）；根目录通过 `pnpm-workspace.yaml` 与主工程统一协同。

**Tech Stack:** Astro 5, @astrojs/starlight, @astrojs/react, React 18, Lucide-react, Pagefind, Expressive Code.

**Spec:** `docs/superpowers/specs/2026-09-09-docs-site-design.md`

## Global Constraints

- 所有文档站源码放置在 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/`。
- 依赖包管理使用 `pnpm@11.22.0` 与 pnpm workspace。
- React 版本严格保持 `^18.3.1`，与主工程一致。
- 默认根路由 `/` 为简体中文 (`zh-CN`)，英文路径为 `/en/`。
- 视觉主题深度遵循 AMC-WebUI Onyx 深曜石暗色调（`#090d16` 背景，紫罗兰 `#8b5cf6` 与冰青蓝 `#06b6d4` 品牌色）。
- 不在文档中编写任何占位符（如 TODO / TBD），每个页面均需输出详实准确的指导内容。

---

### Task 1: 工作区配置与文档站包初始化 (Workspace Setup & Package Init)

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `package.json:30-40`
- Create: `docs-site/package.json`
- Create: `docs-site/tsconfig.json`

**Interfaces:**

- Consumes: 主仓库根目录 pnpm 工作区配置
- Produces: `docs-site` 子包与根目录快捷脚本 (`docs:dev`, `docs:build`, `docs:preview`)

- [ ] **Step 1: 更新 `pnpm-workspace.yaml` 引入 packages 声明**

修改 `/Volumes/WD_BLACK/Code/AMC-WebUI/pnpm-workspace.yaml`，在文件顶部添加 `packages` 列表：

```yaml
packages:
  - '.'
  - 'docs-site'

allowBuilds:
  '@google/genai': true
  canvas: true
  core-js: true
  esbuild: true
  protobufjs: true
```

- [ ] **Step 2: 在根 `package.json` 中添加透传脚本**

在根 `/Volumes/WD_BLACK/Code/AMC-WebUI/package.json` 的 `scripts` 中增加：

```json
    "docs:dev": "pnpm --filter docs-site dev",
    "docs:build": "pnpm --filter docs-site build",
    "docs:preview": "pnpm --filter docs-site preview",
```

- [ ] **Step 3: 创建 `docs-site/package.json`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/package.json`：

```json
{
  "name": "docs-site",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "@astrojs/react": "^4.2.1",
    "@astrojs/starlight": "^0.32.2",
    "astro": "^5.4.2",
    "lucide-react": "^0.417.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 4: 创建 `docs-site/tsconfig.json`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/tsconfig.json`：

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

- [ ] **Step 5: 执行 pnpm install 依赖安装与工作区联动校验**

运行命令：

```bash
pnpm install
```

验证 `docs-site/node_modules` 软链正确，依赖解析无错误。

- [ ] **Step 6: 提交工作区与包基础代码**

```bash
git add pnpm-workspace.yaml package.json docs-site/package.json docs-site/tsconfig.json pnpm-lock.yaml
git commit -m "chore(docs): initialize docs-site package and pnpm workspace configuration"
```

---

### Task 2: Starlight 配置、Onyx 主题与静态资源准备 (Starlight Config & Onyx Theme)

**Files:**

- Create: `docs-site/astro.config.mjs`
- Create: `docs-site/src/styles/custom.css`
- Create: `docs-site/public/favicon.svg`

**Interfaces:**

- Consumes: Task 1 安装的 `@astrojs/starlight` 与 `@astrojs/react`
- Produces: 具备中英双语、6 大板块侧边栏、Onyx 暗黑视觉的主题架构

- [ ] **Step 1: 编写 `docs-site/astro.config.mjs`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/astro.config.mjs`：

```javascript
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [
    starlight({
      title: 'AMC WebUI',
      defaultLocale: 'root',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
        en: {
          label: 'English',
          lang: 'en',
        },
      },
      social: {
        github: 'https://github.com/yeahhe365/AMC-WebUI',
      },
      customCss: ['./src/styles/custom.css'],
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
            {
              label: '代码执行与本地沙箱',
              slug: 'tools/code-and-sandbox',
              translations: { en: 'Code & Python Sandbox' },
            },
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
            {
              label: '静态托管 + 独立 API',
              slug: 'deployment/static-and-api',
              translations: { en: 'Static Hosting + API' },
            },
            {
              label: '环境变量与安全边界',
              slug: 'deployment/environment-variables',
              translations: { en: 'Env & Security' },
            },
            {
              label: '精确计费与开发者日志',
              slug: 'deployment/pricing-and-logs',
              translations: { en: 'Pricing & Logs' },
            },
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
      ],
    }),
    react(),
  ],
});
```

- [ ] **Step 2: 编写 `docs-site/src/styles/custom.css`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/styles/custom.css`，配置 Onyx 暗黑风格与 Gemini 品牌强调色：

```css
:root {
  --sl-color-accent-low: #2e1065;
  --sl-color-accent: #8b5cf6;
  --sl-color-accent-high: #c4b5fd;
  --sl-color-white: #ffffff;
  --sl-color-gray-1: #f1f5f9;
  --sl-color-gray-2: #e2e8f0;
  --sl-color-gray-3: #cbd5e1;
  --sl-color-gray-4: #94a3b8;
  --sl-color-gray-5: #64748b;
  --sl-color-gray-6: #334155;
  --sl-color-black: #090d16;
}

:root[data-theme='dark'] {
  --sl-color-accent-low: #2e1065;
  --sl-color-accent: #8b5cf6;
  --sl-color-accent-high: #38bdf8;
  --sl-color-bg: #090d16;
  --sl-color-bg-sidebar: #0d1322;
  --sl-color-bg-nav: #090d16;
  --sl-color-hairline: #1e293b;
  --sl-color-hairline-light: #1e293b;
  --sl-color-black: #090d16;
}

/* 导航栏与侧边栏高光 */
starlight-menu-button {
  border-radius: 8px;
}

/* 交互小部件容器样式 */
.interactive-widget-box {
  background: var(--sl-color-bg-sidebar);
  border: 1px solid var(--sl-color-hairline);
  border-radius: 12px;
  padding: 1.25rem;
  margin: 1.5rem 0;
}
```

- [ ] **Step 3: 创建 `docs-site/public/favicon.svg`**

生成与主应用风格一致的 SVG 图标：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
</svg>
```

- [ ] **Step 4: 提交基础配置**

```bash
git add docs-site/astro.config.mjs docs-site/src/styles/custom.css docs-site/public/favicon.svg
git commit -m "feat(docs): configure Astro Starlight with bilingual sidebar and Onyx theme"
```

---

### Task 3: 中英文官网级 Splash 欢迎首页 (Bilingual Splash Landing Pages)

**Files:**

- Create: `docs-site/src/content/docs/index.md`
- Create: `docs-site/src/content/docs/en/index.md`

**Interfaces:**

- Consumes: Task 2 的 Starlight 路由与主题
- Produces: 具有 Hero 大标题、核心特性卡片网格的官网主页

- [ ] **Step 1: 编写中文欢迎页 `docs-site/src/content/docs/index.md`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/content/docs/index.md`，使用 `template: splash` 与 CardGrid：

```markdown
---
title: AMC WebUI
description: All-in-one Model Console WebUI · 以 Google Gemini 原生能力为主，兼具 OpenAI 兼容生态
template: splash
hero:
  tagline: 以 Google Gemini 原生能力为主，兼具 OpenAI 兼容生态的极客级 AI 控制台。本地持久化，隐私优先。
  actions:
    - text: 🚀 快速上手
      link: /getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: 🌐 在线演示
      link: https://all-model-chat.pages.dev/
      icon: external
    - text: ⭐️ GitHub 仓库
      link: https://github.com/yeahhe365/AMC-WebUI
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

## 核心特性

<CardGrid stagger>
  <Card title="🧠 深度推理 (Thinking)" icon="open-book">
    支持 Gemini 3.x 系列深度思维链可视化、Token 预算精细控制与思维链实时双向翻译。
  </Card>
  <Card title="🎙️ 实时音视频 (Live API)" icon="laptop">
    双向低延迟语音通话、摄像头画面捕获、屏幕共享与基于 AudioWorklet 的实时音频波形渲染。
  </Card>
  <Card title="🧩 Live Artifacts 交互构件" icon="puzzle">
    代码块自动识别为全屏 HTML/SVG 交互沙箱，内置 Apache ECharts、Mermaid 与 Graphviz 多引擎图表直出。
  </Card>
  <Card title="🐍 本地 Python 沙箱 (Pyodide)" icon="setting">
    浏览器端 WASM 独立安全环境执行科学计算，预装 numpy/pandas，动态安装 scipy/sklearn，本地图表自动捕获。
  </Card>
  <Card title="🔌 MCP 协议扩展" icon="add-document">
    完整支持 Model Context Protocol，兼容本地 stdio 进程与远程 SSE/Stream 服务，提供严谨的工具调用审批流。
  </Card>
  <Card title="🛡️ Local-First 隐私优先" icon="bars">
    数据默认存储于浏览器 IndexedDB 并由 Web Locks 保护；Gemini 原生与 OpenAI 兼容配置严格隔离。
  </Card>
</CardGrid>
```

- [ ] **Step 2: 编写英文欢迎页 `docs-site/src/content/docs/en/index.md`**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/content/docs/en/index.md`：

```markdown
---
title: AMC WebUI
description: All-in-one Model Console WebUI featuring native Google Gemini capabilities and OpenAI-compatible endpoints.
template: splash
hero:
  tagline: All-in-one Model Console WebUI featuring native Google Gemini capabilities, OpenAI-compatible ecosystem, and Local-First privacy.
  actions:
    - text: 🚀 Getting Started
      link: /en/getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: 🌐 Live Demo
      link: https://all-model-chat.pages.dev/
      icon: external
    - text: ⭐️ GitHub Repo
      link: https://github.com/yeahhe365/AMC-WebUI
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

## Core Capabilities

<CardGrid stagger>
  <Card title="🧠 Deep Reasoning (Thinking)" icon="open-book">
    Visualized chain-of-thought for Gemini 3.x models, custom token budgets, and real-time thought translation.
  </Card>
  <Card title="🎙️ Real-time Audio & Video (Live API)" icon="laptop">
    Bidirectional streaming voice calls, screen sharing, camera vision input, and AudioWorklet visualization.
  </Card>
  <Card title="🧩 Live Artifacts" icon="puzzle">
    Automatic sandbox rendering of interactive HTML/SVG with Apache ECharts, Mermaid flowcharts, and Graphviz.
  </Card>
  <Card title="🐍 Local Python Sandbox (Pyodide)" icon="setting">
    Browser-side WASM environment with numpy/pandas preloaded, dynamic package installation, and plot capture.
  </Card>
  <Card title="🔌 Model Context Protocol (MCP)" icon="add-document">
    Full MCP client supporting local stdio and remote SSE/Stream servers with human-in-the-loop tool approvals.
  </Card>
  <Card title="🛡️ Local-First Architecture" icon="bars">
    IndexedDB persistence with Web Locks API concurrency control; Gemini and OpenAI settings strictly isolated.
  </Card>
</CardGrid>
```

- [ ] **Step 3: 验证首页构建**

运行：

```bash
pnpm --filter docs-site build
```

验证无构建报错，首页 HTML 正确生成。

- [ ] **Step 4: 提交欢迎页代码**

```bash
git add docs-site/src/content/docs/index.md docs-site/src/content/docs/en/index.md
git commit -m "feat(docs): add bilingual splash landing pages with feature grid"
```

---

### Task 4: React 交互孤岛组件开发 (Interactive React Islands)

**Files:**

- Create: `docs-site/src/components/EnvConfigGenerator.tsx`
- Create: `docs-site/src/components/SlashCommandFinder.tsx`
- Create: `docs-site/src/components/ModelBadgeList.tsx`

**Interfaces:**

- Consumes: React 18, `lucide-react`
- Produces: 3 个在 MDX 中可直接调用的交互组件

- [ ] **Step 1: 开发 `<EnvConfigGenerator />` 环境变量生成器**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/components/EnvConfigGenerator.tsx`：
提供用户勾选：部署模式（Docker 双容器 / 纯静态 Pages）、Key 托管模式（BYOK / 服务端托管）、Live WS 代理开关、MCP stdio 开关，自动生成配置文本，带一键复制与提示。

- [ ] **Step 2: 开发 `<SlashCommandFinder />` 斜杠命令速查器**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/components/SlashCommandFinder.tsx`：
包含搜索栏与分组过滤按钮（全部 / 会话管理 / 工具开关 / 系统），收录 `/model`、`/fast`、`/deep`、`/online`、`/maps`、`/code`、`/url`、`/file`、`/clear`、`/new`、`/pip`、`/artifacts` 等命令。

- [ ] **Step 3: 开发 `<ModelBadgeList />` 模型矩阵标签板**

创建 `/Volumes/WD_BLACK/Code/AMC-WebUI/docs-site/src/components/ModelBadgeList.tsx`：
以卡片和状态标签展示 `gemini-3.8-flash`、`gemini-3.5-flash-lite`、`gemini-3.1-pro-preview`、`gemini-robotics-er-2-preview` 的上下文窗口、思维链支持情况、生图/语音能力。

- [ ] **Step 4: 构建并验证 React 组件集成**

运行：

```bash
pnpm --filter docs-site build
```

确保 React JSX 编译无类型报错。

- [ ] **Step 5: 提交交互孤岛组件代码**

```bash
git add docs-site/src/components/
git commit -m "feat(docs): implement interactive React islands for config generation and command discovery"
```

---

### Task 5: 核心中文文档编写 - 基础与模型篇 (Chinese Docs: Getting Started & Models)

**Files:**

- Create: `docs-site/src/content/docs/getting-started/introduction.mdx`
- Create: `docs-site/src/content/docs/getting-started/quickstart.mdx`
- Create: `docs-site/src/content/docs/getting-started/api-configuration.mdx`
- Create: `docs-site/src/content/docs/getting-started/pwa.mdx`
- Create: `docs-site/src/content/docs/models/model-matrix.mdx`
- Create: `docs-site/src/content/docs/models/thinking.mdx`
- Create: `docs-site/src/content/docs/models/live-api.mdx`
- Create: `docs-site/src/content/docs/models/openai-compatible.mdx`

**Interfaces:**

- Consumes: 源码 `src/constants/modelConfiguration.ts`、`src/utils/model/modelCapabilities.ts`、`README.md`
- Produces: 8 篇结构严密、代码与图例清晰的中文指南

- [ ] **Step 1: 编写快速上手 4 篇文档**
  - `introduction.mdx`: 阐明 Local-First 原则、IndexedDB 机制、双路由理念与适用人群。
  - `quickstart.mdx`: 本地 Node 24/26 开发、Docker 双服务启动、在线 Demo 体验。
  - `api-configuration.mdx`: BYOK 模式、Gemini 原生 Key 配置、多 Key 轮询机制、自定义 API 代理（如 AIStudioToAPI）接入。
  - `pwa.mdx`: PWA 安装、离线缓存 Shell 原理、画中画 (PiP) 模式使用。

- [ ] **Step 2: 编写模型与深度推理 4 篇文档**
  - `model-matrix.mdx`: 嵌入 `<ModelBadgeList client:visible />`，详细解释 3.x Flash、Pro、Robotics-ER-2 的特性与适用场景。
  - `thinking.mdx`: 详解 Token 预算调节（128 ~ 32768）、Minimal/Low/Medium/High 推理等级差异，思维链流式展示与借助 `gemini-3.5-flash-lite` 自动翻译思维链。
  - `live-api.mdx`: 实时双向语音、AudioWorklet 音频可视化、摄像头与屏幕共享视觉识别，Docker WebSocket 代理与直连差异。
  - `openai-compatible.mdx`: 第三方 Base URL（`/chat/completions`）配置、独立 API Key、独立模型列表，隔离保护机制。

- [ ] **Step 3: 运行验证构建**

```bash
pnpm --filter docs-site build
```

- [ ] **Step 4: 提交基础与模型篇文档**

```bash
git add docs-site/src/content/docs/getting-started/ docs-site/src/content/docs/models/
git commit -m "docs: add getting started and models guide chapters"
```

---

### Task 6: 核心中文文档编写 - 工具、极客、部署与排错篇 (Chinese Docs: Tools, Power User, Deployment & FAQ)

**Files:**

- Create: `docs-site/src/content/docs/tools/web-search-maps.mdx`
- Create: `docs-site/src/content/docs/tools/code-and-sandbox.mdx`
- Create: `docs-site/src/content/docs/tools/live-artifacts.mdx`
- Create: `docs-site/src/content/docs/tools/files-multimodal.mdx`
- Create: `docs-site/src/content/docs/tools/mcp.mdx`
- Create: `docs-site/src/content/docs/power-user/slash-commands.mdx`
- Create: `docs-site/src/content/docs/power-user/shortcuts.mdx`
- Create: `docs-site/src/content/docs/power-user/tts-transcribe.mdx`
- Create: `docs-site/src/content/docs/power-user/data-management.mdx`
- Create: `docs-site/src/content/docs/deployment/architecture.mdx`
- Create: `docs-site/src/content/docs/deployment/docker.mdx`
- Create: `docs-site/src/content/docs/deployment/static-and-api.mdx`
- Create: `docs-site/src/content/docs/deployment/environment-variables.mdx`
- Create: `docs-site/src/content/docs/deployment/pricing-and-logs.mdx`
- Create: `docs-site/src/content/docs/faq/common-errors.mdx`
- Create: `docs-site/src/content/docs/faq/network-and-proxy.mdx`
- Create: `docs-site/src/content/docs/faq/storage-and-reset.mdx`

**Interfaces:**

- Consumes: Task 4 的 React 孤岛组件（`<SlashCommandFinder />`, `<EnvConfigGenerator />`）
- Produces: 17 篇高质量中文功能与技术剖析文档

- [ ] **Step 1: 编写生产力工具箱 5 篇文档**
  - `web-search-maps.mdx`: Google Search、Deep Search 多步规划、Google Maps 坐标位置检索。
  - `code-and-sandbox.mdx`: Gemini 云端代码执行 vs 本地 Pyodide WASM 沙箱（依赖自动装载、文件挂载、图表输出）。
  - `live-artifacts.mdx`: HTML/SVG 交互沙箱、ECharts、Mermaid、Graphviz 图表直出与提示词定制。
  - `files-multimodal.mdx`: ZIP/文件夹解包、Worker 音频压缩、Gemini Cloud Files API 管理。
  - `mcp.mdx`: stdio/SSE 配置、工具调用权限审批流、Prompts 与 Resources 读取。

- [ ] **Step 2: 编写极客操作 4 篇文档**
  - `slash-commands.mdx`: 嵌入 `<SlashCommandFinder client:load />` 完整速查。
  - `shortcuts.mdx`: 自定义快捷键、Tab 快速轮巡模型、划词提问 (Selection Ask)、队列发送。
  - `tts-transcribe.mdx`: Gemini Flash TTS 30 种音色选择、3.5 语音转写。
  - `data-management.mdx`: 会话搜索、分组置顶、JSON/Markdown 导入导出。

- [ ] **Step 3: 编写架构与私有化部署 5 篇文档**
  - `architecture.mdx`: Local-First、IndexedDB 与 Web Locks 互斥锁、前端 SPA 与 Node 后端职责。
  - `docker.mdx`: `web` + `api` 双服务容器编排与启动。
  - `static-and-api.mdx`: Cloudflare Pages 前端 + 独立 Node API 跨域与反代。
  - `environment-variables.mdx`: 嵌入 `<EnvConfigGenerator client:load />`，详细解释全部 `RUNTIME_*` 与服务端变量。
  - `pricing-and-logs.mdx`: 严格定价逻辑、Token 统计与控制台排查。

- [ ] **Step 4: 编写常见问题与排错 3 篇文档**
  - `common-errors.mdx`: Robotics 403 API 限制绑定要求、Thinking 等级兼容报错。
  - `network-and-proxy.mdx`: WebSocket 代理异常排查、CORS 白名单配置。
  - `storage-and-reset.mdx`: 本地缓存排查、备份恢复与重置流程。

- [ ] **Step 5: 验证中文全量文档构建**

运行：

```bash
pnpm --filter docs-site build
```

- [ ] **Step 6: 提交工具、极客、部署与排错篇中文文档**

```bash
git add docs-site/src/content/docs/tools/ docs-site/src/content/docs/power-user/ docs-site/src/content/docs/deployment/ docs-site/src/content/docs/faq/
git commit -m "docs: complete full Chinese documentation suite across all 6 modules"
```

---

### Task 7: 英文双语对应文档建设 (English Documentation Parity)

**Files:**

- Create: `docs-site/src/content/docs/en/getting-started/*.mdx`
- Create: `docs-site/src/content/docs/en/models/*.mdx`
- Create: `docs-site/src/content/docs/en/tools/*.mdx`
- Create: `docs-site/src/content/docs/en/power-user/*.mdx`
- Create: `docs-site/src/content/docs/en/deployment/*.mdx`
- Create: `docs-site/src/content/docs/en/faq/*.mdx`

**Interfaces:**

- Consumes: Task 5 与 Task 6 的中文文档体系
- Produces: 结构、slug 与内容完全对齐的英文 MDX 文档集

- [ ] **Step 1: 编写英文快速上手与模型篇文档**
  - 对照 Task 5 的中文内容，在 `docs-site/src/content/docs/en/` 下输出对应英文指南。

- [ ] **Step 2: 编写英文工具、极客、部署与排错篇文档**
  - 对照 Task 6 的中文内容，在 `docs-site/src/content/docs/en/` 下输出对应英文指南。

- [ ] **Step 3: 运行完整双语构建并检查未翻译回退**

运行：

```bash
pnpm --filter docs-site build
```

确保全量中英文路由均正确生成静态 HTML。

- [ ] **Step 4: 提交英文文档代码**

```bash
git add docs-site/src/content/docs/en/
git commit -m "docs: achieve full English bilingual parity for all chapters"
```

---

### Task 8: 全量构建验收、离线检索验证与提交 (Verification & Final Acceptance)

**Files:**

- Modify: `README.md:1-50` (添加官方文档站点入口链接)
- Modify: `README.en.md:1-50`

**Interfaces:**

- Consumes: Task 1 到 Task 7 的全部构建产物
- Produces: 具备离线检索能力的发布包 `docs-site/dist/`，并在 README 中更新入口

- [ ] **Step 1: 验证生产环境纯静态全量构建**

在仓库根目录执行：

```bash
pnpm run docs:build
```

预期结果：

1. Astro 成功生成 `docs-site/dist/`。
2. Pagefind 自动完成多语言索引构建，在输出中看到 `[pagefind] Indexed ... pages`。
3. 零 TypeScript 类型报错。

- [ ] **Step 2: 验证离线本地预览**

在仓库根目录执行：

```bash
pnpm run docs:preview
```

打开本地地址，验证：

1. 首页 Splash 视觉效果及按钮跳转正确。
2. 侧边栏 6 大板块折叠与跳转正常。
3. 中英文一键平滑切换，URL 正确由 `/` 切换为 `/en/`。
4. 全文检索（搜索快捷键 `/` 或 `Cmd+K`）：分别输入中文和英文关键词，搜索结果高亮准确。
5. `<EnvConfigGenerator />` 与 `<SlashCommandFinder />` 交互功能完好。

- [ ] **Step 3: 在 `README.md` 与 `README.en.md` 顶部增加文档站点 Badge**

在徽章区域增加：

```markdown
<a href="https://all-model-chat-docs.pages.dev/" target="_blank">
  <img src="https://img.shields.io/badge/官方文档-Documentation-8b5cf6?style=for-the-badge&logo=astro&logoColor=white" alt="Documentation">
</a>
```

- [ ] **Step 4: 最终 Git 提交**

```bash
git add README.md README.en.md
git commit -m "docs: update README with official documentation site references"
```
