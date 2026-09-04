import { Box, Sparkles } from 'lucide-react';

import geminiIconUrl from '@/assets/model-icons/gemini.svg';
import gemmaIconUrl from '@/assets/model-icons/gemma.svg';
import nanoBananaIconUrl from '@/assets/model-icons/nanobanana.svg';
import customLogoUrl from '@/assets/model-icons/providers/custom.png';
import ai21CherryUrl from '@/assets/model-icons/providers/cherry/ai21.svg';
import aionlabsCherryUrl from '@/assets/model-icons/providers/cherry/aionlabs.svg';
import alayanewCherryUrl from '@/assets/model-icons/providers/cherry/alayanew.svg';
import anthropicCherryUrl from '@/assets/model-icons/providers/cherry/anthropic.svg';
import awsBedrockCherryUrl from '@/assets/model-icons/providers/cherry/aws-bedrock.svg';
import azureaiCherryUrl from '@/assets/model-icons/providers/cherry/azureai.svg';
import baaiCherryUrl from '@/assets/model-icons/providers/cherry/baai.svg';
import baichuanCherryUrl from '@/assets/model-icons/providers/cherry/baichuan.svg';
import baiduCloudCherryUrl from '@/assets/model-icons/providers/cherry/baidu-cloud.svg';
import baiduCherryUrl from '@/assets/model-icons/providers/cherry/baidu.svg';
import bailianCherryUrl from '@/assets/model-icons/providers/cherry/bailian.svg';
import bytedanceCherryUrl from '@/assets/model-icons/providers/cherry/bytedance.svg';
import cerebrasCherryUrl from '@/assets/model-icons/providers/cherry/cerebras.svg';
import cohereCherryUrl from '@/assets/model-icons/providers/cherry/cohere.svg';
import cozeCherryUrl from '@/assets/model-icons/providers/cherry/coze.svg';
import dashscopeCherryUrl from '@/assets/model-icons/providers/cherry/dashscope.svg';
import deepseekCherryUrl from '@/assets/model-icons/providers/cherry/deepseek.svg';
import doubaoCherryUrl from '@/assets/model-icons/providers/cherry/doubao.svg';
import fireworksCherryUrl from '@/assets/model-icons/providers/cherry/fireworks.svg';
import googleCherryUrl from '@/assets/model-icons/providers/cherry/google.svg';
import grokCherryUrl from '@/assets/model-icons/providers/cherry/grok.svg';
import groqCherryUrl from '@/assets/model-icons/providers/cherry/groq.svg';
import huggingfaceCherryUrl from '@/assets/model-icons/providers/cherry/huggingface.svg';
import hyperbolicCherryUrl from '@/assets/model-icons/providers/cherry/hyperbolic.svg';
import infiniCherryUrl from '@/assets/model-icons/providers/cherry/infini.svg';
import internlmCherryUrl from '@/assets/model-icons/providers/cherry/internlm.svg';
import jimengCherryUrl from '@/assets/model-icons/providers/cherry/jimeng.svg';
import jinaCherryUrl from '@/assets/model-icons/providers/cherry/jina.svg';
import klingCherryUrl from '@/assets/model-icons/providers/cherry/kling.svg';
import lmstudioCherryUrl from '@/assets/model-icons/providers/cherry/lmstudio.svg';
import metaCherryUrl from '@/assets/model-icons/providers/cherry/meta.svg';
import minimaxAgentCherryUrl from '@/assets/model-icons/providers/cherry/minimax-agent.svg';
import minimaxCherryUrl from '@/assets/model-icons/providers/cherry/minimax.svg';
import mistralCherryUrl from '@/assets/model-icons/providers/cherry/mistral.svg';
import modelscopeCherryUrl from '@/assets/model-icons/providers/cherry/modelscope.svg';
import moonshotCherryUrl from '@/assets/model-icons/providers/cherry/moonshot.svg';
import nvidiaCherryUrl from '@/assets/model-icons/providers/cherry/nvidia.svg';
import ollamaCherryUrl from '@/assets/model-icons/providers/cherry/ollama.svg';
import openaiCherryUrl from '@/assets/model-icons/providers/cherry/openai.svg';
import openrouterCherryUrl from '@/assets/model-icons/providers/cherry/openrouter.svg';
import perplexityCherryUrl from '@/assets/model-icons/providers/cherry/perplexity.svg';
import qwenCherryUrl from '@/assets/model-icons/providers/cherry/qwen.svg';
import siliconCherryUrl from '@/assets/model-icons/providers/cherry/silicon.svg';
import stabilityCherryUrl from '@/assets/model-icons/providers/cherry/stability.svg';
import stepCherryUrl from '@/assets/model-icons/providers/cherry/step.svg';
import tencentCloudTiCherryUrl from '@/assets/model-icons/providers/cherry/tencent-cloud-ti.svg';
import togetherCherryUrl from '@/assets/model-icons/providers/cherry/together.svg';
import upstageCherryUrl from '@/assets/model-icons/providers/cherry/upstage.svg';
import vertexaiCherryUrl from '@/assets/model-icons/providers/cherry/vertexai.svg';
import volcengineCherryUrl from '@/assets/model-icons/providers/cherry/volcengine.svg';
import voyageCherryUrl from '@/assets/model-icons/providers/cherry/voyage.svg';
import wenxinCherryUrl from '@/assets/model-icons/providers/cherry/wenxin.svg';
import zAiCherryUrl from '@/assets/model-icons/providers/cherry/z-ai.svg';
import zeroOneCherryUrl from '@/assets/model-icons/providers/cherry/zero-one.svg';
import zhipuCherryUrl from '@/assets/model-icons/providers/cherry/zhipu.svg';
import xinghuoCherryUrl from '@/assets/model-icons/providers/cherry/xinghuo.svg';
import xirangCherryUrl from '@/assets/model-icons/providers/cherry/xirang.svg';
import sparkCherryUrl from '@/assets/model-icons/cherry-models/spark.svg';
import hunyuanCherryUrl from '@/assets/model-icons/cherry-models/hunyuan.svg';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { THIRD_PARTY_PROVIDER_LABELS, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';
import { type ModelOption, type ThirdPartyProviderId, type ThirdPartyTemplateId, GEMINI_PROVIDER_ID } from '@/types';

/** 统一图标外框尺寸，解决 Brand(22) vs Provider(26) 混排大小不一 */
const MODEL_ICON_SIZE = 22;
/** 细线图标在同尺寸下视觉偏小，需略微放大以平衡实心图标 */
const THIN_LINE_ICON_KEYS = new Set<string>([
  'openai',
  'deepseek',
  'anthropic',
  'meta',
  'mistral',
  'cohere',
  'perplexity',
  'groq',
  'grok',
]);

/**
 * 第三方 Provider Logo 映射 - 融合 Cherry Studio 的 55 个优质矢量图标
 * 原有 8 个 PNG 已替换为 Cherry SVG (矢量、支持深浅色)，新增 47 个常用提供商
 * 来源: https://github.com/kangfenmao/cherry-studio (AGPL-3.0) - 已在 README 标注
 */
const THIRD_PARTY_PROVIDER_LOGO: Record<string, string> = {
  openai: openaiCherryUrl,
  deepseek: deepseekCherryUrl,
  anthropic: anthropicCherryUrl,
  openrouter: openrouterCherryUrl,
  qwen: qwenCherryUrl,
  kimi: moonshotCherryUrl,
  glm: zhipuCherryUrl,
  ai21: ai21CherryUrl,
  aionlabs: aionlabsCherryUrl,
  alayanew: alayanewCherryUrl,
  'aws-bedrock': awsBedrockCherryUrl,
  azureai: azureaiCherryUrl,
  baai: baaiCherryUrl,
  baichuan: baichuanCherryUrl,
  'baidu-cloud': baiduCloudCherryUrl,
  baidu: baiduCherryUrl,
  bailian: bailianCherryUrl,
  bytedance: bytedanceCherryUrl,
  cerebras: cerebrasCherryUrl,
  cohere: cohereCherryUrl,
  coze: cozeCherryUrl,
  dashscope: dashscopeCherryUrl,
  doubao: doubaoCherryUrl,
  fireworks: fireworksCherryUrl,
  google: googleCherryUrl,
  grok: grokCherryUrl,
  groq: groqCherryUrl,
  huggingface: huggingfaceCherryUrl,
  hyperbolic: hyperbolicCherryUrl,
  infini: infiniCherryUrl,
  internlm: internlmCherryUrl,
  jimeng: jimengCherryUrl,
  jina: jinaCherryUrl,
  kling: klingCherryUrl,
  lmstudio: lmstudioCherryUrl,
  meta: metaCherryUrl,
  'minimax-agent': minimaxAgentCherryUrl,
  minimax: minimaxCherryUrl,
  mistral: mistralCherryUrl,
  modelscope: modelscopeCherryUrl,
  moonshot: moonshotCherryUrl,
  nvidia: nvidiaCherryUrl,
  ollama: ollamaCherryUrl,
  perplexity: perplexityCherryUrl,
  silicon: siliconCherryUrl,
  stability: stabilityCherryUrl,
  step: stepCherryUrl,
  'tencent-cloud-ti': tencentCloudTiCherryUrl,
  together: togetherCherryUrl,
  upstage: upstageCherryUrl,
  vertexai: vertexaiCherryUrl,
  volcengine: volcengineCherryUrl,
  voyage: voyageCherryUrl,
  wenxin: wenxinCherryUrl,
  'z-ai': zAiCherryUrl,
  'zero-one': zeroOneCherryUrl,
  zhipu: zhipuCherryUrl,
  xinghuo: xinghuoCherryUrl,
  xirang: xirangCherryUrl,
  spark: sparkCherryUrl,
  hunyuan: hunyuanCherryUrl,
  custom: customLogoUrl,
};

const THIRD_PARTY_TEMPLATE_LOGO: Record<ThirdPartyTemplateId, string> = {
  openai: openaiCherryUrl,
  deepseek: deepseekCherryUrl,
  anthropic: anthropicCherryUrl,
  openrouter: openrouterCherryUrl,
  qwen: qwenCherryUrl,
  kimi: moonshotCherryUrl,
  glm: zhipuCherryUrl,
  nvidia: nvidiaCherryUrl,
  minimax: minimaxCherryUrl,
  grok: grokCherryUrl,
  atlascloud: customLogoUrl,
  'custom-openai': customLogoUrl,
  'custom-anthropic': customLogoUrl,
};

/** Cherry 新增提供商的显示名（用于 alt 文案，取自官方品牌名） */
const CHERRY_PROVIDER_LABELS: Record<string, string> = {
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
};

/**
 * 按 Model ID 关键词推断第三方 Logo - 基于 Cherry Studio 的 registry.ts 完整正则思想简化为 includes 匹配
 * 优先级：关键词命中 > provider/template 回退，命中不到则回退到 custom/原有分组
 * 关键词覆盖聚合渠道场景，例如 openrouter 渠道下的 `openai/gpt-4o` 应显示 OpenAI 而非 OpenRouter
 * 已覆盖 50+ 提供商，新增 doubao/minimax/mistral/meta/grok/groq/together/silicon/baichuan/wenxin 等
 */
const MODEL_ID_KEYWORD_RULES: Array<{ keywords: string[]; logoKey: string }> = [
  { keywords: ['claude', 'anthropic'], logoKey: 'anthropic' },
  { keywords: ['deepseek'], logoKey: 'deepseek' },
  { keywords: ['qwen', 'qwq', 'qvq', 'wan'], logoKey: 'qwen' },
  { keywords: ['kimi', 'moonshot', 'k3'], logoKey: 'kimi' },
  { keywords: ['glm', 'chatglm', 'zhipu', 'codegeex', 'glmv'], logoKey: 'glm' },
  { keywords: ['z-ai', 'z_ai', 'zai'], logoKey: 'z-ai' },
  { keywords: ['doubao', 'seeddream', 'seedance', 'ep-202', 'seed'], logoKey: 'doubao' },
  { keywords: ['volcengine', 'bytedance', 'volc'], logoKey: 'volcengine' },
  { keywords: ['minimax', 'abab'], logoKey: 'minimax' },
  { keywords: ['minimax-agent'], logoKey: 'minimax-agent' },
  {
    keywords: ['mistral', 'mixtral', 'codestral', 'magistral', 'pixtral', 'ministral', 'voxtral', 'devstral'],
    logoKey: 'mistral',
  },
  { keywords: ['llama', 'meta-'], logoKey: 'meta' },
  { keywords: ['grok', 'xai'], logoKey: 'grok' },
  { keywords: ['groq'], logoKey: 'groq' },
  { keywords: ['together'], logoKey: 'together' },
  { keywords: ['silicon', 'siliconflow'], logoKey: 'silicon' },
  { keywords: ['baichuan'], logoKey: 'baichuan' },
  { keywords: ['wenxin', 'ernie'], logoKey: 'wenxin' },
  { keywords: ['baidu'], logoKey: 'baidu' },
  { keywords: ['baidu-cloud'], logoKey: 'baidu-cloud' },
  { keywords: ['bailian'], logoKey: 'bailian' },
  { keywords: ['dashscope'], logoKey: 'dashscope' },
  { keywords: ['modelscope'], logoKey: 'modelscope' },
  { keywords: ['internlm', 'internvl'], logoKey: 'internlm' },
  { keywords: ['yi-', 'zero-one', '01.ai'], logoKey: 'zero-one' },
  { keywords: ['step', 'stepfun'], logoKey: 'step' },
  { keywords: ['cohere', 'command-r', 'command-a', 'c4ai'], logoKey: 'cohere' },
  { keywords: ['perplexity', 'pplx', 'sonar'], logoKey: 'perplexity' },
  { keywords: ['huggingface', 'hf-'], logoKey: 'huggingface' },
  { keywords: ['nvidia', 'nemotron'], logoKey: 'nvidia' },
  { keywords: ['stability', 'stable-diffusion', 'sdxl', 'sd3'], logoKey: 'stability' },
  { keywords: ['ollama'], logoKey: 'ollama' },
  { keywords: ['lmstudio'], logoKey: 'lmstudio' },
  { keywords: ['azure', 'microsoft', 'phi-'], logoKey: 'azureai' },
  { keywords: ['bedrock', 'titan'], logoKey: 'aws-bedrock' },
  { keywords: ['kling', 'kolors'], logoKey: 'kling' },
  { keywords: ['jimeng'], logoKey: 'jimeng' },
  { keywords: ['jina'], logoKey: 'jina' },
  { keywords: ['voyage'], logoKey: 'voyage' },
  { keywords: ['upstage', 'solar'], logoKey: 'upstage' },
  { keywords: ['hunyuan', 'hy3', 'hy-'], logoKey: 'hunyuan' },
  { keywords: ['tencent'], logoKey: 'tencent-cloud-ti' },
  { keywords: ['cerebras'], logoKey: 'cerebras' },
  { keywords: ['fireworks'], logoKey: 'fireworks' },
  { keywords: ['hyperbolic'], logoKey: 'hyperbolic' },
  { keywords: ['alaya', 'alayanew'], logoKey: 'alayanew' },
  { keywords: ['ai21', 'jamba', 'j2-'], logoKey: 'ai21' },
  { keywords: ['infini', 'megrez'], logoKey: 'infini' },
  { keywords: ['coze'], logoKey: 'coze' },
  { keywords: ['aionlabs', 'aion'], logoKey: 'aionlabs' },
  { keywords: ['baai', 'bge'], logoKey: 'baai' },
  { keywords: ['google', 'palm', 'veo', 'imagen'], logoKey: 'google' },
  { keywords: ['vertex', 'vertexai'], logoKey: 'vertexai' },
  // Muse Spark/Glimmer 为 Meta 旗下模型（meta/muse-spark-1.2，family: muse），需映射到 Meta
  { keywords: ['muse'], logoKey: 'meta' },
  // 讯飞星火 Spark 模型
  { keywords: ['spark'], logoKey: 'spark' },
  // 讯飞星火提供商
  { keywords: ['xinghuo', 'xirang', 'xunfei'], logoKey: 'xinghuo' },
  { keywords: ['openai', 'gpt', 'chatgpt', 'codex', 'o1', 'o3', 'o4', 'dall-e', 'whisper'], logoKey: 'openai' },
  { keywords: ['openrouter'], logoKey: 'openrouter' },
];

const inferThirdPartyLogoKeyFromModelId = (modelId?: string): string | null => {
  if (!modelId) {
    return null;
  }
  const lower = modelId.toLowerCase();
  // 腾讯混元 hy3/hy 系列：兼容 Cherry 的 /^(?:hunyuan|hy-|hy\d)/i，但用 includes 需额外处理 hy3 无分隔符
  if (/(?:^|[-_/.:])hy\d/i.test(modelId)) {
    return 'hunyuan';
  }
  for (const rule of MODEL_ID_KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return rule.logoKey;
      }
    }
  }
  return null;
};

