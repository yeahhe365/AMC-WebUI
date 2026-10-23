import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Check, X, Loader2, Info } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { verifyServerAccessPassword } from '@/services/api/apiAuthHeaders';

interface ServerAccessPasswordInputProps {
  serverAccessPassword: string | null;
  onUpdate: (password: string | null) => void;
  apiProxyUrl?: string | null;
}

export const ServerAccessPasswordInput: React.FC<ServerAccessPasswordInputProps> = ({
  serverAccessPassword,
  onUpdate,
  apiProxyUrl,
}) => {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!serverAccessPassword?.trim()) return;
    setIsVerifying(true);
    setVerifyStatus('idle');
    setErrorMessage(null);
    try {
      const result = await verifyServerAccessPassword(
        serverAccessPassword,
        apiProxyUrl?.startsWith('http') ? apiProxyUrl : undefined,
      );
      if (result.ok) {
        setVerifyStatus('success');
      } else {
        setVerifyStatus('error');
        setErrorMessage(result.message || t('settingsServerAccessPasswordInvalid'));
      }
    } catch (verifyError) {
      setVerifyStatus('error');
      setErrorMessage(verifyError instanceof Error ? verifyError.message : String(verifyError));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="server-access-password-section">
      <div className="flex items-center justify-between">
        <label
          htmlFor="server-access-password-input"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] flex items-center gap-1.5"
        >
          <KeyRound size={13} className="text-[var(--theme-accent-primary)]" />
          <span>{t('settingsServerAccessPassword')}</span>
        </label>
      </div>

      <div className="relative flex items-center">
        <input
          id="server-access-password-input"
          data-testid="server-access-password-input"
          type={showPassword ? 'text' : 'password'}
          value={serverAccessPassword || ''}
          onChange={(event) => {
            onUpdate(event.target.value || null);
            setVerifyStatus('idle');
            setErrorMessage(null);
          }}
          className={`w-full py-2 pl-3 pr-24 rounded-lg border transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm font-mono ${SETTINGS_INPUT_CLASS}`}
          placeholder={t('settingsServerAccessPasswordPlaceholder')}
          spellCheck={false}
          autoComplete="current-password"
        />
        <div className="absolute right-2 flex items-center gap-1">
          <button
            type="button"
            data-testid="toggle-show-password-button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={t(showPassword ? 'settingsHidePassword' : 'settingsShowPassword')}
            title={t(showPassword ? 'settingsHidePassword' : 'settingsShowPassword')}
            className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors rounded"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          {serverAccessPassword?.trim() && (
            <button
              type="button"
              data-testid="verify-server-password-button"
              onClick={handleVerify}
              disabled={isVerifying}
              className="px-2 py-1 text-xs font-medium rounded-md bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-accent)] hover:text-[var(--theme-text-accent)] text-[var(--theme-text-primary)] transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {isVerifying ? <Loader2 size={12} className="animate-spin" /> : null}
              <span>{t('apiConfigTestConnection')}</span>
            </button>
          )}
        </div>
      </div>

      {verifyStatus === 'success' && (
        <div
          data-testid="server-access-password-success"
          className="flex items-center gap-1.5 text-xs text-emerald-500 animate-in fade-in"
        >
          <Check size={14} />
          <span>{t('settingsServerAccessPasswordVerified')}</span>
        </div>
      )}

      {verifyStatus === 'error' && errorMessage && (
        <div
          data-testid="server-access-password-error"
          className="flex items-center gap-1.5 text-xs text-[var(--theme-text-danger)] animate-in fade-in"
        >
          <X size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      <p className="text-xs text-[var(--theme-text-secondary)] flex gap-1.5">
        <Info size={14} className="flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <span>{t('settingsServerAccessPasswordHelp')}</span>
      </p>
    </div>
  );
};
