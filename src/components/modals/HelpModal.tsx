import React, { useState, useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { X, HelpCircle, Search, Check, Copy } from 'lucide-react';
import { CommandIcon } from '@/components/icons/CommandIcon';
import { type CommandInfo } from '@/types';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import { SETTINGS_SEARCH_INPUT_CLASS } from '@/constants/designTokens';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandInfo[];
}

const COPIED_COMMAND_FEEDBACK_MS = 1500;

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, commands }) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const { copyToClipboard } = useCopyToClipboard();

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return commands;
    const lowerQuery = searchQuery.toLowerCase();
    return commands.filter(
      (cmd) => cmd.name.toLowerCase().includes(lowerQuery) || cmd.description.toLowerCase().includes(lowerQuery),
    );
  }, [commands, searchQuery]);

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    setCopiedCommand(text);
    setTimeout(() => setCopiedCommand(null), COPIED_COMMAND_FEEDBACK_MS);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] shadow-premium sm:max-h-[650px] sm:max-w-2xl"
        role="document"
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--theme-border-primary)] p-4">
          <h2
            id="help-modal-title"
            className="flex items-center gap-2 text-lg font-semibold text-[var(--theme-text-primary)]"
          >
            <HelpCircle size={18} className="text-[var(--theme-text-tertiary)]" />
            {t('helpModalTitle')}
          </h2>
          <button onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS} aria-label={t('helpModalCloseAria')}>
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)]"
              size={16}
            />
            <input
              type="search"
              placeholder={t('helpModalSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className={SETTINGS_SEARCH_INPUT_CLASS}
            />
          </div>
        </div>

        <div className="min-h-0 flex-grow overflow-y-auto custom-scrollbar p-2 sm:p-3">
          {filteredCommands.length > 0 ? (
            <ul className="flex flex-col">
              {filteredCommands.map((command) => (
                <li key={command.name}>
                  <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-[var(--theme-bg-tertiary)]/70">
                    <span className="flex-shrink-0 text-[var(--theme-text-tertiary)]">
                      <CommandIcon icon={command.icon || 'bot'} />
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(command.name)}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-md text-left ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
                      title={t('helpModalCopyTitle')}
                    >
                      <code className="w-36 flex-shrink-0 truncate font-mono text-sm font-medium text-[var(--theme-text-primary)]">
                        {command.name}
                      </code>
                      <p className="min-w-0 flex-1 truncate text-sm text-[var(--theme-text-secondary)]">
                        {command.description}
                      </p>
                      {copiedCommand === command.name ? (
                        <Check size={14} className="flex-shrink-0 text-[var(--theme-text-success)]" />
                      ) : (
                        <Copy size={14} className="flex-shrink-0 text-[var(--theme-text-tertiary)]" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--theme-text-tertiary)]">
              {t('helpModalNoResults')}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--theme-border-secondary)] px-4 py-2.5 text-center">
          <p className="text-xs text-[var(--theme-text-tertiary)]">{t('helpModalTip')}</p>
        </div>
      </div>
    </Modal>
  );
};