const resolveThirdPartyLogoKey = (templateId?: string, providerId?: string, modelId?: string): string => {
  const inferred = inferThirdPartyLogoKeyFromModelId(modelId);
  if (inferred && (inferred in THIRD_PARTY_PROVIDER_LOGO || inferred in THIRD_PARTY_TEMPLATE_LOGO)) {
    return inferred;
  }
  const raw = templateId || providerId || '';
  if (raw === 'custom-openai' || raw === 'custom-anthropic' || raw === 'custom') {
    return 'custom';
  }
  if (raw in THIRD_PARTY_PROVIDER_LOGO || raw in THIRD_PARTY_TEMPLATE_LOGO) {
    return raw;
  }
  return 'custom';
};

export const getThirdPartyTemplateLogo = (templateId?: string, providerId?: string, modelId?: string): string => {
  const key = resolveThirdPartyLogoKey(templateId, providerId, modelId);
  if (key in THIRD_PARTY_TEMPLATE_LOGO) {
    return THIRD_PARTY_TEMPLATE_LOGO[key as ThirdPartyTemplateId];
  }
  if (key in THIRD_PARTY_PROVIDER_LOGO) {
    return THIRD_PARTY_PROVIDER_LOGO[key as string];
  }
  return customLogoUrl;
};

type ModelBrandIconKey = 'gemini' | 'gemma' | 'nanobanana';

