import React from 'react';
import {
  BrainCircuit,
  Eye,
  Ear,
  Video,
  FileText,
  Wrench,
  Globe,
  Code2,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Cpu,
} from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import {
  getModelSpecification,
  formatThinkingLevelSpec,
  type ModelCapabilityTag,
  type ModelModalityId,
} from '@/utils/model/modelSpecifications';

interface ModelDetailCardProps {
  model: ModelOption;
  renderModelIcon?: (model: ModelOption) => React.ReactNode;
  className?: string;
}

const MODALITY_ICONS: Record<ModelModalityId, React.ElementType> = {
  vision: Eye,
  audio: Ear,
  video: Video,
};

const CAPABILITY_ICONS: Record<ModelCapabilityTag['category'], React.ElementType> = {
  reasoning: BrainCircuit,
  tools: Wrench,
  search: Globe,
  code: Code2,
  image: ImageIcon,
  pdf: FileText,
  vision: Eye,
  audio: Ear,
};

const BADGE_STYLE =
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--theme-bg-tertiary)]/60 text-[var(--theme-text-secondary)] border border-[var(--theme-border-secondary)]/50 hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors';
const ICON_STYLE = 'text-[var(--theme-text-tertiary)] flex-shrink-0';

export const ModelDetailCard: React.FC<ModelDetailCardProps> = ({ model, renderModelIcon, className = '' }) => {
  const { t } = useI18n();
  const spec = getModelSpecification(model);

  const description = (spec.descriptionKey ? t(spec.descriptionKey) : undefined) || spec.description;
  const thinkingLevelDisplay =
    formatThinkingLevelSpec(spec.thinkingLevelSpec, t) || spec.thinkingLevelRange || spec.thinkingBudgetRange;

  const displayCapabilities = spec.capabilities.filter((cap) => cap.category !== 'vision' && cap.category !== 'audio');

  return (
    <div
      data-testid="model-detail-card"
      className={`w-72 sm:w-80 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] p-3.5 shadow-premium space-y-3 pointer-events-auto select-none ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0">
          {renderModelIcon ? (
            renderModelIcon(model)
          ) : (
            <div className="size-6 rounded-lg bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-primary)]">
              <Cpu size={14} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <h4 className="font-semibold text-sm text-[var(--theme-text-primary)] truncate" title={spec.modelName}>
              {spec.modelName}
            </h4>
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-secondary)]/50">
              {spec.providerDisplayName}
            </span>
          </div>
          <p className="font-mono text-xs text-[var(--theme-text-tertiary)] truncate" title={spec.modelId}>
            {spec.modelId}
          </p>
        </div>
      </div>

      {description && (
        <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)] line-clamp-2">{description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--theme-border-secondary)]/40">
        <div className="rounded-lg bg-[var(--theme-bg-tertiary)]/40 p-2 space-y-0.5 border border-[var(--theme-border-secondary)]/30">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-tertiary)]">
            <Layers size={12} className="flex-shrink-0" />
            <span className="truncate">{t('modelCardContext')}</span>
          </div>
          <p className="font-semibold text-xs text-[var(--theme-text-primary)] truncate" title={spec.contextWindow}>
            {spec.contextWindow}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--theme-bg-tertiary)]/40 p-2 space-y-0.5 border border-[var(--theme-border-secondary)]/30">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-tertiary)]">
            <Sparkles size={12} className="flex-shrink-0" />
            <span className="truncate">{t('modelCardOutput')}</span>
          </div>
          <p className="font-semibold text-xs text-[var(--theme-text-primary)] truncate" title={spec.maxOutput ?? '—'}>
            {spec.maxOutput ?? '—'}
          </p>
        </div>
      </div>

      {thinkingLevelDisplay && (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-indigo-500/5 border border-indigo-500/15 text-xs">
          <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
            <BrainCircuit size={12} className="flex-shrink-0" />
            <span>
              {spec.thinkingLevelSpec || spec.thinkingLevelRange
                ? t('modelCardThinkingLevel') || t('modelCardThinking')
                : t('modelCardThinking')}
            </span>
          </div>
          <span className="font-mono font-medium text-indigo-700 dark:text-indigo-300">{thinkingLevelDisplay}</span>
        </div>
      )}

      {spec.modalities && spec.modalities.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-[var(--theme-border-secondary)]/40">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
            {t('modelCardModalities')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {spec.modalities.map((modality) => {
              const Icon = MODALITY_ICONS[modality.id] || Eye;

              return (
                <span key={modality.id} className={BADGE_STYLE}>
                  <Icon size={12} className={ICON_STYLE} />
                  <span>{t(modality.labelKey) || modality.defaultLabel}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {displayCapabilities.length > 0 && (
        <div
          className={`space-y-1.5 pt-1 ${
            spec.modalities && spec.modalities.length > 0 ? '' : 'border-t border-[var(--theme-border-secondary)]/40'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
            {t('modelCardCapabilities')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {displayCapabilities.map((cap) => {
              const Icon = CAPABILITY_ICONS[cap.category] || Sparkles;

              return (
                <span key={cap.id} className={BADGE_STYLE}>
                  <Icon size={12} className={ICON_STYLE} />
                  <span>{t(cap.labelKey) || cap.defaultLabel}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
