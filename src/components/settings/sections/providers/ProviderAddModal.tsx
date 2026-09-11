import React, { useMemo, useState } from 'react';
import { Search, X, Server } from 'lucide-react';
import type { ThirdPartyTemplateId } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { SETTINGS_SECONDARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';
import { getThirdPartyTemplateDefaults, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';
import { ProviderAvatar } from './ProviderAvatar';

interface ProviderAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: ThirdPartyTemplateId) => void;
}

interface TemplatePresetMeta {
  id: ThirdPartyTemplateId;
  name: string;
  category: 'recommended' | 'domestic' | 'local' | 'custom';
  description?: string;
}

const TEMPLATE_PRESETS: TemplatePresetMeta[] = [
  // Recommended / International
  { id: 'deepseek', name: 'DeepSeek', category: 'recommended', description: '深度求索官方 API' },
  { id: 'openai', name: 'OpenAI', category: 'recommended', description: 'GPT-4o, o1, o3-mini' },
  { id: 'anthropic', name: 'Anthropic', category: 'recommended', description: 'Claude 3.7 Sonnet, Claude 3.5' },
  { id: 'openrouter', name: 'OpenRouter', category: 'recommended', description: '聚合全球领先 AI 模型' },
  { id: 'groq', name: 'Groq', category: 'recommended', description: 'LPU 极速推理平台' },
  { id: 'together', name: 'Together AI', category: 'recommended', description: '开源模型云端托管' },
  { id: 'nvidia', name: 'NVIDIA NIM', category: 'recommended', description: '英伟达云端微服务' },
  { id: 'grok', name: 'xAI (Grok)', category: 'recommended', description: 'Grok 2, Grok 3' },
  { id: 'mistral', name: 'Mistral AI', category: 'recommended', description: '欧洲顶尖开源与商业模型' },
  { id: 'perplexity', name: 'Perplexity', category: 'recommended', description: '联网搜索与前沿问答' },
  { id: 'cerebras', name: 'Cerebras', category: 'recommended', description: '超高速推理解析' },
  { id: 'fireworks', name: 'Fireworks AI', category: 'recommended', description: '高并发低延迟推理平台' },

  // Domestic
  { id: 'qwen', name: '通义千问 (Qwen)', category: 'domestic', description: '阿里云 DashScope' },
  { id: 'siliconflow', name: 'SiliconFlow (硅基流动)', category: 'domestic', description: '高性价比模型分发平台' },
  { id: 'kimi', name: 'Kimi (月之暗面)', category: 'domestic', description: 'Moonshot AI 超长上下文' },
  { id: 'glm', name: '智谱清言 (GLM)', category: 'domestic', description: 'GLM-4, GLM-Zero' },
  { id: 'doubao', name: '火山引擎 (豆包)', category: 'domestic', description: '字节跳动豆包企业大模型平台' },
  { id: 'stepfun', name: '阶跃星辰 (StepFun)', category: 'domestic', description: 'Step-2 万亿参数大模型' },
  { id: 'yi', name: '零一万物 (01.AI)', category: 'domestic', description: 'Yi-Lightning 极速高精模型' },
  { id: 'baichuan', name: '百川智能 (Baichuan)', category: 'domestic', description: 'Baichuan 4 通用大模型' },
  { id: 'minimax', name: 'MiniMax', category: 'domestic', description: 'ABAB 系列与语音大模型' },

  // Local / Self-hosted
  { id: 'ollama', name: 'Ollama', category: 'local', description: '本地免密大模型运行引擎' },
  { id: 'lmstudio', name: 'LM Studio', category: 'local', description: '本地桌面推理工作站' },

  // Custom
  {
    id: 'custom-openai',
    name: '自定义 OpenAI 格式',
    category: 'custom',
    description: '兼容 /v1/chat/completions 的任何第三方中转/平台',
  },
  {
    id: 'custom-anthropic',
    name: '自定义 Anthropic 格式',
    category: 'custom',
    description: '兼容 /v1/messages 的中转或反代接口',
  },
];

export const ProviderAddModal: React.FC<ProviderAddModalProps> = ({ isOpen, onClose, onSelectTemplate }) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'recommended' | 'domestic' | 'local' | 'custom'>(
    'all',
  );

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATE_PRESETS.filter((preset) => {
      if (selectedCategory !== 'all' && preset.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const label = (THIRD_PARTY_TEMPLATE_LABELS[preset.id] || preset.name).toLowerCase();
      const desc = (preset.description || '').toLowerCase();
      return label.includes(q) || desc.includes(q) || preset.id.includes(q);
    });
  }, [search, selectedCategory]);

  if (!isOpen) return null;

  const getPresetDisplayName = (preset: TemplatePresetMeta) => {
    if (preset.id === 'custom-openai') return t('thirdPartyCustomOpenAIName');
    if (preset.id === 'custom-anthropic') return t('thirdPartyCustomAnthropicName');
    return THIRD_PARTY_TEMPLATE_LABELS[preset.id] || preset.name;
  };

  const getPresetDescription = (preset: TemplatePresetMeta) => {
    if (preset.id === 'custom-openai') return t('thirdPartyCustomOpenAIDesc');
    if (preset.id === 'custom-anthropic') return t('thirdPartyCustomAnthropicDesc');
    return preset.description;
  };

  const categories = [
    { id: 'all', label: t('thirdPartyCategoryAll') },
    { id: 'recommended', label: t('thirdPartyCategoryRecommended') },
    { id: 'domestic', label: t('thirdPartyCategoryDomestic') },
    { id: 'local', label: t('thirdPartyCategoryLocal') },
    { id: 'custom', label: t('thirdPartyCategoryCustom') },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-2xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[var(--theme-border-secondary)]/40 pb-3 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">
              {t('thirdPartyAddConnectionTitle')}
            </h3>
            <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{t('thirdPartyAddConnectionSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 flex-shrink-0">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('thirdPartySearchPresetsPlaceholder')}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border ${SETTINGS_INPUT_CLASS}`}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors select-none ${
                  selectedCategory === cat.id
                    ? 'bg-[var(--theme-border-focus)] text-white'
                    : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-h-[280px]">
          {filteredPresets.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--theme-text-secondary)]">
              <Server size={32} className="opacity-30 mb-2" />
              <p>{t('thirdPartyNoMatchingPresets')}</p>
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const defaultUrl = getThirdPartyTemplateDefaults(preset.id).baseUrl;
              const displayName = getPresetDisplayName(preset);
              const displayDesc = getPresetDescription(preset);

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectTemplate(preset.id)}
                  className="flex items-start gap-3 p-3 rounded-xl border border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-secondary)]/30 hover:bg-[var(--theme-bg-tertiary)]/40 hover:border-[var(--theme-border-focus)]/50 transition-all text-left group cursor-pointer"
                >
                  <ProviderAvatar
                    name={displayName}
                    templateId={preset.id}
                    size={32}
                    className="mt-0.5 flex-shrink-0 group-hover:scale-105 transition-transform"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-[var(--theme-text-primary)] group-hover:text-[var(--theme-text-focus)] truncate">
                        {displayName}
                      </span>
                      {preset.category === 'local' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] font-mono flex-shrink-0">
                          {t('thirdPartyLocalTag')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5 line-clamp-1">{displayDesc}</p>
                    <p className="text-[10px] font-mono text-[var(--theme-text-secondary)]/70 mt-1 truncate">
                      {defaultUrl || t('thirdPartyUserCustomEndpoint')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end pt-3 border-t border-[var(--theme-border-secondary)]/40 flex-shrink-0">
          <button type="button" onClick={onClose} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
