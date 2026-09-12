import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Send, Square } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { useSettingsAssistant } from '@/features/settings-assistant/useSettingsAssistant';
import { AssistantMessageList } from './AssistantMessageList';

export const ProviderAssistantPanel: React.FC = () => {
  const { t } = useI18n();
  const { items, status, channel, canSend, send, stop } = useSettingsAssistant();
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    setDraft('');
    await send(text);
  };

  return (
    <div data-testid="provider-assistant-panel" className="border-b border-[var(--theme-border-secondary)]/30">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]/40"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Bot size={14} />
        <span>{t('assistantPanelTitle')}</span>
      </button>

      {isOpen ? (
        <div className="px-4 pb-3 space-y-2">
          {channel.ok ? null : (
            <p data-testid="assistant-channel-disabled" className="text-[11px] text-[var(--theme-text-secondary)]">
              {t('assistantChannelUnavailable')}
            </p>
          )}

          {items.length > 0 ? <AssistantMessageList items={items} /> : null}

          <form data-testid="assistant-form" onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              data-testid="assistant-input"
              rows={2}
              value={draft}
              disabled={!channel.ok}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('assistantInputPlaceholder')}
              className={`${SETTINGS_INPUT_CLASS} flex-1 resize-y text-xs`}
            />
            {status === 'running' || status === 'awaiting-key' ? (
              <button
                type="button"
                onClick={stop}
                className="px-2.5 py-1.5 rounded-md text-xs bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend || !draft.trim()}
                className="px-2.5 py-1.5 rounded-md text-xs bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            )}
          </form>
        </div>
      ) : null}
    </div>
  );
};
