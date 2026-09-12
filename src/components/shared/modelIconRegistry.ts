import customLogoUrl from '@/assets/model-icons/providers/custom.png';

/**
 * Cherry Studio 图标模块动态加载 (Vite import.meta.glob)
 * - 168+ 个模型专用矢量图标 (packages/ui/icons/models/light/*.svg)
 * - 157+ 个服务商矢量图标 (packages/ui/icons/providers/light/*.svg)
 * 基于 AGPL-3.0 协议引入，源自 https://github.com/kangfenmao/cherry-studio
 */
const MODEL_SVG_MODULES = import.meta.glob<string>('@/assets/model-icons/cherry-models/*.svg', {
  eager: true,
  import: 'default',
});

const PROVIDER_SVG_MODULES = import.meta.glob<string>('@/assets/model-icons/providers/cherry/*.svg', {
  eager: true,
  import: 'default',
});

const MODEL_DARK_SVG_MODULES = import.meta.glob<string>('@/assets/model-icons/cherry-models-dark/*.svg', {
  eager: true,
  import: 'default',
});

const PROVIDER_DARK_SVG_MODULES = import.meta.glob<string>('@/assets/model-icons/providers/cherry-dark/*.svg', {
  eager: true,
  import: 'default',
});

const extractSvgMap = (modules: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [path, url] of Object.entries(modules)) {
    const filename = path.split('/').pop();
    if (filename) {
      const key = filename.replace(/\.svg$/, '');
      result[key] = url;
    }
  }
  return result;
};

export const CHERRY_MODEL_LOGOS: Record<string, string> = extractSvgMap(MODEL_SVG_MODULES);
export const CHERRY_PROVIDER_LOGOS: Record<string, string> = extractSvgMap(PROVIDER_SVG_MODULES);
const CHERRY_MODEL_DARK_LOGOS: Record<string, string> = extractSvgMap(MODEL_DARK_SVG_MODULES);
const CHERRY_PROVIDER_DARK_LOGOS: Record<string, string> = extractSvgMap(PROVIDER_DARK_SVG_MODULES);

/**
 * Cherry Studio 第一级：Model ID 正则映射到专有模型图标
 * 顺序敏感：较具体的规则必须在通用规则之前
 */
