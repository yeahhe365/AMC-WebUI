# Implementation Plan: Batch Model Health Check & Rich Provider Catalog

借鉴 Cherry Studio 的架构与用户体验，实现两个核心能力：

1. **方案一：模型批量健康测活（Batch Model Health Check & Latency Benchmark）**
2. **方案二：扩充预设服务商模板库（Rich Provider Templates Catalog）**

---

## 架构与模块拆分

### 1. 模型测活模块 (`src/utils/model/modelHealthCheck.ts`)

- **单个模型测活 (`probeModelHealth`)**:
  - 对指定的 `ThirdPartyConnection` 与 `ModelOption` 发送超轻量非流式探测请求（1~2 token，`max_tokens: 2` 或最小请求）。
  - 根据协议（OpenAI 兼容 / Anthropic / OpenAI Responses）发起探测。
  - 精确记录往返延迟 `latencyMs`。
  - 遇到错误时，自动解析状态码并生成诊断提示（如 401 密钥失效、404 模型未部署或不存在、429 配额不足或限流、500 服务端故障、超时等）。
- **批量并发测活队列 (`runBatchModelHealthCheck`)**:
  - 支持传入模型列表和连接配置。
  - 限制并发度（默认并发 3），避免突发高频触发服务商 QPS 限流。
  - 配合 `AbortController` 支持用户随时中止。
  - 回调式实时进度流通知（`onResult(modelId, result)`, `onProgress(completed, total)`）。

### 2. 批量测活 UI 交互 (`src/components/settings/sections/providers/ProviderDetail.tsx`)

- **模型区域操作栏**:
  - 增加「批量测活」按钮（携带实时加载指示器与中止按钮）。
  - 测活中实时显示进度：`测活中 (3/15)`。
- **单模型行实时状态展示**:
  - 状态徽标：
    - 成功：带绿/黄/橙呼吸点及毫秒数（如 `180ms`, `850ms`, `2.1s`）。
    - 失败：带红点及简短状态（如 `404`、`429`、`失败`），Tooltip 显示诊断详情。
  - 单模型微型复测按钮：鼠标悬停时可单独对该模型重新触发测活。
- **测活完成后的批量操作**:
  - 若有失败模型，展示快捷操作栏：「检测完成：X 个正常，Y 个异常」，并提供「一键停用失效模型」按钮（批量将其 `visibleInSelector` 设为 `false`）。

### 3. 扩充服务商模板库 (`src/utils/thirdPartyApiProviders.ts` & `ProviderAddModal.tsx`)

- **扩充主流服务商预设**:
  - **国内主流**：
    - `baichuan` (百川智能, `https://api.baichuan-ai.com/v1`)
    - `stepfun` (阶跃星辰, `https://api.stepfun.com/v1`)
    - `yi` (零一万物, `https://api.lingyiwanwu.com/v1`)
    - `doubao` (火山引擎/豆包, `https://ark.cn-beijing.volces.com/api/v3`)
  - **海外顶尖与聚合平台**:
    - `mistral` (Mistral AI, `https://api.mistral.ai/v1`)
    - `perplexity` (Perplexity, `https://api.perplexity.ai`)
    - `cerebras` (Cerebras 极速推理, `https://api.cerebras.ai/v1`)
    - `fireworks` (Fireworks AI, `https://api.fireworks.ai/inference/v1`)
  - **网关中转与分发**:
    - `new-api` (OneAPI / NewAPI 统一中转, 自定义端点)
- **预设内容包含**:
  - 官方 Endpoint URL、协议模式、推荐主打模型（含 contextWindow、thinking/tools 标记）、API Key 申请直达网址、官方开发文档直达网址。

---

## 详细实施步骤

### Step 1: 实现模型测活引擎 `modelHealthCheck.ts` 与单元测试

1. 创建 `src/utils/model/modelHealthCheck.ts`。
2. 实现 `probeModelHealth` 与 `runBatchModelHealthCheck`。
3. 创建 `src/utils/model/modelHealthCheck.test.ts`，覆盖成功测试、各类 HTTP 错误（401/404/429）、超时处理与并发队列控制。

### Step 2: 扩展服务商模板体系与类型定义

1. 在 `src/types/settings.ts` 中更新 `ThirdPartyTemplateId` 联合类型。
2. 在 `src/utils/thirdPartyApiProviders.ts` 中新增模板元数据定义、默认端点、默认模型与文档链接。
3. 在 `ProviderAddModal.tsx` 中配置新模板的展示卡片与筛选分类。
4. 更新并验证 `thirdPartyApiProviders.test.ts`。

### Step 3: 在 `ProviderDetail.tsx` 中集成批量测活与单模型测活 UI

1. 在 `ProviderDetail.tsx` 中维护测活状态映射表 `Record<string, ConnectionHealthProbeResult>` 与 `isCheckingBatch` 进度。
2. 在头部操作栏添加「批量测活」与「中止」按钮。
3. 在模型列表项中展示延迟徽章及单模型测试按钮。
4. 在测活完成后提供「一键停用失效模型」功能。
5. 编写/更新 `ProviderDetail.test.tsx`。

### Step 4: 编译检查、全面测试验证与 Docker 部署

1. 运行 `pnpm typecheck`。
2. 运行所有相关单元测试与 i18n 测试。
3. 运行 `pnpm build && pnpm build:api`。
4. 重建部署 Docker Compose，并验证服务状态。
