# 2026-10-23 优化与运维说明

基线：`d0acd47add52db7b91517aa9ce0a8f74b148a5d0`（1.23.0）。本轮保持现有 React/Vite、Node API 和 IndexedDB 架构，按审计的 22 项问题修正边界、数据一致性与资源开销。

## 审计对应实现

| 项  | 问题                                  | 实现与主要回归                                                                   |
| --- | ------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | 浏览器自定义地址收到服务端 Gemini Key | 服务端选中的 Key 仅使用管理员 `GEMINI_API_BASE`，普通与 journal 请求均覆盖       |
| 2   | 规范化 mapped IPv6 绕过私网检查       | 规范化 IPv6 与内嵌 IPv4，覆盖十六进制及 IPv4 映射形式                            |
| 3   | DNS 检查未绑定实际连接                | Undici dispatcher 在 socket lookup 检查实际返回的所有地址；保留 Host/TLS SNI     |
| 4   | MCP 重定向泄露认证信息                | 拒绝跨源和 HTTPS 降级重定向；同源跳转继续验证网络策略                            |
| 5   | 异常 URL 使 Web 进程退出              | HTTP 与 upgrade 路径捕获 URL 错误返回 400，子进程存活回归                        |
| 6   | 文件库并发读改写覆盖                  | 元数据、payload、删除标记位于同一 IndexedDB 事务，覆盖交错上传与删除             |
| 7   | 跨标签异步结果串会话                  | refresh 与广播共享加载顺序；检查会话、消息版本和生成状态，覆盖两种来源的交错     |
| 8   | 备份遗漏历史回复附件                  | variants 递归导出、导入、水合、剥离、删除、克隆与预览回收；保留旧 schema         |
| 9   | 历史前缀淘汰后静默续传                | 不可用的游标明确返回 409；已连接订阅者落后时中断，防止残缺成功                   |
| 10  | 跨分片 CRLF 归一化错误                | 保留结尾 CR 状态，遍历分割点验证多行 SSE 与 UTF-8                                |
| 11  | 流式任务全局资源无界                  | 任务、事件、历史、pending、订阅者、写队列、idle/hard/drain 预算与取消回收        |
| 12  | 质量门禁失效                          | 修正模型契约、格式和多余导出；CI 固定 E2E 并发并保留失败 trace/report            |
| 13  | 已知安全依赖落后                      | 更新 DOMPurify、Hono 等安全下限与锁文件，生产依赖审计                            |
| 14  | API 镜像绕过锁文件                    | 固定 pnpm 与 frozen deploy，构建及运行阶段只安装 API 依赖                        |
| 15  | 静态依赖仍进入启动路径                | SDK 枚举改为类型及协议字面值；图标 SVG 改 URL 资源；检查整个静态 import 闭包     |
| 16  | 静态资源没有压缩                      | 流式 gzip/Brotli、协商、Vary、弱 ETag、Last-Modified、HEAD/304；API SSE 保持流式 |
| 17  | 持久化差异计算平方级扫描              | ID 映射替代嵌套查找，保留顺序、更新和删除语义                                    |
| 18  | 导航重复清理全部历史正文              | 按消息对象复用摘要，保留正文变化、搜索与截断规则                                 |
| 19  | PWA 缓存长期增长                      | 静态运行时缓存最多 128 项、30 天；启动必需文件预缓存，图标不批量预取             |
| 20  | 开发与生产 API 行为漂移               | Vite 委托图片、剪贴板和临时令牌生产 handler；MCP 请求/响应有界，超限返回 413     |
| 21  | 素材预览键盘事件被父级截获            | 父级只处理自身 Enter/Space，增加 focus-within 可见性和交互回归                   |
| 22  | CJK 字体及 Python 交付成本            | 全字符 regular 字体与二进制加载；科学包按锁定清单校验；支持外部 Python 资源构建  |

## 网络配置与兼容性

`GEMINI_API_BASE` 是管理员受信任配置，允许本地反代。使用服务端 Key 时忽略浏览器上游覆盖；浏览器自带 BYOK Key 被选中时才允许其自定义上游，并执行相应网络限制。MCP 和第三方私网访问仍由各自的显式开关控制。

