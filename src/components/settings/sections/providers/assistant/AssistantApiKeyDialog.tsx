import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/shared/AlertDialog';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';

export const AssistantApiKeyDialog: React.FC = () => {
  const { t } = useI18n();
  const pendingKeyRequest = useSettingsAssistantStore((state) => state.pendingKeyRequest);
  const submitApiKey = useSettingsAssistantStore((state) => state.submitApiKey);
  const cancelApiKey = useSettingsAssistantStore((state) => state.cancelApiKey);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  if (!pendingKeyRequest) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    submitApiKey(apiKey.trim());
    setApiKey('');
  };

  const handleCancel = () => {
    cancelApiKey();
    setApiKey('');
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <AlertDialogContent className="w-full max-w-md rounded-xl border bg-[var(--theme-bg-primary)] p-0 shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-start gap-3 px-5 pt-5">
            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-base font-semibold text-[var(--theme-text-primary)]">
                {t('assistantApiKeyDialogTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="mt-1 text-xs text-[var(--theme-text-secondary)] space-y-1">
                  <p>
                    {interpolate(t('assistantApiKeyDialogDesc'), {
                      name: pendingKeyRequest.connectionName,
                    })}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium pt-1">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>端到端安全隔离：密钥不会传递给 AI 提示词或模型服务</span>
                  </div>
                </div>
              </AlertDialogDescription>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                autoFocus
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={`${SETTINGS_INPUT_CLASS} pr-10 font-mono text-xs`}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/40 px-5 py-3 rounded-b-xl">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-[var(--theme-border-secondary)] px-3 py-1.5 text-xs text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors"
            >
              {t('settingsMcpCancel')}
            </button>
            <button
              type="submit"
              disabled={!apiKey.trim()}
              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-sm"
            >
              {t('assistantApiKeyDialogSave')}
            </button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
