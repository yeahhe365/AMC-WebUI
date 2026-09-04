import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { getThirdPartyTemplateLogo } from '@/components/shared/ModelIcon';
import { THIRD_PARTY_TEMPLATE_IDS, type ThirdPartyTemplateId } from '@/types';
import { getThirdPartyTemplateDefaults, THIRD_PARTY_TEMPLATE_LABELS } from '@/utils/thirdPartyApiProviders';

const TEMPLATE_LABEL_KEYS: Record<ThirdPartyTemplateId, string> = {
  openai: 'thirdPartyTemplateOpenai',
  deepseek: 'thirdPartyTemplateDeepseek',
  anthropic: 'thirdPartyTemplateAnthropic',
  openrouter: 'thirdPartyTemplateOpenrouter',
  qwen: 'thirdPartyTemplateQwen',
  kimi: 'thirdPartyTemplateKimi',
  glm: 'thirdPartyTemplateGlm',
  nvidia: 'thirdPartyTemplateNvidia',
  minimax: 'thirdPartyTemplateMinimax',
  grok: 'thirdPartyTemplateGrok',
  atlascloud: 'thirdPartyTemplateAtlascloud',
  'custom-openai': 'thirdPartyTemplateCustomOpenai',
  'custom-anthropic': 'thirdPartyTemplateCustomAnthropic',
};

interface ThirdPartyAddConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: ThirdPartyTemplateId) => void;
  templates?: readonly ThirdPartyTemplateId[];
}

export const ThirdPartyAddConnectionDialog: React.FC<ThirdPartyAddConnectionDialogProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  templates = THIRD_PARTY_TEMPLATE_IDS,
}) => {
  const { t } = useI18n();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="third-party-template-picker"
      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-3 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('thirdPartyAddConnectionTitle')}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-secondary)]"
        >
          {t('cancel')}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((templateId) => {
          const defaultUrl = getThirdPartyTemplateDefaults(templateId).baseUrl;
          return (
            <button
              key={templateId}
              type="button"
              data-testid={`third-party-template-${templateId}`}
              onClick={() => onSelectTemplate(templateId)}
              className="flex items-start gap-2 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-2.5 text-left text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
            >
              <img
                src={getThirdPartyTemplateLogo(templateId)}
                alt=""
                width={18}
                height={18}
                draggable={false}
                className="flex-shrink-0 object-contain mt-0.5"
              />
              <span className="min-w-0">
                <span className="block truncate">
                  {t(TEMPLATE_LABEL_KEYS[templateId]) || THIRD_PARTY_TEMPLATE_LABELS[templateId]}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--theme-text-secondary)]">
                  {defaultUrl || t('thirdPartyTemplateSetUrlAfterAdd')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