const BRAND_ICON_SRC: Record<ModelBrandIconKey, string> = {
  gemini: geminiIconUrl,
  gemma: gemmaIconUrl,
  nanobanana: nanoBananaIconUrl,
};

const BRAND_ICON_ALT: Record<ModelBrandIconKey, string> = {
  gemini: 'Gemini',
  gemma: 'Gemma',
  nanobanana: 'Nano Banana',
};

const BrandModelIcon = ({ brand, size = MODEL_ICON_SIZE }: { brand: ModelBrandIconKey; size?: number }) => (
  <div
    className="flex-shrink-0 flex items-center justify-center"
    style={{ width: size, height: size }}
    data-model-brand-icon={brand}
  >
    <img
      src={BRAND_ICON_SRC[brand]}
      alt={BRAND_ICON_ALT[brand]}
      draggable={false}
      className="h-full w-full object-contain"
    />
  </div>
);

const ProviderLogo = ({
  templateId,
  providerId,
  modelId,
  size = MODEL_ICON_SIZE,
}: {
  templateId?: string;
  providerId?: string;
  modelId?: string;
  size?: number;
}) => {
  const logoKey = resolveThirdPartyLogoKey(templateId, providerId, modelId);
  const inferredKey = inferThirdPartyLogoKeyFromModelId(modelId);
  const inferredLabel = inferredKey
    ? CHERRY_PROVIDER_LABELS[inferredKey] ||
      THIRD_PARTY_PROVIDER_LABELS[inferredKey as ThirdPartyProviderId] ||
      THIRD_PARTY_TEMPLATE_LABELS[inferredKey as ThirdPartyTemplateId]
    : undefined;
  const label =
    inferredLabel ||
    (templateId && THIRD_PARTY_TEMPLATE_LABELS[templateId as ThirdPartyTemplateId]) ||
    (providerId && THIRD_PARTY_PROVIDER_LABELS[providerId as ThirdPartyProviderId]) ||
    CHERRY_PROVIDER_LABELS[logoKey] ||
    logoKey;
  const isThin = THIN_LINE_ICON_KEYS.has(logoKey);

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
      data-model-provider-logo={logoKey}
    >
      <img
        src={getThirdPartyTemplateLogo(templateId, providerId, modelId)}
        alt={label}
        draggable={false}
        className="h-full w-full object-contain"
        style={isThin ? { transform: 'scale(1.08)' } : undefined}
      />
    </div>
  );
};

