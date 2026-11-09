import React, { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useSettingsStore } from '@/stores/settingsStore';
import { isServerAccessPasswordRequired } from '@/runtime/runtimeConfig';
import { verifyServerAccessPassword } from '@/services/api/apiAuthHeaders';
import { Z_INDEX_TOAST_VIEWPORT } from '@/constants/layout';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { SETTINGS_PRIMARY_ACTION_BUTTON_CLASS } from '@/constants/buttonClasses';

/**
 * Asks for the deployment access password on deployments that require one.
 *
 * The password used to be shipped inside the public `runtime-config.js`, so it
 * was readable by anyone who fetched that file and the user never had to type
 * it. That file no longer carries it, which means the SPA has to learn from the
 * user instead — otherwise every `/api/*` call returns 401 with no explanation.
 *
 * The value is stored through `setAppSettings`, so it stays in this browser's
 * IndexedDB like every other credential and rides in `x-access-token`.
 */
export const ServerAccessPasswordPrompt: React.FC = () => {
  const { t } = useI18n();
  const storedPassword = useSettingsStore((state) => state.appSettings.serverAccessPassword ?? '');
  const isSettingsLoaded = useSettingsStore((state) => state.isSettingsLoaded);
  const setAppSettings = useSettingsStore((state) => state.setAppSettings);

  const [draft, setDraft] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Waiting for settings avoids a flash for users who already saved a password.
  if (!isSettingsLoaded || dismissed || !isServerAccessPasswordRequired() || storedPassword.trim().length > 0) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = draft.trim();
    if (!candidate || isVerifying) return;

    setIsVerifying(true);
    setIsRejected(false);
    try {
      const result = await verifyServerAccessPassword(candidate);
      if (!result.ok) {
        setIsRejected(true);
        return;
      }
      setAppSettings((previous) => ({ ...previous, serverAccessPassword: candidate }));
      setDraft('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      role="status"
      data-testid="server-access-password-prompt"
      className={`fixed bottom-4 left-4 right-4 mx-auto max-w-xl rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-3 text-[var(--theme-text-primary)] shadow-xl ${Z_INDEX_TOAST_VIEWPORT}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <KeyRound size={14} className="text-[var(--theme-accent-primary)]" />
            <span>{t('serverAccessPasswordPromptTitle')}</span>
          </p>
          <p className="text-xs text-[var(--theme-text-secondary)] mt-1">{t('serverAccessPasswordPromptBody')}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('close')}
          className="p-1 rounded text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="password"
          data-testid="server-access-password-prompt-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setIsRejected(false);
          }}
          placeholder={t('serverAccessPasswordPromptPlaceholder')}
          className={`flex-1 min-w-0 py-2 pl-3 pr-3 rounded-lg border text-sm font-mono ${SETTINGS_INPUT_CLASS}`}
          spellCheck={false}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isVerifying}
          className={`${SETTINGS_PRIMARY_ACTION_BUTTON_CLASS} disabled:opacity-50 disabled:pointer-events-none`}
        >
          {isVerifying ? <Loader2 size={12} className="animate-spin" /> : null}
          <span>{t('serverAccessPasswordPromptSubmit')}</span>
        </button>
      </form>

      {isRejected && (
        <p className="mt-2 text-xs text-[var(--theme-text-danger)]">{t('serverAccessPasswordPromptInvalid')}</p>
      )}
    </div>
  );
};
