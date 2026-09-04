import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logService } from '@/services/logService';
import type { LogEntry, TokenUsageStats } from '@/types/logging';
import { type AppSettings, type ChatSettings } from '@/types';
import { X, Terminal, KeyRound, Coins } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ConsoleTab } from './ConsoleTab';
import { TokenUsageTab } from './TokenUsageTab';
import { ApiUsageTab } from './ApiUsageTab';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { UsageOverviewTab } from './UsageOverviewTab';
import { useI18n } from '@/contexts/I18nContext';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';

export interface LogViewerProps {
  isOpen: boolean;
  onClose: () => void;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  initialTab?: 'console' | 'usage';
  initialUsageTab?: 'overview' | 'tokens' | 'api';
}

export const LogViewer: React.FC<LogViewerProps> = ({
  isOpen,
  onClose,
  appSettings,
  currentChatSettings,
  initialTab = 'console',
  initialUsageTab = 'overview',
}) => {
  const { t } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiKeyUsage, setApiKeyUsage] = useState<Map<string, number>>(new Map());
  const [tokenUsage, setTokenUsage] = useState<Map<string, TokenUsageStats>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [activeTab, setActiveTab] = useState<'console' | 'usage'>(initialTab);
  const [activeUsageTab, setActiveUsageTab] = useState<'overview' | 'tokens' | 'api'>(initialUsageTab);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Guards against the fetch-on-open effect re-entering: previously `fetchLogs`
  // depended on [logs.length, isLoading], and every setIsLoading transition
  // recreated the callback, which retriggered the open effect — an infinite fetch loop.
  const isFetchingRef = useRef(false);
  const hasFetchedOnOpenRef = useRef(false);

  const fetchLogs = useCallback(
    async (reset = false) => {
      if (isFetchingRef.current && !reset) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      try {
        const currentCount = reset ? 0 : logs.length;
        const newLogs = await logService.getRecentLogs(100, currentCount);

        if (reset) {
          setLogs(newLogs);
        } else {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const uniqueNew = newLogs.filter((l) => !existingIds.has(l.id));
            return [...prev, ...uniqueNew];
          });
        }

        setHasMore(newLogs.length === 100);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [logs.length],
  );

  useEffect(() => {
    if (isOpen) {
      // Fetch exactly once per open transition — never retrigger on logs.length/isLoading changes.
      hasFetchedOnOpenRef.current = false;
    } else {
      hasFetchedOnOpenRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !hasFetchedOnOpenRef.current) {
      hasFetchedOnOpenRef.current = true;
      fetchLogs(true);
    }
  }, [isOpen, fetchLogs]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setActiveUsageTab(initialUsageTab);
    }
  }, [initialTab, initialUsageTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = logService.subscribe((newLiveLogs) => {
      // Cap in-memory growth so a chatty session can't make the viewer unresponsive.
      const MAX_IN_MEMORY_LOGS = 5000;
      setLogs((prev) => [...newLiveLogs, ...prev].slice(0, MAX_IN_MEMORY_LOGS));
    });
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && appSettings.useCustomApiConfig) {
      const unsubscribe = logService.subscribeToApiKeys(setApiKeyUsage);
      return () => unsubscribe();
    }
    return undefined;
  }, [isOpen, appSettings.useCustomApiConfig]);

  useEffect(() => {
    if (isOpen) {
      const unsubscribe = logService.subscribeToTokenUsage(setTokenUsage);
      return () => unsubscribe();
    }
    return undefined;
  }, [isOpen]);

  const handleClear = async () => {
    await logService.clearLogs();
    setLogs([]);
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        noPadding
        ariaLabel={t('logViewerTitle')}
        contentClassName="w-full h-[100dvh] sm:h-[85vh] sm:max-h-[800px] sm:w-[90vw] max-w-6xl sm:rounded-xl overflow-hidden flex flex-col shadow-2xl bg-[var(--theme-bg-primary)]"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-4 py-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--theme-text-primary)]">
              <Terminal size={18} className="text-[var(--theme-text-tertiary)]" /> {t('logViewerTitle')}
            </h2>
            <button onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS} aria-label={t('close')}>
              <X size={20} />
            </button>
          </header>

          <div className="border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 flex-shrink-0">
            <nav className="flex space-x-4">
              <button
                onClick={() => setActiveTab('console')}
                className={`flex items-center gap-2 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${activeTab === 'console' ? 'border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]' : 'border-transparent text-[var(--theme-text-tertiary)]'}`}
              >
                <Terminal size={14} /> {t('logViewerConsoleTab')}
              </button>
              <button
                onClick={() => setActiveTab('usage')}
                className={`flex items-center gap-2 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${activeTab === 'usage' ? 'border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]' : 'border-transparent text-[var(--theme-text-tertiary)]'}`}
              >
                <Coins size={14} /> {t('logViewerUsageTab')}
              </button>
            </nav>
          </div>

          <div className="flex-grow min-h-0 bg-[var(--theme-bg-secondary)] flex flex-col">
            {activeTab === 'console' && (
              <ConsoleTab
                logs={logs}
                isLoading={isLoading}
                hasMore={hasMore}
                onFetchMore={() => fetchLogs(false)}
                onClear={() => setIsConfirmOpen(true)}
                loggingDisabled={!appSettings.isLoggingEnabled}
              />
            )}

            {activeTab === 'usage' && (
              <>
                <div className="border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 flex-shrink-0">
                  <nav className="flex space-x-4">
                    <button
                      onClick={() => setActiveUsageTab('overview')}
                      className={`flex items-center gap-2 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${activeUsageTab === 'overview' ? 'border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]' : 'border-transparent text-[var(--theme-text-tertiary)]'}`}
                    >
                      <Coins size={14} /> {t('logViewerOverviewTab')}
                    </button>
                    <button
                      onClick={() => setActiveUsageTab('tokens')}
                      className={`flex items-center gap-2 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${activeUsageTab === 'tokens' ? 'border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]' : 'border-transparent text-[var(--theme-text-tertiary)]'}`}
                    >
                      <Coins size={14} /> {t('logViewerTokensTab')}
                    </button>
                    {appSettings.useCustomApiConfig && (
                      <button
                        onClick={() => setActiveUsageTab('api')}
                        className={`flex items-center gap-2 px-2 py-3 text-sm font-medium border-b-2 transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} ${activeUsageTab === 'api' ? 'border-[var(--theme-border-focus)] text-[var(--theme-text-primary)]' : 'border-transparent text-[var(--theme-text-tertiary)]'}`}
                      >
                        <KeyRound size={14} /> {t('logViewerApiKeysTab')}
                      </button>
                    )}
                  </nav>
                </div>

                {activeUsageTab === 'overview' && <UsageOverviewTab />}

                {activeUsageTab === 'tokens' && <TokenUsageTab tokenUsage={tokenUsage} />}

                {activeUsageTab === 'api' && (
                  <ApiUsageTab
                    apiKeyUsage={apiKeyUsage}
                    appSettings={appSettings}
                    currentChatSettings={currentChatSettings}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleClear}
        title={t('logViewerClearTitle')}
        message={t('logViewerClearMessage')}
        confirmLabel={t('logViewerClearButton')}
        isDanger
      />
    </>
  );
};