const MODEL_ICON_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // GPT 5.6 series
  [/gpt-5[.-]6-luna/i, 'gpt-5-6-luna'],
  [/gpt-5[.-]6-sol/i, 'gpt-5-6-sol'],
  [/gpt-5[.-]6-terra/i, 'gpt-5-6-terra'],
  // GPT 5.5 series
  [/gpt-5[.-]5-pro/i, 'gpt-5-5-pro'],
  [/gpt-5[.-]5/i, 'gpt-5-5'],
  // GPT 5.4 series
  [/gpt-5[.-]4-mini/i, 'gpt-5-4-mini'],
  [/gpt-5[.-]4-nano/i, 'gpt-5-4-nano'],
  [/gpt-5[.-]4-pro/i, 'gpt-5-4-pro'],
  [/gpt-5[.-]4/i, 'gpt-5-4'],
  // GPT 5.3 series
  [/gpt-5[.-]3-codex/i, 'gpt-5-3-codex'],
  [/gpt-5[.-]3-chat/i, 'gpt-5-3-chat-latest'],
  // GPT 5.2 series
  [/gpt-5[.-]2-chat/i, 'gpt-5-2-chat-latest'],
  [/gpt-5[.-]2-codex/i, 'gpt-5-2-codex'],
  [/gpt-5[.-]2-pro/i, 'gpt-5-2-pro'],
  [/gpt-5[.-]2/i, 'gpt-5-2'],
  // GPT 5.1 series
  [/gpt-5[.-]1-codex-max/i, 'gpt-5-1-codex-max'],
  [/gpt-5[.-]1-codex-mini/i, 'gpt-5-1-codex-mini'],
  [/gpt-5[.-]1-codex/i, 'gpt-5-1-codex'],
  [/gpt-5[.-]1-chat-latest/i, 'gpt-5-1-chat-latest'],
  [/gpt-5[.-]1-chat/i, 'gpt-5-1-chat'],
  [/gpt-5[.-]1/i, 'gpt-5-1'],
  // GPT 5 series
  [/gpt-5-mini/i, 'gpt-5-mini'],
  [/gpt-5-nano/i, 'gpt-5-nano'],
  [/gpt-5-pro/i, 'gpt-5-pro'],
  [/gpt-5-chat/i, 'gpt-5-chat'],
  [/gpt-5-codex/i, 'gpt-5-codex'],
  [/gpt-5/i, 'gpt-5'],
  // GPT 4o series
  [/gpt-4o-mini-audio-preview/i, 'gpt-4o-mini-audio-preview'],
  [/gpt-4o-mini-realtime-preview/i, 'gpt-4o-mini-realtime-preview'],
  [/gpt-4o-mini-search-preview/i, 'gpt-4o-mini-search-preview'],
  [/gpt-4o-mini-transcribe/i, 'gpt-4o-mini-transcribe'],
  [/gpt-4o-mini-tts/i, 'gpt-4o-mini-tts'],
  [/gpt-4o-mini/i, 'gpt-4o-mini'],
  [/gpt-4o-audio-preview/i, 'gpt-4o-audio-preview'],
  [/gpt-4o-realtime-preview/i, 'gpt-4o-realtime-preview'],
  [/gpt-4o-search-preview/i, 'gpt-4o-search-preview'],
  [/gpt-4o-transcribe-diarize/i, 'gpt-4o-transcribe-diarize'],
  [/gpt-4o-transcribe/i, 'gpt-4o-transcribe'],
  [/gpt-4o/i, 'gpt-4o'],
  // GPT 4 and 3.5 series
  [/gpt-4[.-]1-mini/i, 'gpt-4-1-mini'],
  [/gpt-4[.-]1-nano/i, 'gpt-4-1-nano'],
  [/gpt-4[.-]1/i, 'gpt-4-1'],
  [/gpt-4[.-]5(?:-preview)?/i, 'gpt-4-5-preview'],
  [/gpt-4-turbo-preview/i, 'gpt-4-turbo-preview'],
  [/gpt-4-turbo/i, 'gpt-4-turbo'],
  [/gpt-4(?:-|$)/i, 'gpt-4'],
  [/gpt-3[.-]5(?:-turbo)?/i, 'gpt-3-5-turbo'],
  // GPT OSS
  [/gpt-oss-120b/i, 'gpt-oss-120b'],
  [/gpt-oss-20b/i, 'gpt-oss-20b'],
  // GPT image
  [/gpt-image-2/i, 'gpt-image-2'],
  [/gpt-image-1-mini/i, 'gpt-image-1-mini'],
  [/gpt-image-1[.-]5/i, 'gpt-image-1-5'],
  [/gpt-image/i, 'gpt-image-1'],
  // GPT audio and realtime
  [/gpt-audio-1[.-]5/i, 'gpt-audio-1-5'],
  [/gpt-audio-mini/i, 'gpt-audio-mini'],
  [/gpt-audio/i, 'gpt-audio'],
  [/gpt-realtime-2[.-]1-mini/i, 'gpt-realtime-2-1-mini'],
  [/gpt-realtime-2[.-]1/i, 'gpt-realtime-2-1'],
  [/gpt-realtime-2/i, 'gpt-realtime-2'],
  [/gpt-realtime-1[.-]5/i, 'gpt-realtime-1-5'],
  [/gpt-realtime-mini/i, 'gpt-realtime-mini'],
  [/gpt-realtime-translate/i, 'gpt-realtime-translate'],
  [/gpt-realtime-whisper/i, 'gpt-realtime-whisper'],
  [/gpt-realtime/i, 'gpt-realtime'],
  [/(?:^|[-_/])(?:dall-e|dalle)(?:[-_/.\d]|$)/i, 'dalle'],
  // Sora (bare `sora`, `sora-2`, `sora_x`, `sora2` — but not e.g. `pandora`)
  [/(?:^|[-_/])sora(?:[-_\d]|$)/i, 'sora'],
  // Claude / Anthropic models (incl. standalone sonnet/opus/haiku aliases)
  [/(?:^|[-_/])(?:claude|anthropic-|sonnet|opus|haiku)(?:[-_/.\d]|$)/i, 'claude'],
  // Google models
  [/nano-?banana/i, 'nanobanana'],
  [/gemini|veo|imagen|lyria/i, 'gemini'],
  [/gemma/i, 'gemma'],
  // Dedicated model families
  [/deepseek/i, 'deepseek'],
  [/nous-|hermes|deephermes/i, 'nousresearch'],
  [/muse/i, 'meta'],
  [/llama|meta-/i, 'meta'],
  [/mistral|pixtral|codestral|ministral|voxtral|devstral|mixtral|magistral/i, 'mistral'],
  [/minimax-agent/i, 'minimax-agent'],
  [/minimax|abab/i, 'minimax'],
  [/jamba|j2-/i, 'ai21'],
  [/aya/i, 'aya'],
  [/command-r|command-a|c4ai-|cohere|north-/i, 'cohere'],
  [/nemotron|nvidia/i, 'nvidia'],
  [/voyage/i, 'voyage'],
  [/solar/i, 'upstage'],
  [/bge/i, 'baai'],
  [/cogito/i, 'deepcogito'],
  [/mercury/i, 'inception'],
  [/relace/i, 'relace'],
  [/jina/i, 'jina'],
  [/(?:^|[-_/])(?:pplx|sonar)(?:[-_/]|$)/i, 'perplexity'],
  [/(?:^|[-_/])flux(?:[-_.\d]|$)/i, 'flux'],
  [/ideogram/i, 'ideogram'],
  [/stable-|sd3|sdxl/i, 'stability'],
  [/(?:^|[-_/])kling(?:[-_/]|$)/i, 'kling'],
  [/(?:^|[-_/])kolors(?:[-_/]|$)/i, 'kolors'],
  [/(?:^|[-_/])suno(?:[-_/]|$)/i, 'suno'],
  [/(?:^|[-_/])longcat(?:[-_/]|$)/i, 'longcat'],
  // Chinese models
  [/qwen|qwq|qvq|(?:^|[-_/])wan(?:[-_\d]|$)|z-image/i, 'qwen'],
  [/chatglm/i, 'chatglm'],
  [/cogview|cogvideo/i, 'cogview'],
  [/glm[-_.\d]*v(?:[-_/.\d]|$)/i, 'glmv'],
  [/glm/i, 'glm'],
  [/baichuan/i, 'baichuan'],
  [/internlm|internvl/i, 'internlm'],
  [/(?:^|[-_/])yi(?:[-_/]|$)/i, 'yi'],
  [/ernie|wenxin/i, 'wenxin'],
  [/(?:^|[-_/])step(?:[-_/]|$)/i, 'stepfun'],
  [/doubao|seedream|seedance|ep-202|(?:^|[-_/])seed(?:[-_\d]|$)/i, 'doubao'],
  [/(?:^|[-_/.:])(?:hunyuan|hy-|hy\d)/i, 'hunyuan'],
  [/kimi|moonshot|^k3(?:[-_.]|$)/i, 'kimi'],
  // Other model-specific icons
  [/grok/i, 'grok'],
  [/hailuo/i, 'hailuo'],
  [/happy-?horse/i, 'happyhorse'],
  [/codegeex/i, 'codegeex'],
  [/mimo/i, 'mimo'],
  [/palm|bison/i, 'palm'],
  [/ibm/i, 'ibm'],
  [/trinity/i, 'trinity'],
  [/sensenova/i, 'sensenova'],
  [/nova/i, 'nova'],
  [/(?:^|[-_/])(?:ling|ring)(?:[-_]|$)/i, 'ling'],
  [/spark/i, 'spark'],
];