保留 `198.18.0.0/15` Fake-IP 兼容，用于 Clash、Surge、Mihomo TUN。普通转发增加 5 分钟 idle 和 30 分钟总超时；图片代理的 15 秒超时覆盖响应正文读取，未使用正文会取消。

## 流式任务预算

以下配置均以 `AMC_STREAM_JOB_` 为前缀，Compose 支持透传。只接受不大于 2147483647 的正安全整数；无效值使用默认值。字节按归一化 SSE 的 UTF-8 计量。

| 后缀                   |   默认值 | 含义                              |
| ---------------------- | -------: | --------------------------------- |
| `TTL_MS`               |   600000 | 已完成历史保留时间                |
| `HARD_MS`              |  3600000 | 从创建起的任务最大运行时间        |
| `IDLE_MS`              |   120000 | 最长无上游字节活动时间            |
| `EVENT_BYTES`          |  8388608 | 单个事件和单任务 pending 事件上限 |
| `RETAINED_BYTES`       |  8388608 | 单任务历史字节上限                |
| `TOTAL_RETAINED_BYTES` | 67108864 | 全局历史字节上限                  |
| `TOTAL_PENDING_BYTES`  | 16777216 | 全局 pending 事件字节上限         |
| `MAX_JOBS`             |      256 | 运行及保留的任务总数              |
| `MAX_ACTIVE`           |       32 | 同时运行的任务数                  |
| `MAX_SUBSCRIBERS`      |        4 | 单任务同时订阅数                  |
| `TOTAL_SUBSCRIBERS`    |      128 | 全局同时订阅数                    |
| `WRITE_BYTES`          |  8454144 | 单订阅者写队列预算                |
| `TOTAL_WRITE_BYTES`    | 67108864 | 全局阻塞写队列预算                |
| `DRAIN_MS`             |    30000 | 写队列等待 drain 的期限           |
| `MAX_CHUNKS`           |     8192 | 单任务历史事件数                  |
| `TOTAL_CHUNKS`         |    65536 | 全局历史事件数                    |

提高事件大小时，应配套提高写队列、单任务历史、pending 与全局预算。默认事件容量保留 8 MiB，以兼容较大的图片和工具事件。

历史保存在进程内存中。过期、压力淘汰或进程重启后，无法续传的游标返回 `409`；负数或非整数游标返回 `400`。调用方应保留已显示内容并重新发起请求，不能把剩余后缀当成完整回复。任务或订阅容量不足会返回 `429`/`503`。

连接开始后的任务错误、历史缺口或写预算超限会中断 HTTP 正文，使 SDK 抛出流/网络错误，避免把截断内容保存为成功。此时即时提示可能较笼统；重播已失败任务时返回包含具体原因的 `502`。用户主动取消保持正常结束。真实 Gemini SDK 回归覆盖直连及 Web 反代的合并、拆分和延迟分片。

## 构建和大资源

API workspace 的 `undici` 运行依赖供编译进 `server/dist/shared/` 的连接安全模块使用；源码位于根 workspace，Knip 在 `server` 中为此做局部依赖豁免。镜像的 frozen deploy 仍锁定并安装该依赖，实际 Node 24 导入检查覆盖它。

默认 `pnpm run build` 准备同源 Python 核心与 micropip、numpy、pandas、matplotlib、scipy、scikit-learn、sympy 及递归依赖。包版本及 SHA-256 来自安装的 `pyodide-lock.json`，首次构建从对应版本官方 CDN 下载，缓存位于 `node_modules/.cache/amc-pyodide/<version>`。损坏缓存会重新下载；校验失败使构建失败。浏览器仍在首次 import 时才加载科学包。

外部资源模式：

```sh
PYODIDE_ASSETS_EXTERNAL=true pnpm run build
```

此模式省略 `dist/pyodide/`。必须在 Docker 的 `RUNTIME_PYODIDE_BASE_URL` 或静态 `runtime-config.js` 的 `pyodideBaseUrl` 配置与安装版本匹配的完整资源目录。默认同源模式可用于不希望浏览器访问外部 CDN 的部署；构建机器首次仍需下载依赖。Pyodide 核心、科学包和 CJK 导出字体均不进入 PWA 首次预缓存。

