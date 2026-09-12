import { Box, Sparkles } from 'lucide-react';

import geminiIconUrl from '@/assets/model-icons/gemini.svg';
import gemmaIconUrl from '@/assets/model-icons/gemma.svg';
import nanoBananaIconUrl from '@/assets/model-icons/nanobanana.svg';
import customLogoUrl from '@/assets/model-icons/providers/custom.png';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { THIRD_PARTY_PROVIDER_LABELS, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';
import { type ModelOption, type ThirdPartyProviderId, type ThirdPartyTemplateId, GEMINI_PROVIDER_ID } from '@/types';
import {
  CHERRY_MODEL_LOGOS,
  CHERRY_PROVIDER_LOGOS,
  CHERRY_PROVIDER_LABELS,
  formatIconLabel,
  resolveIconRef,
} from './modelIconRegistry';

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
 * 第三方 Provider 与 Model Logo 映射
 * 融合 Cherry Studio 168+ 模型矢量图标与 157+ 服务商矢量图标 (AGPL-3.0)
 */
export const THIRD_PARTY_PROVIDER_LOGO: Record<string, string> = {
  ...CHERRY_PROVIDER_LOGOS,
  ...CHERRY_MODEL_LOGOS,
  custom: customLogoUrl,
  openai: CHERRY_PROVIDER_LOGOS['openai'] || customLogoUrl,
  deepseek: CHERRY_PROVIDER_LOGOS['deepseek'] || customLogoUrl,
  anthropic: CHERRY_PROVIDER_LOGOS['anthropic'] || customLogoUrl,
  openrouter: CHERRY_PROVIDER_LOGOS['openrouter'] || customLogoUrl,
  qwen: CHERRY_PROVIDER_LOGOS['qwen'] || customLogoUrl,
  kimi: CHERRY_PROVIDER_LOGOS['moonshot'] || CHERRY_MODEL_LOGOS['kimi'] || customLogoUrl,
  glm: CHERRY_PROVIDER_LOGOS['zhipu'] || CHERRY_MODEL_LOGOS['glm'] || customLogoUrl,
  siliconflow: CHERRY_PROVIDER_LOGOS['silicon'] || customLogoUrl,
  doubao: CHERRY_PROVIDER_LOGOS['doubao'] || CHERRY_PROVIDER_LOGOS['volcengine'] || customLogoUrl,
  stepfun: CHERRY_PROVIDER_LOGOS['step'] || customLogoUrl,
  yi: CHERRY_PROVIDER_LOGOS['zero-one'] || customLogoUrl,
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
  modelName,
  size = MODEL_ICON_SIZE,
}: {
  templateId?: string;
  providerId?: string;
  modelId?: string;
  modelName?: string;
  size?: number;
}) => {
  const { key: logoKey, url: logoUrl, darkUrl } = resolveIconRef(modelId, providerId, templateId, modelName);
  const label =
    (templateId && THIRD_PARTY_TEMPLATE_LABELS[templateId as ThirdPartyTemplateId]) ||
    (providerId && THIRD_PARTY_PROVIDER_LABELS[providerId as ThirdPartyProviderId]) ||
    CHERRY_PROVIDER_LABELS[logoKey] ||
    formatIconLabel(logoKey);
  const isThin = THIN_LINE_ICON_KEYS.has(logoKey);

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
      data-model-provider-logo={logoKey}
    >
      {darkUrl ? (
        <>
          <img
            src={logoUrl}
            alt={label}
            draggable={false}
            className="h-full w-full object-contain dark:hidden"
            style={isThin ? { transform: 'scale(1.08)' } : undefined}
          />
          <img
            src={darkUrl}
            alt={label}
            draggable={false}
            className="h-full w-full object-contain hidden dark:block"
            style={isThin ? { transform: 'scale(1.08)' } : undefined}
          />
        </>
      ) : (
        <img
          src={logoUrl}
          alt={label}
          draggable={false}
          className="h-full w-full object-contain"
          style={isThin ? { transform: 'scale(1.08)' } : undefined}
        />
      )}
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

  const iconRef = resolveIconRef(model.id, model.providerId, model.templateId, model.name);
  if (iconRef.key !== 'custom' || model.templateId || (model.providerId && model.providerId !== GEMINI_PROVIDER_ID)) {
    return (
      <ProviderLogo
        templateId={model.templateId}
        providerId={model.providerId}
        modelId={model.id}
        modelName={model.name}
      />
    );
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