/**
 * Cherry Studio 第二级：Model ID 正则推断服务商图标
 * 当模型无专有图标时，通过模型名推断其所属服务商
 */
const MODEL_TO_PROVIDER_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  // OpenAI (incl. embedding, TTS, etc.)
  [
    /\bgpt\b|(?:^|[-_/])o[1-9](?:[-_]|$)|chatgpt|dall-e|whisper|tts-|text-embedding-ada|text-embedding-3|babbage|davinci/i,
    'openai',
  ],
  // Anthropic
  [/anthropic|claude/i, 'anthropic'],
  // Google (incl. embedding models)
  [/palm|veo|imagen|learnlm|text-embedding-00|text-multilingual-embedding-00/i, 'google'],
  [/vertex|vertexai/i, 'vertexai'],
  // Meta / Llama
  [/llama|meta-/i, 'meta'],
  // DeepSeek
  [/deepseek/i, 'deepseek'],
  // Mistral (incl. voxtral, devstral, mixtral, magistral)
  [/mistral|pixtral|codestral|ministral|voxtral|devstral|mixtral|magistral/i, 'mistral'],
  // Cohere (incl. embed-*, rerank-*)
  [/command-r|command-a|c4ai-|cohere|embed-|rerank-|north-/i, 'cohere'],
  // Nvidia
  [/nemotron|nvidia/i, 'nvidia'],
  // Microsoft / Phi
  [/phi-|orca|wizardlm|microsoft/i, 'azureai'],
  // Inflection
  [/inflection/i, 'inflection'],
  // Nous Research
  [/nous-|hermes|deephermes/i, 'nousresearch'],
  // Databricks
  [/dbrx/i, 'databricks'],
  // Allen AI
  [/olmo|molmo|tulu/i, 'allenai'],
  // Perplexity
  [/pplx-|sonar/i, 'perplexity'],
  // Moonshot / Kimi
  [/moonshot|kimi/i, 'moonshot'],
  // Zhipu (incl. cogview, cogvideo)
  [/chatglm|cogview|cogvideo/i, 'zhipu'],
  // Minimax
  [/minimax|abab/i, 'minimax'],
  // Baichuan
  [/baichuan/i, 'baichuan'],
  // Step
  [/step-/i, 'step'],
  // 01.AI / Yi
  [/yi-/i, 'zero-one'],
  // Cerebras
  [/cerebras/i, 'cerebras'],
  // Hugging Face
  [/huggingface/i, 'huggingface'],
  // Liquid
  [/lfm-/i, 'liquid'],
  // AI21
  [/jamba|j2-/i, 'ai21'],
  // Upstage
  [/solar/i, 'upstage'],
  // Arcee AI (incl. trinity, spotlight, virtuoso, coder-large)
  [/arcee|spotlight|virtuoso|coder-large/i, 'arcee-ai'],
  // InternLM
  [/internlm|internvl|intern/i, 'internlm'],
  // Wenxin / Ernie (Baidu)
  [/ernie|wenxin/i, 'wenxin'],
  // Volcengine / Bytedance (incl. ui-tars, seed)
  [/skylark|ui-tars/i, 'volcengine'],
  // Voyage
  [/voyage/i, 'voyage'],
  // Nomic
  [/nomic/i, 'nomic'],
  // Mixedbread
  [/mxbai/i, 'mixedbread'],
  // Jina
  [/jina/i, 'jina'],
  // BFL / Flux
  [/flux/i, 'bfl'],
  // StreamLake
  [/kat/i, 'streamlake'],
  // Dolphin AI
  [/dolphin/i, 'dolphin-ai'],
  // ElevenLabs
  [/eleven/i, 'elevenlabs'],
  // Relace
  [/relace/i, 'relace'],
  // Riverflow
  [/riverflow/i, 'riverflow'],
  // Kling / Kolors (both Kuaishou image/video)
  [/kling|kolors/i, 'kling'],
  // Jimeng (ByteDance/Volcengine image/video)
  [/jimeng/i, 'jimeng'],
  // Suno
  [/suno/i, 'suno'],
  // Infini / Megrez
  [/megrez|infini/i, 'infini'],
  // Aionlabs
  [/aion/i, 'aionlabs'],
  // Inception / Mercury
  [/mercury/i, 'inceptionlabs'],
  // Longcat / Meituan
  [/longcat/i, 'longcat'],
  // Kwaipilot
  [/kwaipilot/i, 'kwaipilot'],
  // Netease Youdao / BCE
  [/bce/i, 'netease-youdao'],
  // BAAI / BGE
  [/bge|baai/i, 'baai'],
  // Deep Cogito
  [/cogito/i, 'deepcogito'],
  // Ideogram
  [/ideogram/i, 'ideogram'],
  // Recraft
  [/recraft/i, 'recraft'],
  // Runway
  [/runway/i, 'runway'],
  // Stability AI
  [/stable-|sd3|sdxl/i, 'stability'],
  // TNG
  [/tng-/i, 'tng'],
  // iFlytek / Spark
  [/xinghuo|xunfei|spark/i, 'xinghuo'],
  // Z-AI
  [/z-ai|z_ai|zai/i, 'z-ai'],
  // Coze
  [/coze/i, 'coze'],
];

