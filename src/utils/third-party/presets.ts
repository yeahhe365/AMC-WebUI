import {
  THIRD_PARTY_TEMPLATE_IDS,
  type LegacyThirdPartyProviderId,
  type ModelOption,
  type ThirdPartyApiProtocol,
  type ThirdPartyTemplateId,
} from '@/types';

export const THIRD_PARTY_PROVIDER_LABELS: Record<LegacyThirdPartyProviderId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  custom: 'Custom',
};

export const THIRD_PARTY_TEMPLATE_LABELS: Record<ThirdPartyTemplateId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  siliconflow: 'SiliconFlow',
  groq: 'Groq',
  together: 'Together AI',
  nvidia: 'Nvidia',
  minimax: 'MiniMax',
  grok: 'Grok',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  doubao: 'Doubao (火山引擎)',
  mistral: 'Mistral AI',
  cerebras: 'Cerebras',
  fireworks: 'Fireworks AI',
  opencode: 'OpenCode Go',
  hunyuan: 'Tencent Hunyuan (腾讯混元)',
  huggingface: 'Hugging Face',
  atlascloud: 'Atlas Cloud',
  'custom-openai': 'Custom (OpenAI compatible)',
  'custom-anthropic': 'Custom (Anthropic)',
};

export interface TemplatePresetMeta {
  id: ThirdPartyTemplateId;
  name: string;
  category: 'recommended' | 'domestic' | 'local';
  description?: string;
}

export const TEMPLATE_PRESETS: TemplatePresetMeta[] = [
  // Recommended / International
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'recommended',
    description: '深度求索官方 API (DeepSeek Flash, V4 Pro)',
  },
  { id: 'openai', name: 'OpenAI', category: 'recommended', description: 'GPT-6 系列官方接口 (Sol / Astra / Luna)' },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'recommended',
    description: 'Claude Fable / Opus / Sonnet / Haiku 现役档位',
  },
  { id: 'openrouter', name: 'OpenRouter', category: 'recommended', description: '聚合全球领先 AI 模型与路由' },
  { id: 'groq', name: 'Groq', category: 'recommended', description: 'LPU 极速推理平台' },
  { id: 'together', name: 'Together AI', category: 'recommended', description: '开源模型云端高性能托管' },
  { id: 'nvidia', name: 'NVIDIA NIM', category: 'recommended', description: '英伟达云端微服务推理引擎' },
  { id: 'grok', name: 'xAI (Grok)', category: 'recommended', description: 'Grok 4.6, Grok 4 系列官方接口' },
  { id: 'mistral', name: 'Mistral AI', category: 'recommended', description: '欧洲顶尖开源与商业旗舰模型' },
  { id: 'cerebras', name: 'Cerebras', category: 'recommended', description: '晶圆级超高速推理解析' },
  { id: 'fireworks', name: 'Fireworks AI', category: 'recommended', description: '高并发低延迟生产级推理平台' },
  { id: 'opencode', name: 'OpenCode Go', category: 'recommended', description: 'Zen Go 开发者 AI 接口服务' },
  { id: 'huggingface', name: 'Hugging Face', category: 'recommended', description: '开源社区官方推理路由端点' },
  { id: 'atlascloud', name: 'Atlas Cloud', category: 'recommended', description: 'OpenAI 兼容的多模型 API 网关' },

  // Domestic
  {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动)',
    category: 'domestic',
    description: '高性价比模型分发平台 (DeepSeek 等全系列)',
  },
  { id: 'qwen', name: '通义千问 (Qwen)', category: 'domestic', description: '阿里云 DashScope 百炼通用大模型' },
  { id: 'kimi', name: 'Kimi (月之暗面)', category: 'domestic', description: 'Moonshot AI 超长上下文大模型' },
  { id: 'glm', name: '智谱清言 (GLM)', category: 'domestic', description: 'GLM-4, GLM-Zero 智谱大模型平台' },
  { id: 'doubao', name: '火山引擎 (豆包)', category: 'domestic', description: '字节跳动豆包企业级大模型平台' },
  { id: 'hunyuan', name: '腾讯混元 (Hunyuan)', category: 'domestic', description: '腾讯官方混元通用多模态大模型' },
  { id: 'minimax', name: 'MiniMax', category: 'domestic', description: 'ABAB 系列高精与多模态大模型' },

  // Local / Self-hosted
  { id: 'ollama', name: 'Ollama', category: 'local', description: '本地免密大模型运行引擎 (默认端口 11434)' },
  { id: 'lmstudio', name: 'LM Studio', category: 'local', description: '本地桌面推理工作站 (默认端口 1234)' },
];

