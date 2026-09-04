import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { User, Bot, Send } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getShortcutDisplay, isShortcutPressed } from '@/utils/keyboardShortcuts';

interface ScenarioMessageInputProps {
  role: 'user' | 'model';
  setRole: (role: 'user' | 'model') => void;
  content: string;
  setContent: (content: string) => void;
  onAdd: () => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  readOnly: boolean;
}

export const ScenarioMessageInput: React.FC<ScenarioMessageInputProps> = ({
  role,
  setRole,
  content,
  setContent,
  onAdd,
  inputRef,
  readOnly,
}) => {
  const { t } = useI18n();
  const appSettings = useSettingsStore((state) => state.appSettings);
  const saveConfirmShortcut = getShortcutDisplay('global.saveConfirm', appSettings);

  if (readOnly) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isShortcutPressed(e, 'global.saveConfirm', appSettings)) {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <div className="flex-shrink-0 p-3 sm:p-4 bg-[var(--theme-bg-secondary)]/45 border-t border-[var(--theme-border-secondary)]">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold text-[var(--theme-text-tertiary)] uppercase tracking-wider">
          {t('scenariosEditorAddMessageAs')}
        </span>
        <div className="flex bg-[var(--theme-bg-input)] p-0.5 rounded-lg border border-[var(--theme-border-secondary)]">
          <button
            onClick={() => setRole('user')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${role === 'user' ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm' : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'}`}
          >
            <User size={12} /> {t('scenariosEditorRoleUser')}
          </button>
          <button
            onClick={() => setRole('model')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${role === 'model' ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm' : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'}`}
          >
            <Bot size={12} /> {t('scenariosEditorRoleModel')}
          </button>
        </div>
      </div>

      <div className="relative group">
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('scenariosEditorContentPlaceholder')}
          className="w-full p-4 pr-14 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] resize-none transition-colors"
          rows={2}
        />
        <button
          onClick={onAdd}
          disabled={!content.trim()}
          className="absolute right-2 bottom-2 p-2 bg-[var(--theme-bg-accent)] hover:bg-[var(--theme-bg-accent-hover)] text-[var(--theme-text-accent)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={18} strokeWidth={2.5} />
        </button>
      </div>
      <div className="text-xs text-[var(--theme-text-tertiary)] mt-2 text-center font-medium opacity-60">
        {saveConfirmShortcut} {t('add')}
      </div>
    </div>
  );
};