/**
 * Cherry Studio 第三级：Provider ID 别名映射字典
 */
const PROVIDER_ID_ALIASES: Record<string, string> = {
  // Cherry Studio 官方别名
  'openai-codex': 'openai',
  'grok-cli': 'grok',
  'azure-openai': 'azureai',
  'new-api': 'newapi',
  'tencent-cloud-ti': 'tencent-cloud-ti',
  tokenhub: 'tencent-cloud-ti',
  'baidu-cloud': 'baidu-cloud',
  'aws-bedrock': 'aws-bedrock',
  'gitee-ai': 'gitee-ai',
  yi: 'zero-one',
  ovms: 'intel',
  gemini: 'google',
  copilot: 'github-copilot',
  'github-copilot-openai-compatible': 'github-copilot',
  doubao: 'doubao',
  stepfun: 'step',
  voyageai: 'voyage',
  gateway: 'vercel',
  zhinao: 'xirang',
  aionly: 'ai-only',
  dashscope: 'bailian',
  zai: 'z-ai',
  'minimax-global': 'minimax',
  cherryai: 'cherryin',
  // AMC-WebUI 渠道及模板兼容别名
  siliconflow: 'silicon',
  kimi: 'moonshot',
  glm: 'zhipu',
  spark: 'spark',
  xinghuo: 'xinghuo',
  xunfei: 'xinghuo',
};

