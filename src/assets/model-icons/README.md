# Model brand icons

SVG brand marks used by `src/components/shared/ModelIcon.tsx` in model pickers.

| File             | Used for                                     | Source                                           |
| ---------------- | -------------------------------------------- | ------------------------------------------------ |
| `gemini.svg`     | Gemini family (chat, live, TTS, robotics, …) | Lobe Icons recreation of official Gemini sparkle |
| `gemma.svg`      | Gemma models                                 | Lobe Icons / DeepMind Gemma icon                 |
| `nanobanana.svg` | Nano Banana (Gemini image models)            | Lobe Icons community mark                        |

Prefer SVG. Keep files small and square (`viewBox="0 0 24 24"` when possible).

Broader brand reference assets (wordmarks, mono variants, etc.) live in `docs/model-logos/`.

## `providers/`

Provider brand logos rendered as `<img>` in the model picker and the third-party settings panel.

### Legacy PNG (VoiceHotkey set, 1024×1024)

| File             | Provider (`ThirdPartyProviderId`)       |
| ---------------- | --------------------------------------- |
| `openai.png`     | `openai` (已替换为 Cherry SVG)          |
| `deepseek.png`   | `deepseek` (已替换为 Cherry SVG)        |
| `anthropic.png`  | `anthropic` (已替换为 Cherry SVG)       |
| `openrouter.png` | `openrouter` (已替换为 Cherry SVG)      |
| `qwen.png`       | `qwen` (已替换为 Cherry SVG)            |
| `kimi.png`       | `kimi` (已替换为 `cherry/moonshot.svg`) |
| `glm.png`        | `glm` (已替换为 `cherry/zhipu.svg`)     |
| `custom.png`     | `custom`                                |

### Cherry Studio 矢量图标 (AGPL-3.0, 来自 https://github.com/kangfenmao/cherry-studio)

`providers/cherry/*.svg` — 55 个精选提供商矢量图标，直接复用 Cherry 的 `packages/ui/icons/providers/light/*.svg`：

| Cherry ID                                    | 对应 Model ID 关键词                               | 说明               |
| -------------------------------------------- | -------------------------------------------------- | ------------------ |
| `openai`                                     | `openai,gpt,chatgpt,codex,o1,o3,o4,dall-e,whisper` | OpenAI             |
| `anthropic`                                  | `claude,anthropic`                                 | Anthropic Claude   |
| `deepseek`                                   | `deepseek`                                         | DeepSeek           |
| `qwen`                                       | `qwen,qwq,qvq,wan`                                 | Qwen               |
| `moonshot`                                   | `kimi,moonshot,k3`                                 | Moonshot AI / Kimi |
| `zhipu`                                      | `glm,chatglm,zhipu,codegeex,glmv`                  | Zhipu GLM          |
| `z-ai`                                       | `z-ai,zai`                                         | Z-AI               |
| `doubao`                                     | `doubao,seeddream,seedance,seed`                   | ByteDance Doubao   |
| `volcengine`                                 | `volcengine,bytedance,volc`                        | 火山引擎           |
| `minimax`                                    | `minimax,abab`                                     | MiniMax            |
| `mistral`                                    | `mistral,mixtral,codestral`                        | Mistral AI         |
| `meta`                                       | `llama,meta-`                                      | Meta Llama         |
| `grok`                                       | `grok,xai`                                         | xAI Grok           |
| `groq`                                       | `groq`                                             | Groq               |
| `together`                                   | `together`                                         | Together AI        |
| `silicon`                                    | `silicon,siliconflow`                              | 硅基流动           |
| `baichuan`                                   | `baichuan`                                         | 百川智能           |
| `wenxin`                                     | `wenxin,ernie`                                     | 百度文心           |
| `baidu`/`baidu-cloud`                        | `baidu`                                            | 百度云             |
| `bailian`/`dashscope`/`modelscope`           | `bailian,dashscope,modelscope`                     | 阿里云             |
| `internlm`                                   | `internlm,internvl`                                | 书生·浦语          |
| `zero-one`                                   | `yi-,zero-one,01.ai`                               | 零一万物 Yi        |
| `step`                                       | `step,stepfun`                                     | 阶跃星辰           |
| `cohere`                                     | `cohere,command-r,c4ai`                            | Cohere             |
| `perplexity`                                 | `perplexity,pplx,sonar`                            | Perplexity         |
| `huggingface`                                | `huggingface,hf-`                                  | Hugging Face       |
| `nvidia`                                     | `nvidia,nemotron`                                  | NVIDIA             |
| `stability`                                  | `stability,sdxl,sd3`                               | Stability AI       |
| `ollama`                                     | `ollama`                                           | Ollama             |
| `lmstudio`                                   | `lmstudio`                                         | LM Studio          |
| `azureai`                                    | `azure,microsoft,phi-`                             | Azure AI           |
| `aws-bedrock`                                | `bedrock,titan`                                    | AWS Bedrock        |
| `kling`/`jimeng`                             | `kling,kolors,jimeng`                              | 可灵/即梦 (视频)   |
| `jina`/`voyage`                              | `jina,voyage`                                      | Embedding          |
| `upstage`                                    | `upstage,solar`                                    | Upstage Solar      |
| `tencent-cloud-ti`                           | `hunyuan,tencent,hy-`                              | 腾讯混元           |
| `cerebras`/`fireworks`/`hyperbolic`          | 各自关键词                                         | 推理加速           |
| `ai21`/`aionlabs`/`alayanew`/`baai`/`infini` | 各自关键词                                         | 小众/学术          |

> 新增图标已按 Model ID 关键词在 `src/components/shared/ModelIcon.tsx` 的 `MODEL_ID_KEYWORD_RULES` 中配置，优先级为“模型品牌 > 渠道品牌”（如 `openai/gpt-4o` 在 openrouter 下仍显示 OpenAI）。

> 许可证：Cherry Studio 图标遵循 AGPL-3.0，已在项目根 `LICENSE` 中补充归属说明，商用对外服务需按 AGPL 提供源码。
