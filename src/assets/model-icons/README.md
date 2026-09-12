# Model brand icons

SVG brand marks used by `src/components/shared/ModelIcon.tsx` in model pickers.

| File             | Used for                                     | Source                                           |
| ---------------- | -------------------------------------------- | ------------------------------------------------ |
| `gemini.svg`     | Gemini family (chat, live, TTS, robotics, …) | Lobe Icons recreation of official Gemini sparkle |
| `gemma.svg`      | Gemma models                                 | Lobe Icons / DeepMind Gemma icon                 |
| `nanobanana.svg` | Nano Banana (Gemini image models)            | Lobe Icons community mark                        |

Prefer SVG. Keep files small and square (`viewBox="0 0 24 24"` when possible).

Broader brand reference assets (wordmarks, mono variants, etc.) live in `docs/model-logos/`.

---

## Cherry Studio 矢量图标库对齐 (AGPL-3.0)

本项目矢量图标全面对齐 [Cherry Studio](https://github.com/kangfenmao/cherry-studio) 的两级图标库与三级解析架构。

### 1. `cherry-models/` & `cherry-models-dark/` — 模型专属矢量图标 (168+ 个)

直接复用 Cherry Studio 的 `packages/ui/icons/models/light/*.svg` 与 `packages/ui/icons/models/dark/*.svg`：

- **GPT 家族细分**：`gpt-3-5-turbo`, `gpt-4`, `gpt-4-turbo`, `gpt-4-1`, `gpt-4-5-preview`, `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-pro`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-codex`, `gpt-5-1` ~ `gpt-5-6-sol` / `luna` / `terra`, `gpt-image-1/2`, `gpt-realtime` 等。
- **专有品牌徽标**：`claude` (Anthropic 暖橙色星芒日晕徽标), `dalle`, `sora`, `flux`, `ideogram`, `kling`, `kolors`, `suno`, `hunyuan`, `spark`, `sensenova`, `ling`, `doubao`, `kimi`, `chatglm`, `glmv`, `cogview`, `codegeex`, `hailuo`, `happyhorse`, `mimo` 等。
- **暗黑主题自动适配**：内置 Cherry Studio 官方暗色 SVG（如 OpenAI, Anthropic, Moonshot, Kimi, GLM 等），在深色背景下自动切换高对比度反白矢量标。

### 2. `providers/cherry/` & `providers/cherry-dark/` — 服务商与渠道矢量图标 (157+ 个)

直接复用 Cherry Studio 的 `packages/ui/icons/providers/light/*.svg` 与 `packages/ui/icons/providers/dark/*.svg`：

- 覆盖几乎所有主流及长尾云厂商、API 聚合平台（OpenAI, Anthropic, Google, DeepSeek, Meta, Mistral, Cohere, Nvidia, Azure AI, AWS Bedrock, Volcano Engine, Alibaba Bailian, Baidu Cloud, Moonshot, Zhipu, MiniMax, StepFun, 01.AI, Baichuan, Groq, Together, OpenRouter, SiliconFlow, Ollama, LM Studio 等）。
- 包含暗色服务商标，在暗黑主题下保持最高可读性。

### 3. 三级解析引擎 (`src/components/shared/modelIconRegistry.ts`)

基于 Cherry Studio 的 `registry.ts` 正则引擎与 Vite `import.meta.glob` 动态加载：

1. **Tier 0（原生保障）**：官方 Gemini / Gemma / Nano Banana 拥有顶级优先级，渲染官方 Sparkle 品牌徽标；
2. **Tier 1（模型专有标）**：`MODEL_ICON_PATTERNS` 正则精确命中模型专属标（带边界安全过滤）；
3. **Tier 2（厂商推断标）**：`MODEL_TO_PROVIDER_PATTERNS` 对无专有标的模型名进行所属厂商推断（如 `meta-llama/...` -> Meta，`bge-m3` -> BAAI）；
4. **Tier 3（渠道服务商标）**：通过 `PROVIDER_ID_ALIASES` 别名映射回退至对应服务商（如 OpenRouter, SiliconFlow, Ollama）；
5. **Tier 4（通用兜底）**：未命中的自定义模型回退至 `custom.png`。

> 许可证说明：Cherry Studio 图标与解析逻辑遵循 AGPL-3.0，已在项目根 `LICENSE` 中补充归属说明，商用对外服务需按 AGPL 提供源码。
