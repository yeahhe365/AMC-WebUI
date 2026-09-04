# AMC WebUI

<p align="center">
  <a href="./README.md">中文</a> | <a href="./README.en.md">English</a>
</p>

<div align="center">

  <p>
    <strong>All-in-one Model Console WebUI，以 Gemini 原生能力为主，同时支持 OpenAI 兼容标准聊天 API</strong>
  </p>

  <p>
    <a href="https://all-model-chat.pages.dev/" target="_blank">
      <img src="https://img.shields.io/badge/在线演示-Live_Demo-6366f1?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Online Demo">
    </a>
    <a href="https://github.com/yeahhe365/AMC-WebUI/actions/workflows/ci.yml" target="_blank">
      <img src="https://img.shields.io/github/actions/workflow/status/yeahhe365/AMC-WebUI/ci.yml?branch=main&style=for-the-badge&label=CI" alt="CI">
    </a>
    <a href="https://github.com/yeahhe365/AMC-WebUI/releases" target="_blank">
      <img src="https://img.shields.io/github/v/release/yeahhe365/AMC-WebUI?style=for-the-badge&color=3b82f6" alt="Release">
    </a>
    <img src="https://img.shields.io/badge/许可证-MIT-green?style=for-the-badge" alt="License">
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind-4.2-38BDF8?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind">
    <img src="https://img.shields.io/badge/Gemini_SDK-1.50%2B-8E75B2?style=flat-square&logo=google&logoColor=white" alt="Gemini SDK">
    <img src="https://img.shields.io/badge/PWA-Supported-5A0FC8?style=flat-square&logo=pwa&logoColor=white" alt="PWA">
  </p>

</div>

---

## 界面预览

<p align="center">
  <img src="./docs/screenshots/app-desktop-20260426.png" alt="AMC WebUI 桌面端界面预览" width="100%">
</p>

## 项目简介

**AMC WebUI** 是一款基于 React 18 的 All-in-one Model Console WebUI，主打 Google Gemini 原生能力，并提供额外的 **OpenAI 兼容标准聊天模式**。项目坚持 **Local-First** 原则：聊天数据默认存储于浏览器 IndexedDB，在保障隐私的同时提供流畅体验；同时支持独立后端部署模式，用于服务端托管 Gemini 密钥与代理请求。

当前仓库围绕 **Vite + React SPA** 作为唯一主线构建形态：

- **标准模式**：本地通过 Vite 开发 / 构建，适合日常开发与静态部署
- **Docker 部署模式**：`web + api` 双服务部署，普通 Gemini 请求走 `/api/gemini/*`，第三方兼容接口走 `/api/openai/*`，Live API 走 `/api/live` 的 WebSocket 全代理
- **静态前端 + 独立 API 模式**：前端部署到 Pages/CDN，后端单独托管 Node API 服务

