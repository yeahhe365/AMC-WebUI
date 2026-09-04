import React, { useState } from 'react';
import { Check, Info } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';

interface ApiKeyInputProps {
  apiKey: string | null;
  setApiKey: (value: string | null) => void;
  onFocus?: () => void;
  label?: string;
  placeholder?: string;
  helpText?: string;
  inputId?: string;
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  apiKey,
  setApiKey,
  onFocus,
  label,
  placeholder,
  helpText,
  inputId = 'api-key-input',
}) => {
  const { t } = useI18n();
  const [isFocused, setIsFocused] = useState(false);

  // Visual blur effect for API key when not focused
  const apiKeyBlurClass =
    !isFocused && apiKey ? 'text-transparent [text-shadow:0_0_6px_var(--theme-text-primary)] tracking-widest' : '';
  const inputBaseClasses =
    'w-full p-3 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm custom-scrollbar font-mono';

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
      >
        {label || t('settingsApiKey')}
      </label>
      <div className="relative">
        <textarea
          id={inputId}
          rows={3}
          value={apiKey || ''}
          onChange={(e) => {
            setApiKey(e.target.value || null);
          }}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => setIsFocused(false)}
          className={`${inputBaseClasses} ${SETTINGS_INPUT_CLASS} resize-y min-h-[80px] ${apiKeyBlurClass}`}
          placeholder={placeholder || t('apiConfigKeyPlaceholder')}
          spellCheck={false}
        />
        {!isFocused && apiKey && (
          <div className="absolute top-3 right-3 pointer-events-none">
            <Check size={16} className="text-[var(--theme-text-success)]" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--theme-text-secondary)] flex gap-1.5">
        <Info size={14} className="flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <span>{helpText || t('settingsApiKeyHelpText')}</span>
      </p>
    </div>
  );
};