export const CHERRY_PROVIDER_LABELS: Record<string, string> = {
  ai21: 'AI21',
  aionlabs: 'AionLabs',
  alayanew: 'AlayaNew',
  'aws-bedrock': 'AWS Bedrock',
  azureai: 'Azure AI',
  baai: 'BAAI',
  baichuan: 'Baichuan',
  'baidu-cloud': 'Baidu Cloud',
  baidu: 'Baidu',
  bailian: 'Bailian',
  bytedance: 'ByteDance',
  cerebras: 'Cerebras',
  cohere: 'Cohere',
  coze: 'Coze',
  dashscope: 'DashScope',
  doubao: 'Doubao',
  fireworks: 'Fireworks',
  google: 'Google',
  grok: 'Grok',
  groq: 'Groq',
  huggingface: 'Hugging Face',
  hyperbolic: 'Hyperbolic',
  infini: 'Infini',
  internlm: 'InternLM',
  jimeng: 'Jimeng',
  jina: 'Jina',
  kling: 'Kling',
  lmstudio: 'LM Studio',
  meta: 'Meta',
  'minimax-agent': 'MiniMax Agent',
  minimax: 'MiniMax',
  mistral: 'Mistral',
  modelscope: 'ModelScope',
  moonshot: 'Moonshot',
  nvidia: 'NVIDIA',
  ollama: 'Ollama',
  perplexity: 'Perplexity',
  silicon: 'SiliconFlow',
  stability: 'Stability AI',
  step: 'StepFun',
  'tencent-cloud-ti': 'Tencent Cloud TI',
  together: 'Together AI',
  upstage: 'Upstage',
  vertexai: 'Vertex AI',
  volcengine: 'VolcEngine',
  voyage: 'Voyage',
  wenxin: 'Wenxin',
  'z-ai': 'Z-AI',
  'zero-one': '01.AI',
  zhipu: 'Zhipu',
  xinghuo: 'iFlytek Spark',
  xirang: 'Xirang',
  spark: 'Spark',
  hunyuan: 'Hunyuan',
  claude: 'Claude',
  dalle: 'DALL-E',
  sora: 'Sora',
  flux: 'Flux',
  ideogram: 'Ideogram',
  suno: 'Suno',
  sensenova: 'SenseNova',
  ling: 'Ling',
  chatglm: 'ChatGLM',
  glmv: 'GLM-V',
  cogview: 'CogView',
  hailuo: 'Hailuo',
  mimo: 'MiMo',
};