export const isThirdPartyProtocol = (value: unknown): value is ThirdPartyApiProtocol =>
  value === 'openai-compatible' || value === 'anthropic' || value === 'openai-responses';

export const isThirdPartyTemplateId = (value: unknown): value is ThirdPartyTemplateId =>
  typeof value === 'string' && (THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(value);

export const cloneModels = (models: ModelOption[]): ModelOption[] => models.map((model) => ({ ...model }));

export interface ThirdPartyTemplateDefaults {
  name: string;
  baseUrl: string | null;
  modelId: string;
  models: ModelOption[];
  protocol: ThirdPartyApiProtocol;
  apiKeyUrl?: string;
  docUrl?: string;
  authOptional?: boolean;
}

export const TEMPLATE_DEFAULTS: Record<ThirdPartyTemplateId, ThirdPartyTemplateDefaults> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-6-sol',
    models: [
      { id: 'gpt-6-sol', name: 'GPT-6 Sol', isPinned: true },
      { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docUrl: 'https://platform.openai.com/docs',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-flash',
    models: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', isPinned: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docUrl: 'https://platform.deepseek.com/docs',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelId: 'claude-fable-5-1',
    models: [
      { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', isPinned: true },
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    protocol: 'anthropic',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    docUrl: 'https://docs.anthropic.com',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelId: '~openai/gpt-latest',
    models: [{ id: '~openai/gpt-latest', name: 'OpenAI GPT Latest', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docUrl: 'https://openrouter.ai/docs',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelId: 'qwen3.8-max',
    models: [
      { id: 'qwen3.8-max', name: 'Qwen3.8 Max', isPinned: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' },
    ],
    protocol: 'openai-compatible',
    // Intl (Singapore) console — mainland Bailian keys are region-bound and 401
    // against the -intl host.
    apiKeyUrl: 'https://modelstudio.console.alibabacloud.com/model/settings/api-key',
    docUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
  },
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelId: 'kimi-k3',
    models: [{ id: 'kimi-k3', name: 'Kimi K3', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.kimi.ai/console/api-keys',
    docUrl: 'https://platform.kimi.ai/docs',
  },
  glm: {
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-5.2',
    models: [{ id: 'glm-5.2', name: 'GLM-5.2', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docUrl: 'https://open.bigmodel.cn/dev/api',
  },
  siliconflow: {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelId: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', isPinned: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', isPinned: true },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docUrl: 'https://docs.siliconflow.cn',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelId: 'openai/gpt-oss-120b',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', isPinned: true },
      { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.groq.com/keys',
    docUrl: 'https://console.groq.com/docs',
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.ai/v1',
    modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct Turbo', isPinned: true },
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek V4.1 Flash' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://api.together.ai/settings/api-keys',
    docUrl: 'https://docs.together.ai',
  },
  nvidia: {
    name: 'Nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelId: 'meta/llama-3.3-70b-instruct',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', isPinned: true },
      { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://build.nvidia.com',
    docUrl: 'https://docs.api.nvidia.com',
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelId: 'MiniMax-M2.5',
    models: [
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', isPinned: true },
      { id: 'MiniMax-M2', name: 'MiniMax M2' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    docUrl: 'https://www.minimaxi.com/document',
  },
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    modelId: 'grok-4.7',
    models: [
      { id: 'grok-4.7', name: 'Grok 4.7', isPinned: true },
      { id: 'grok-4.6', name: 'Grok 4.6' },
      { id: 'grok-4.5', name: 'Grok 4.5' },
      { id: 'grok-4.3', name: 'Grok 4.3' },
      { id: 'grok-build-0.1', name: 'Grok Build 0.1' },
      { id: 'grok-4.20-0309-reasoning', name: 'Grok 4.20 Reasoning' },
      { id: 'grok-4.20-0309-non-reasoning', name: 'Grok 4.20 Non-Reasoning' },
      { id: 'grok-4.20-multi-agent-0309', name: 'Grok 4.20 Multi-Agent' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.x.ai',
    docUrl: 'https://docs.x.ai',
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelId: 'llama3.2',
    models: [{ id: 'llama3.2', name: 'Llama 3.2', isPinned: true }],
    protocol: 'openai-compatible',
    docUrl: 'https://ollama.com',
    authOptional: true,
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    modelId: 'local-model',
    models: [{ id: 'local-model', name: 'Local Model', isPinned: true }],
    protocol: 'openai-compatible',
    docUrl: 'https://lmstudio.ai',
    authOptional: true,
  },
  doubao: {
    name: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelId: 'doubao-pro-32k',
    models: [
      { id: 'doubao-pro-32k', name: 'Doubao Pro 32K', isPinned: true },
      { id: 'doubao-lite-32k', name: 'Doubao Lite 32K' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.volcengine.com/ark',
    docUrl: 'https://www.volcengine.com/docs/82379/1099470',
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    modelId: 'mistral-large-latest',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', isPinned: true },
      { id: 'codestral-latest', name: 'Codestral' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
    docUrl: 'https://docs.mistral.ai/',
  },
  opencode: {
    name: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    modelId: 'kimi-k3',
    models: [
      { id: 'kimi-k3', name: 'Kimi K3', isPinned: true },
      { id: 'glm-5.3', name: 'GLM 5.3' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://opencode.ai/auth',
    docUrl: 'https://opencode.ai/docs/go/',
  },
  hunyuan: {
    name: 'Tencent Hunyuan',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    modelId: 'hunyuan-turbos-latest',
    models: [{ id: 'hunyuan-turbos-latest', name: 'Hunyuan Turbos', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    docUrl: 'https://cloud.tencent.com/document/product/1729',
  },
  huggingface: {
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    modelId: 'meta-llama/Llama-3.3-70B-Instruct',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', isPinned: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://huggingface.co/settings/tokens',
    docUrl: 'https://huggingface.co/docs/inference-providers/',
  },
  atlascloud: {
    name: 'Atlas Cloud',
    baseUrl: 'https://api.atlascloud.ai/v1',
    modelId: 'deepseek-ai/deepseek-v4-pro',
    models: [{ id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', isPinned: true }],
    protocol: 'openai-compatible',
  },
  cerebras: {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    modelId: 'gpt-oss-120b',
    models: [
      { id: 'gpt-oss-120b', name: 'GPT OSS 120B', isPinned: true },
      { id: 'qwen-3.8-27b', name: 'Qwen 3.8 27B' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://cloud.cerebras.ai/',
    docUrl: 'https://inference-docs.cerebras.ai/',
  },
  fireworks: {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    modelId: 'accounts/fireworks/models/deepseek-r1',
    models: [
      { id: 'accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1', isPinned: true },
      { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://fireworks.ai/api-keys',
    docUrl: 'https://docs.fireworks.ai/',
  },
  'custom-openai': {
    name: 'Custom',
    baseUrl: null,
    modelId: 'custom-model',
    models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
    protocol: 'openai-compatible',
  },
  'custom-anthropic': {
    name: 'Custom (Anthropic)',
    baseUrl: null,
    modelId: 'custom-model',
    models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
    protocol: 'anthropic',
  },
};

export const LEGACY_TEMPLATE_ID: Record<LegacyThirdPartyProviderId, ThirdPartyTemplateId> = {
  openai: 'openai',
  deepseek: 'deepseek',
  anthropic: 'anthropic',
  openrouter: 'openrouter',
  qwen: 'qwen',
  kimi: 'kimi',
  glm: 'glm',
  custom: 'custom-openai',
};

export const getThirdPartyTemplateDefaults = (templateId: ThirdPartyTemplateId): ThirdPartyTemplateDefaults => ({
  ...TEMPLATE_DEFAULTS[templateId],
  models: cloneModels(TEMPLATE_DEFAULTS[templateId].models),
});

export const getThirdPartyTemplateLinks = (
  templateId: ThirdPartyTemplateId,
): { apiKeyUrl?: string; docUrl?: string } => {
  const defaults = TEMPLATE_DEFAULTS[templateId];
  return {
    apiKeyUrl: defaults?.apiKeyUrl,
    docUrl: defaults?.docUrl,
  };
};