> 📢 **Gemini Robotics-ER 模型迁移公告（2026-08-01）**
> 项目已停止支持 `gemini-robotics-er-1.6-preview`（该模型已于 **2026-08-31** 停服），内置模型已迁移至 **`gemini-robotics-er-2-preview`**，全项目统一由常量 `ROBOTICS_MODEL`（`src/constants/modelConfiguration.ts`）定义。
> 使用 Robotics 模型前：1) 请确保 `GEMINI_API_KEY` 已在 [AI Studio](https://aistudio.google.com/api-keys) 添加 API 限制，无限制 Key 会返回 `403 Forbidden`；2) 建议 `thinking_level` 默认 `medium`（延迟与性能平衡），仅高精度空间任务使用 `high`；3) 高精度场景可对同一输入多次查询取平均以降低方差。

## API 模式说明

### Gemini 原生模式

- 项目的主能力路径，适用于 Thinking、Live API、Gemini Files API、Deep Search、Google Search、代码执行、图片生成等 Gemini 专属能力
- 可结合 AMC 自带的 Gemini 代理与服务端托管密钥能力使用

### OpenAI 兼容模式

- 面向 **标准聊天** 的兼容路径，使用独立的 API Key、Base URL 和模型列表
- 请求会发送到 `POST {Base URL}/chat/completions`，适用于 OpenAI 官方接口、Gemini 的 OpenAI 兼容端点，或其他兼容 `chat/completions` 的服务
- 支持普通响应与流式响应，并保留系统提示词、`temperature`、`top_p` 等通用聊天参数

### 需要注意

- OpenAI 兼容模式 **不会覆盖** Gemini 原生配置；两套 Key 分开保存，模型列表也独立维护
- OpenAI 兼容模式当前 **不走 Gemini 原生工具链**；README 中提到的 Gemini 专属能力，仍以 Gemini 原生模式为准
- OpenAI 兼容 Base URL 应填写到接口根路径，例如 `https://api.openai.com/v1`；应用会自动补上 `/chat/completions`

---

## 核心功能

### 深度推理 (Thinking)

- 支持 Gemini 3.x 系列模型的思维链可视化
- 可设置 **Token 预算** 或 **推理等级** (Minimal / Low / Medium / High)
- 实时查看 AI 的逻辑演算过程

### 实时音视频 (Live API)

- 双向实时流式交互，支持语音通话
- 屏幕共享与视觉识别
- 音频可视化 (AudioWorklet API)

### Live Artifacts

- 代码块自动识别并渲染为交互式 HTML 预览（自动全屏）
- 支持安全内联 HTML / SVG、表单控件与 follow-up 交互
- 支持 Mermaid 流程图与 Graphviz 图渲染
- 自动 Live Artifacts 生成模式（可配置触发模型、提示词版本与自定义提示词）

### 高级文件处理

- 浏览器端音频预处理与压缩流程，尽量降低音频上传的 Token 与带宽消耗
- 支持 ZIP / 文件夹拖入，自动解析代码库结构
- 支持图片、PDF、视频、音频、文本等多种文件类型
- 可配置各文件类型使用 Gemini Files API 还是直接 Base64 上传
- 输入细节等级可调（未指定 / Low / Medium / High；图片单文件可选 Ultra High）

### 生产力工具链

- **深度搜索**：聚合 Google Search，自动规划搜索任务并提供精准引用
- **URL 上下文**：自动抓取 URL 内容作为对话上下文
- **本地 Python 沙箱**：基于 Pyodide (WASM) 的浏览器端 Python 运行环境
  - 预加载 numpy、pandas、matplotlib
  - 自动检测代码依赖，并在需要时按需安装 scipy、scikit-learn 等包
  - 支持文件挂载与生成文件下载
  - matplotlib 图表自动捕获输出
- **TTS 语音合成**：30 种语音可选
- **语音转录**：通过 Gemini 3.5 Transcribe 模型进行语音转文字
- **Gemini 原生图片生成（Nano Banana）**：支持宽高比、尺寸与四图生成

### 企业级 API 管理

- **双 API 模式**：支持在 Gemini 原生 与 OpenAI 兼容 两条请求路径之间切换
- **多 Key 轮询**：Gemini 原生 Key 与 OpenAI 兼容 Key 均支持多 Key 轮询
- **配置隔离**：OpenAI 兼容模式使用独立 Key、独立 Base URL、独立模型列表，不会污染 Gemini 设置
- **Gemini API 代理**：Gemini 原生模式支持通过 SDK 原生 `baseUrl` 配置接入自定义 Gemini API 代理

### 多语言界面

- 支持英文 / 中文 / 日文 / 韩文 / 西班牙文 / 法文 / 德文共七种界面语言，并可跟随系统自动切换
- 覆盖所有 UI 组件（聊天、设置、侧边栏、快捷键等）

### PWA 支持

- 提供完整 Web App Manifest、Service Worker 与安装/更新提示
- 可安装为桌面/移动端应用，并支持离线打开应用 Shell
- 运行时接口请求保持网络优先，模型响应与远端 API 能力仍需联网
- 支持画中画 (Picture-in-Picture) 模式

### 日志价格统计

- 日志与用量页采用“严格精确”模式：只有在已存储字段足以精确还原官方费用时才显示价格
- 新生成的聊天、TTS、转写与部分图片生成请求会记录更完整的计费元数据
- 纯文本聊天请求会在本地补齐 `TEXT -> TEXT` 模态证据，因此纯文本 `gemini-3.1-pro-preview`、`gemini-3.6-flash`、`gemini-3.5-flash-lite` 等对话可显示价格
- 历史记录或缺少精确定价字段的请求会继续显示 `—`

### 多标签同步

- 基于 BroadcastChannel 的跨标签页同步，并通过 Web Locks API 保护 IndexedDB 写入
- 确保多标签页同时操作时数据一致性

### 自定义快捷键

- 内置快捷键系统，支持新建聊天、打开日志、切换模型、画中画等操作
- 所有快捷键均可自定义覆盖

### 安全设置

- 4 个安全过滤类别：骚扰、仇恨言论、色情内容、危险内容
- 每个类别可独立配置过滤级别（关闭 / 不拦截 / 拦截少量 / 拦截部分 / 拦截大部分）
- 默认全部为「关闭」，与 Gemini 2.5 / 3 系列模型的官方默认值一致

### 主题系统

- 内置 Onyx（暗色）、Graphite（灰色）、Pearl（亮色）主题
- 支持跟随系统主题自动切换

### 数据管理

- 完整的聊天记录导入 / 导出
- 会话分组管理
- 会话搜索（标题 + 内容全文搜索）
- 开发者日志面板（API 调用监控、Token 用量统计）

---

## 快速开始

### 方式一：标准开发模式

本地开发推荐使用 Node.js 26（仓库提供 `.nvmrc`，CI 主流程使用同一主版本），最低支持 Node.js 24。Docker 镜像基于 `node:24-slim` 构建。仓库启用了 `engine-strict`，如果你使用 Node 27+ 或 23 及以下版本，`npm install` 会直接失败；建议先执行 `nvm use` 使用推荐版本。

```bash
# 克隆仓库
git clone https://github.com/yeahhe365/AMC-WebUI.git
cd AMC-WebUI

# 安装依赖
npm ci

# 启动开发服务器
npm run dev
```

如需分析生产包体积，可执行：

```bash
npm run build:analyze
```

命令会生成 `dist/bundle-stats.html`，用于查看主包、懒加载 chunk 与 PWA 预缓存边界。

访问 `http://localhost:5175`，在 **设置 -> API 配置** 中填入你的 Gemini API Key。

除了在界面中手动配置，也可在根目录创建 `.env.local`（仅前端开发模式使用）：

```bash
GEMINI_API_KEY=your_api_key_here
VITE_OPENAI_API_KEY=your_openai_compatible_key_here
```

如需切换到 OpenAI 兼容模式：

1. 进入 **设置 -> API 配置**，将 API 模式切换为 **OpenAI 兼容**
2. 填写 OpenAI 兼容 API Key，或在 `.env.local` 中预置 `VITE_OPENAI_API_KEY`
3. 填写 OpenAI 兼容 Base URL，例如 `https://api.openai.com/v1`
4. 进入 **设置 -> 模型**，选择或编辑该模式下独立维护的模型列表

示例 Base URL：

- OpenAI 官方：`https://api.openai.com/v1`
- Gemini OpenAI 兼容端点：`https://generativelanguage.googleapis.com/v1beta/openai`
- 其他兼容服务：填写其 `chat/completions` 所属的 `/v1` 或等价根路径

### 方式二：Docker Compose（自用推荐）

项目包含双容器部署：

- `web`：Node 轻量服务托管前端静态资源，并反向代理 `/api/*` 到 `api` 服务
- `api`：Node 服务，提供 `/api/gemini/*` 代理

运行方式：

```bash
# 在仓库根目录
npm run build:docker
docker compose up -d --build
```

默认访问 `http://localhost:8080`。如需关闭后台运行可执行 `docker compose down`。

说明：

- Docker 默认是 BYOK 自用模式：启动后在 **设置 -> API 配置** 填入 Gemini API Key 即可使用普通聊天、Live API 与第三方兼容接口，不需要在 `.env` 或 `docker-compose.yml` 里配置 `GEMINI_API_KEY` 或 `THIRD_PARTY_ROUTES`。服务端 Key 仅在浏览器未携带 Key 时兜底。
- `web` 镜像默认直接打包宿主机已生成的 `dist/`，不再在容器内执行前端生产构建。
- 修改前端或后端 API 代码后，请先重新执行 `npm run build:docker`，再执行 `docker compose up -d --build`。

> ⚠️ 安全边界说明
> 当前 `web + api` 代理方案定位为 **受信任/自托管环境**（trusted self-hosted deployment）。
> 默认 BYOK 模式会使用浏览器设置里的 API Key 发起请求；它**本身并不足以**作为公开互联网下“无鉴权多用户 API 网关”。
> 若要对公网开放，请额外引入鉴权、配额/限流、滥用防护、审计与租户隔离等能力。

### 运行时配置与环境变量

> 📌 **Gemini Robotics-ER 模型的 API Key 前置条件**（`gemini-robotics-er-2-preview` 等 Robotics 端点）：Google 要求该模型的 API Key **必须已在 [AI Studio](https://aistudio.google.com/api-keys) 添加 API 限制**（restriction），无限制的 Key 会被拒绝并返回 `403 Forbidden`。使用 Robotics 模型前请在 AI Studio 为对应 Key 配置限制（如限定项目/域名），并在部署文档与 CI secrets 说明中同步该要求。

部署时请区分两类配置：

| 变量名                          | 用途                                                                  | 公开性             | Docker 默认值                               |
| :------------------------------ | :-------------------------------------------------------------------- | :----------------- | :------------------------------------------ |
| `GEMINI_API_KEY`                | 可选的服务端托管 Gemini API Key；浏览器 BYOK 优先，留空则回落此 Key   | **仅服务端**       | 空                                          |
| `PORT`                          | `api` 服务监听端口                                                    | 仅服务端           | `3001`                                      |
| `GEMINI_API_BASE`               | Gemini 上游地址（代理目标）                                           | 仅服务端           | `https://generativelanguage.googleapis.com` |
| `ALLOWED_ORIGINS`               | 逗号分隔 CORS 白名单（跨域部署时使用）                                | 仅服务端           | 空                                          |
| `ENABLE_MCP_STDIO`              | 启用 `stdio` MCP 服务调用能力                                         | 仅服务端           | `false`                                     |
| `ENABLE_MCP_PRIVATE_HTTP`       | 允许 API 服务访问内网/本机 HTTP MCP 地址                              | 仅服务端           | `false`                                     |
| `ENABLE_LIVE_WS_PROXY`          | 启用 `/api/live` WebSocket 全代理（Docker 默认开启）                  | 仅服务端           | `true`                                      |
| `LIVE_WS_IDLE_TIMEOUT_MS`       | Live WS 空闲回收时间（毫秒）                                          | 仅服务端           | `300000`                                    |
| `SERVER_KEY_PRIORITY`           | Key 优先级：`false`=浏览器 BYOK 优先·服务端兜底；`true`=服务端优先    | 仅服务端           | `false`                                     |
| `THIRD_PARTY_ROUTES`            | JSON：provider → { baseUrl, apiKey } 第三方路由表（仅 https、非私网） | 仅服务端           | 空                                          |
| `RUNTIME_SERVER_MANAGED_API`    | 前端默认启用服务端托管 API                                            | **公开运行时配置** | `true`                                      |
| `RUNTIME_USE_CUSTOM_API_CONFIG` | 前端默认启用“自定义 API 配置”                                         | 公开运行时配置     | `true`                                      |
| `RUNTIME_USE_API_PROXY`         | 前端默认启用 API 代理                                                 | 公开运行时配置     | `true`                                      |
| `RUNTIME_API_PROXY_URL`         | 前端默认 Gemini 代理地址                                              | 公开运行时配置     | `/api/gemini`                               |
| `RUNTIME_LIVE_API_BASE_URL`     | 前端 Live API 代理地址（留空则浏览器直连官方 WS）                     | 公开运行时配置     | `/api/live`                                 |
| `RUNTIME_THIRD_PARTY_PROXY_URL` | 前端第三方兼容接口代理地址（留空则浏览器直连 provider）               | 公开运行时配置     | `/api/openai`                               |
| `RUNTIME_PYODIDE_BASE_URL`      | 可选 Pyodide 运行时资源地址；留空时使用同源 `/pyodide/`               | 公开运行时配置     | 空                                          |

说明：

- 上述 `RUNTIME_*` 会在容器启动时写入 `runtime-config.js`，可被浏览器读取，因此只能放“可公开”信息。
- public/runtime-config.js 模板用于纯静态构建，默认不启用自定义 API 配置或代理；Docker 部署会由 `docker/web-server.js` 在容器启动时按上表默认值覆盖该文件。
- Pyodide 产物会在生产构建时复制到 `dist/pyodide/`，运行时默认从同源 `/pyodide/` 加载；如需改用 CDN 或独立静态域，可将 `RUNTIME_PYODIDE_BASE_URL` 设置为完整目录 URL，例如 `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`。
- PWA 预缓存默认排除 `pyodide/` 大体积产物，首次执行本地 Python 时仍会按上述地址按需加载。
- 默认 BYOK 模式只需要在设置界面填写 API Key：普通 Gemini 代理会使用浏览器请求携带的 key；Live API 走 `/api/live` 的 WebSocket 全代理，由 `api` 容器桥接到官方 `wss://generativelanguage…/BidiGenerateContent`，浏览器 Key 存在时优先透传（BYOK 兜底），否则回落服务端 `GEMINI_API_KEY`。
- 如需服务端统一托管普通 Gemini 请求的 key，可配置 `GEMINI_API_KEY` 并将 `RUNTIME_SERVER_MANAGED_API=true`；Live API 与第三方接口同样遵循「浏览器 Key 优先·服务端兜底」（除非显式设 `SERVER_KEY_PRIORITY=true`）。
- MCP 的 `stdio` 与内网/本机 HTTP 访问默认关闭；仅在可信自托管环境中按需设置 `ENABLE_MCP_STDIO=true` 或 `ENABLE_MCP_PRIVATE_HTTP=true`。
- 第三方兼容接口（OpenAI / DeepSeek / Anthropic / OpenRouter / Qwen / Kimi / GLM / Custom）经 `/api/openai/*` 转发，按请求头 `x-third-party-provider` 在 `THIRD_PARTY_ROUTES` 路由表中查上游，仅接受 https、非私网 host；浏览器 Key 优先、缺失时回落路由表里的服务端 Key。静态部署（Pages）不注入 `RUNTIME_THIRD_PARTY_PROXY_URL`，前端自动回退浏览器直连 provider。
- 浏览器本地 key 适合自用/可信部署。它不会因为“保存在本地”而变成服务器密钥，同一浏览器上下文中的脚本、扩展、XSS 或设备风险仍可能读取它。
- 前端在 Docker 部署时依赖后端端点：`/api/gemini/*`、`/api/openai/*`、`/api/live`（WS）；静态部署（Pages）不注入这些 runtime 地址，前端自动回退浏览器直连官方 Live/第三方上游。
- 全部新行为由 env 门控：置 `ENABLE_LIVE_WS_PROXY=false` 并清空 `RUNTIME_LIVE_API_BASE_URL` 即恢复 Live 浏览器直连；清空 `THIRD_PARTY_ROUTES` 与 `RUNTIME_THIRD_PARTY_PROXY_URL` 即恢复第三方直连，无需改代码重构建。

### 方式三：Cloudflare Pages（静态前端）+ 独立 API 服务

可将前端部署在 Cloudflare Pages，同时将 `server/` 独立部署到任意 Node 运行环境（VM、容器平台、Serverless 容器等）：

1. 前端（Pages）执行标准构建并发布 `dist`：

```bash
npm run build
```

2. 后端（独立服务）构建并启动：

```bash
npm run build:api
npm run start:api
```

3. 在前端运行时配置中将以下值指向后端公开地址（示例）：

```text
RUNTIME_API_PROXY_URL=https://your-api.example.com/api/gemini
```

4. 如需服务端统一托管普通 Gemini 请求的密钥，在后端环境设置 `GEMINI_API_KEY`；如果使用 BYOK，可不设置该变量。跨域部署时按需配置 `ALLOWED_ORIGINS=https://your-pages-domain.pages.dev`。Live API 不使用独立 API 服务的 token 端点，而是从浏览器直连。

补充：

- `server/` 当前承载的是 Gemini 原生代理链路；OpenAI 兼容模式默认不会经过这个 Node API 服务
- 如果你希望 OpenAI 兼容模式也走自建网关，请把该网关的兼容 Base URL 直接填到前端设置中

#### 可选：使用 AIStudioToAPI 作为 Gemini 兼容后端

如果你希望通过 Google AI Studio 网页端账号提供 API 来源，也可以尝试将 [AIStudioToAPI](https://github.com/iBUHub/AIStudioToAPI) 部署为第三方 Gemini 兼容后端。它提供 Gemini Native API 格式的 `/v1beta/*` 接口，可作为 AMC WebUI 的自定义 API 代理地址。

示例：

```text
RUNTIME_API_PROXY_URL=https://your-aistudio-to-api.example.com/v1beta
```

在界面中也可以进入 **设置 -> API 配置**，启用“自定义 API 配置 / API 代理”，并填入 AIStudioToAPI 的 Gemini 兼容 Base URL（例如 `http://localhost:7860/v1beta`）。AMC WebUI 中填写的 API Key 应与 AIStudioToAPI 部署时配置的 `API_KEYS` 对应。

注意：AIStudioToAPI 属于第三方项目，请自行评估账号登录、鉴权、限流与公网暴露风险；它可替代普通 Gemini API 代理来源。AMC WebUI 的 Live API 当前采用浏览器直连官方 Live 服务，不再依赖 AMC 后端 token 端点。

### 构建与预览

```bash
npm run build    # 构建生产版本
npm run preview  # 本地预览构建结果
```

### 质量检查

```bash
npm run typecheck
npm run lint
npm run test
npm run knip
npm run build
npm run build:api

# 或者一次性执行
npm run verify
```

如果只想验证 Gemini Code Execution 相关链路，可以执行：

```bash
npm run test:code-execution
```

这个命令覆盖：

- 文本 / CSV / 代码文件的 MIME 与上传策略
- Code Execution 请求构造与多轮历史回放
- 流式 `thoughtSignature` 保留
- Live API 中 `codeExecutionResult.output` 展示

如果你想用真实 `GEMINI_API_KEY` 做一次手动联调检查，也可以执行：

```bash
GEMINI_API_KEY=your_key_here npm run verify:code-execution:api
```

可选环境变量：

- `CODE_EXECUTION_MODEL`：覆盖默认模型（默认 `gemini-3.8-flash`）

这个脚本会：

- 上传一个临时 CSV 文件，并显式使用 `text/csv`
- 发起一次启用 `codeExecution` 的请求
- 检查响应里是否同时出现 `executableCode` 和 `codeExecutionResult`
- 复用第一轮完整模型内容发起第二轮追问，验证多轮历史可继续使用

---

## 技术架构

| 层级            | 技术栈                                                                                   |
| :-------------- | :--------------------------------------------------------------------------------------- |
| **核心框架**    | React 18 + TypeScript 5.5 + Vite 7                                                       |
| **样式方案**    | Tailwind CSS 4 + CSS 变量主题系统                                                        |
| **持久化层**    | 原生 IndexedDB（dbService.ts 封装），支持 Web Locks 跨标签写锁                           |
| **Gemini SDK**  | `@google/genai` 1.50+，含流式 / 非流式消息、文件上传、图片生成、TTS、转录                |
| **音频引擎**    | AudioWorklet API（实时流处理）+ 浏览器端 Worker 音频预处理 / 压缩流程                    |
| **渲染引擎**    | React-Markdown + KaTeX (公式) + Highlight.js (代码高亮) + Mermaid.js + Graphviz (viz.js) |
| **Python 沙箱** | Pyodide (WASM)，Web Worker 内执行，预加载常用科学计算库并按需安装扩展包                  |
| **API 代理**    | 基于 `@google/genai` SDK `httpOptions.baseUrl` 的 Gemini API 代理配置                    |
| **PWA**         | Web App Manifest + `beforeinstallprompt` / `appinstalled` 安装事件处理                   |
| **部署形态**    | Vite 标准构建 / Docker Compose（web+api）/ Cloudflare Pages + 独立 API                   |

生产部署若采用服务端托管普通 Gemini API，前端默认请求后端端点：

- `/api/gemini/*`

Live API 在静态部署下由浏览器使用本地 API Key 直连官方 Live 服务；Docker 部署默认走 `/api/live` 的 WebSocket 全代理。

---

## 项目结构

核心前端目录包括 `src/components/`、`src/features/`、`src/hooks/`、`src/services/`、`src/i18n/`、`src/pwa/`、`src/schemas/` 与 `src/test/`。仓库顶层还有前后端共用的 `shared/`、Vite 插件配置 `vite/`，以及脚本目录 `scripts/`。

放置规则：

- `src/components/` 只放可渲染 UI 与 UI 专属的小型 view model；跨页面复用的控件放 `components/shared/`。
- `src/features/` 放领域能力的实现边界，例如消息发送、本地 Python、音频处理、标准聊天工具循环。
- `src/hooks/` 放 React 编排层；如果 hook 只是某个领域能力的 React 入口，优先靠近对应领域目录命名。
- `src/services/` 放外部系统与持久化边界，例如 API client、IndexedDB、日志和对象 URL 生命周期。
- `src/utils/` 放无 React 状态的小型跨域工具；相关工具按领域分子目录（如 `utils/model/`、`utils/file/`、`utils/live-artifacts/`、`utils/export/`），避免笼统的 `*Helpers` 桶文件。
- `src/test/architecture/` 放结构和风格护栏测试，用来防止历史清理问题回流。
- `shared/` 放 web 与 Node API 共用的纯逻辑（例如 image proxy、MCP 配置、私网判断）。
- `src` 内跨目录引用统一使用 `@/` alias，同目录引用保留 `./`。

聊天与消息相关目录边界：

- `components/chat/`：会话外壳（输入区、消息列表编排、拖放遮罩）。
- `components/chat/message-list/`：消息列表入口与滚动/选区/欢迎页等列表级 UI。
- `components/message/`：单条消息气泡、Markdown、附件与导出按钮等。
- `hooks/chat/message/`：单条消息操作与 TTS 等 React 编排。
- `components/audio/` + `features/audio/`：录音 UI 与音频处理能力（域名统一为 audio）。
- `components/pwa/`：PWA 相关 UI（如更新横幅）；`src/pwa/`：Service Worker 与安装运行时。

```
AMC-WebUI/
├── src/                        # 前端应用源码（Vite SPA）
│   ├── components/             # UI 组件（chat / message / layout / settings / modals / audio 等）
│   ├── features/               # 本地 Python（src/features/local-python/）、消息发送、场景、音频、标准聊天等业务能力
│   ├── hooks/                  # 业务 hooks（app / chat / chat-input / data-management / live-api / ui）
│   ├── services/               # API、IndexedDB、日志、对象 URL 等基础设施
│   ├── stores/                 # Zustand 状态（chat / settings / ui）
│   ├── utils/                  # 领域子目录工具（model / file / live-artifacts / export / chat 等）
│   ├── i18n/                   # 翻译聚合、覆盖率测试与多语言文案
│   ├── pwa/                    # Service Worker、PWA 注册与安装状态
│   ├── runtime/                # 运行时配置读取与公开配置映射
│   ├── schemas/                # Zod 配置 schema
│   ├── contexts/               # I18n / WindowContext 等上下文
│   ├── constants/              # 模型、提示词、快捷键、主题等常量
│   ├── test/                   # 测试工具、fixtures 与架构回归测试
│   ├── types/                  # TypeScript 类型定义
│   ├── styles/                 # 全局样式、动画、Markdown 样式
│   ├── App.tsx                 # 应用入口组件
│   └── index.tsx               # React 挂载入口
├── server/                     # 独立 Node API（/api/gemini/*）
│   ├── src/
│   └── tsconfig.json
├── shared/                     # 前后端共用纯逻辑（image proxy、MCP、私网等）
├── vite/                       # Vite 插件与分包配置
├── scripts/                    # 测试/校验辅助脚本
├── public/                     # 静态资源与 runtime-config.js 模板
├── e2e/                        # Playwright 端到端测试
├── docs/                       # 截图、model-logos 等文档资源（运行时图标见 src/assets/model-icons/）
├── docker/                     # 部署辅助脚本（如 web-server.js）
├── vite.config.ts              # Vite 配置（React、静态复制、手工分包）
├── playwright.config.ts        # E2E 配置
├── vitest.config.ts            # 单元/集成测试配置
├── eslint.config.js            # ESLint 配置
├── knip.json                   # 未使用文件/导出分析配置
├── package.json                # 前端依赖与脚本
└── docker-compose.yml          # web + api 双服务部署入口
```

---

## Gemini 原生默认模型

OpenAI 兼容模式使用独立模型列表，可在设置中手动维护或从兼容端点拉取；下表列出应用内置的 Gemini 原生默认模型。

| 类型           | 模型                                                                                                                              |
| :------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini 3.x** | gemini-3.8-flash, gemini-3.5-flash-lite, gemini-3.1-flash-live-preview, gemini-3.5-live-translate-preview, gemini-3.1-pro-preview |
| **Robotics**   | gemini-robotics-er-2-preview                                                                                                      |
| **Gemma 4**    | gemma-4-31b-it, gemma-4-26b-a4b-it                                                                                                |
| **图片生成**   | gemini-3-pro-image-preview, gemini-3.1-flash-image-preview, gemini-3.1-flash-lite-image                                           |
| **TTS**        | gemini-3.1-flash-tts-preview (30 种语音)                                                                                          |

---

## 参与贡献

我们欢迎任何形式的贡献！

1. **报告问题**：提交 [GitHub Issue](https://github.com/yeahhe365/AMC-WebUI/issues)
2. **代码贡献**：Fork 仓库 -> 创建特性分支 -> 提交 Pull Request
3. **支持作者**：点个 **Star** 或前往 [爱发电](https://afdian.com/a/gemini-nexus) 支持持续开发

---

## 友链

- [Linux.do](https://linux.do/)：也称 L 站，是一个活跃的中文技术社区，围绕 AI、软件开发、资源分享与前沿资讯展开讨论；社区愿景是“新的理想型社区”，社区文化是“真诚、友善、团结、专业，共建你我引以为荣之社区”。

---

<div align="center">
  <p>Developed with :heart: by <strong>yeahhe365</strong></p>
</div>