export const formatIconLabel = (key: string): string => {
  if (CHERRY_PROVIDER_LABELS[key]) {
    return CHERRY_PROVIDER_LABELS[key];
  }
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export interface ResolvedIconRef {
  key: string;
  url: string;
  darkUrl?: string;
}

/**
 * 核心三级解析：从 Model ID、Provider ID 与 Template ID 中解析最终图标
 */
export const resolveIconRef = (
  modelId?: string,
  providerId?: string,
  templateId?: string,
  modelName?: string,
): ResolvedIconRef => {
  const isCustomChannel =
    !templateId || templateId === 'custom' || templateId === 'custom-openai' || templateId === 'custom-anthropic';

  // 1. 模型专有图标匹配与厂商推断 (Cherry Studio MODEL_ICON_PATTERNS & MODEL_TO_PROVIDER_PATTERNS)
  // 标准渠道以 modelId 为准；自定义渠道若 modelId 缺失或为自定义代号，允许继续匹配用户填写的展示名称 modelName
  const candidateIds = [modelId, isCustomChannel ? modelName : undefined].filter(Boolean) as string[];
  for (const candidate of candidateIds) {
    for (const [regex, catalogKey] of MODEL_ICON_PATTERNS) {
      if (regex.test(candidate)) {
        const url = CHERRY_MODEL_LOGOS[catalogKey] || CHERRY_PROVIDER_LOGOS[catalogKey];
        if (url) {
          const darkUrl = CHERRY_MODEL_DARK_LOGOS[catalogKey] || CHERRY_PROVIDER_DARK_LOGOS[catalogKey];
          return { key: catalogKey, url, darkUrl };
        }
      }
    }

    for (const [regex, catalogKey] of MODEL_TO_PROVIDER_PATTERNS) {
      if (regex.test(candidate)) {
        const url = CHERRY_PROVIDER_LOGOS[catalogKey] || CHERRY_MODEL_LOGOS[catalogKey];
        if (url) {
          const darkUrl = CHERRY_PROVIDER_DARK_LOGOS[catalogKey] || CHERRY_MODEL_DARK_LOGOS[catalogKey];
          return { key: catalogKey, url, darkUrl };
        }
      }
    }
  }

  // 3. 渠道/服务商 Fallback 匹配
  const rawKey = templateId || providerId || '';
  if (rawKey && rawKey !== 'custom' && rawKey !== 'custom-openai' && rawKey !== 'custom-anthropic') {
    const aliasedKey = PROVIDER_ID_ALIASES[rawKey] ?? rawKey;
    const url = CHERRY_PROVIDER_LOGOS[aliasedKey] || CHERRY_MODEL_LOGOS[aliasedKey] || CHERRY_PROVIDER_LOGOS[rawKey];
    if (url) {
      const darkUrl =
        CHERRY_PROVIDER_DARK_LOGOS[aliasedKey] ||
        CHERRY_MODEL_DARK_LOGOS[aliasedKey] ||
        CHERRY_PROVIDER_DARK_LOGOS[rawKey];
      return { key: aliasedKey, url, darkUrl };
    }
  }

  return { key: 'custom', url: customLogoUrl };
};