const resolveBrandIcon = (model: ModelOption): ModelBrandIconKey | null => {
  const normalizedId = model.id.toLowerCase();
  const { isImageGenerationModel, isGemmaModel } = getCachedModelCapabilities(model.id);

  // Nano Banana family: any image-capable model, plus the literal Nano Banana ids.
  if (isImageGenerationModel || normalizedId.includes('nano-banana') || normalizedId.includes('nanobanana')) {
    return 'nanobanana';
  }

  if (isGemmaModel || normalizedId.includes('gemma')) {
    return 'gemma';
  }

  // All other Gemini family models (Flash/Pro/Lite/Live/TTS/Robotics/Audio, etc.)
  if (normalizedId.includes('gemini')) {
    return 'gemini';
  }

  return null;
};

export const getModelIcon = (model: ModelOption | undefined) => {
  if (!model) {
    return <Box size={MODEL_ICON_SIZE} className="text-[var(--theme-text-tertiary)]" strokeWidth={1.5} />;
  }

  const brand = resolveBrandIcon(model);
  if (brand) {
    return <BrandModelIcon brand={brand} />;
  }

  if (model.templateId || (model.providerId && model.providerId !== GEMINI_PROVIDER_ID)) {
    return <ProviderLogo templateId={model.templateId} providerId={model.providerId} modelId={model.id} />;
  }

  if (model.isPinned) {
    return (
      <Sparkles size={MODEL_ICON_SIZE} className="text-sky-500 dark:text-sky-400 flex-shrink-0" strokeWidth={1.5} />
    );
  }

  return (
    <Box
      size={MODEL_ICON_SIZE}
      className="text-[var(--theme-text-tertiary)] opacity-70 flex-shrink-0"
      strokeWidth={1.5}
    />
  );
};

export { THIRD_PARTY_PROVIDER_LOGO };