`public/fonts/NotoSansCJKsc-Regular.ttf` 从原可变字体固定为 regular `wght=400`，保留全部 65535 glyphs 和 44810 个最佳 cmap 映射。原文件 36144788 B，现为 21659516 B，减少约 40.1%。导出器直接缓存 jsPDF 支持的二进制字符串，避免字体拼接及完整 Base64 副本。字体继续使用相邻 OFL 许可。可用 `fonttools==4.62.1` 和 `scripts/prepare-cjk-font.py` 重建；原始分片可从上述基线提交恢复。jsPDF 对补充平面字符等限制仍取决于其字体解析器。

启动预算由 `scripts/measure-startup.mjs` 检查，包含模块静态 import 闭包，支持路径前缀和完整 CDN base。入口或依赖缺失、启动文件未纳入离线预缓存、启动 JS 超过 2.6 MB、GenAI SDK 重新成为静态依赖均使构建失败。图标 SVG 按需加载；启动必需的 registry/data JS 独立于运行时图片 LRU 保留。

## 测量与验证

同一静态闭包统计口径下，审计基线启动 JS 为 3046278 B（gzip 919872 B）；本轮约 2.43 MB（gzip 0.774 MB），原始字节减少约 20.3%。具体值由每次构建输出，gzip 数值为对各 JS 文件单独压缩后求和。整体 dist 大小还受科学包交付集合影响，因此不将其直接当作纯代码优化的同口径收益。

合成数据基准中，1 万条会话的 ID 读取从 100030000 次降至 40000 次。同一基准两次本地测量的差异计算中位数为 437–2807 ms → 2.9–5.4 ms，稳定消息对象的 21 MB 历史摘要重算为 150–366 ms → 0.21–0.77 ms。绝对时间受并行负载影响；这些是热路径结果，首次计算和正文修改会有不同表现。

验收结果：

| 检查                   | 结果                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 完整 `pnpm run verify` | 689 个测试文件、5553 项测试通过，格式/i18n/类型/Lint/Knip/前后端构建通过                                                    |
| 生产依赖审计           | 0 个已知漏洞                                                                                                                |
| 文档站构建             | 53 页成功生成                                                                                                               |
| Chrome E2E             | 21/21，通过真实拖拽与本地 MCP 工具链；模型请求使用模拟上游                                                                  |
| 离线缓存复测           | 160 个真实 SVG 加载后缓存达到 128 项，离线重载仍显示完整 Shell                                                              |
| API/Web 镜像           | 构建与健康检查通过；API Node 24 导入 MCP/Undici/WS 成功，仅暴露三项直接运行依赖                                             |
| 真实 Python            | Chrome 从 Docker 同源资源运行 numpy/pandas/matplotlib/scipy/scikit-learn/sympy，数值断言及 PNG 文件输出成功；外部网络被阻断 |
| 外部 Python 构建       | 构建与启动预算检查通过，`pyodideBytes=0`                                                                                    |
| CJK PDF                | 实际 jsPDF 嵌入字体，pdfjs 提取中日韩样例文字成功                                                                           |
| 独立代码审查           | 网络/流式、数据一致性、前端交付三组审查及修复复审通过                                                                       |

浏览器验收过程中还修正了一处测试坐标竞态：虚拟列表入场动画时取 boundingBox 可能拖中相邻行。测试现在先用 Playwright hover 等待稳定，再执行原手动拖拽与全部断言，未增加重试或固定等待。

核心检查命令：

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm audit --prod
pnpm run docs:build
CI=1 pnpm exec playwright test --workers=2
docker build -f Dockerfile.api -t amc-webui-api:optimization-check .
docker build -f Dockerfile.web -t amc-webui-web:optimization-check .
```

安全与数据回归使用假凭据、本地 HTTP 服务和隔离数据库，不调用真实模型接口。完整自动化通过只覆盖已执行的环境与场景，不代表真实生产负载或所有上游组合均已验证。
