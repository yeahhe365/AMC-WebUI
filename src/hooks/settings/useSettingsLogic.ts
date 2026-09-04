import { useCallback, useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { type AppSettings } from '@/types';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { logService } from '@/services/logService';
import { resolveModelSwitchSettings } from '@/utils/model/modelSwitchSettings';
import { type translations } from '@/i18n/translations';
import { useSettingsUiStore, type SettingsTabDescriptor } from '@/stores/settingsUiStore';
import { SETTINGS_TAB_IDS, SETTINGS_TAB_LABEL_KEYS } from '@/constants/settingsTabs';

interface UseSettingsLogicProps {
  isOpen: boolean;
  currentSettings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  onClearAllHistory: () => void;
  onClearCache: () => void;
  onImportHistory: (file: File) => void;
  t: (key: keyof typeof translations) => string;
}

/**
 * Window during which a programmatic anchor scroll (settings search
 * "navigate + highlight") owns the scroll container. Saving or restoring the
 * per-tab scroll position inside this window would write `scrollTop`
 * mid-animation, which cancels the smooth `scrollIntoView` and leaves the
 * highlighted row off-screen.
 */
export const ANCHOR_SCROLL_LOCK_MS = 1200;

/** Connection, credential, and integration data that "Reset Settings Only"
 * carries over: resetting app preferences must not wipe API keys, deployment
 * flags, third-party providers, or MCP servers. */
const SETTINGS_RESET_PRESERVED_KEYS: ReadonlyArray<keyof AppSettings> = [
  'apiKey',
  'useCustomApiConfig',
  'serverManagedApi',
  'useApiProxy',
  'apiProxyUrl',
  'mcpServers',
  'thirdPartyApi',
];

export const useSettingsLogic = ({
  isOpen,
  currentSettings,
  onSave,
  onClearAllHistory,
  onClearCache,
  onImportHistory,
  t,
}: UseSettingsLogicProps) => {
  const latestSettingsRef = useRef(currentSettings);

  useEffect(() => {
    useSettingsUiStore.getState().hydrateLegacySettingsUiPreferences();
  }, []);

  useEffect(() => {
    latestSettingsRef.current = currentSettings;
  }, [currentSettings]);

  const activeTab = useSettingsUiStore((state) => state.activeTab);
  const setActiveTab = useSettingsUiStore((state) => state.setActiveTab);
  const activeTabScrollTop = useSettingsUiStore((state) => state.scrollPositions[activeTab] ?? 0);
  const setScrollPosition = useSettingsUiStore((state) => state.setScrollPosition);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const anchorScrollLockUntilRef = useRef(0);

  /** Begin the lock window for a programmatic anchor scroll (search jump). */
  const beginAnchorScroll = useCallback(() => {
    anchorScrollLockUntilRef.current = Date.now() + ANCHOR_SCROLL_LOCK_MS;
  }, []);

  /** Persist the container's current scrollTop for the active tab. */
  const saveActiveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setScrollPosition(activeTab, container.scrollTop);
    }
  }, [activeTab, setScrollPosition]);

  useLayoutEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        // Skip the restore while an anchor scroll owns the container.
        if (scrollContainerRef.current && Date.now() >= anchorScrollLockUntilRef.current) {
          scrollContainerRef.current.scrollTop = activeTabScrollTop;
        }
      });
    }
  }, [activeTab, activeTabScrollTop, isOpen]);

  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Skip saving while an anchor scroll animates: writing the intermediate
    // position re-triggers the restore effect, whose scrollTop write cancels
    // the smooth scrollIntoView before it reaches the target row.
    if (Date.now() < anchorScrollLockUntilRef.current) {
      return;
    }
    setScrollPosition(activeTab, e.currentTarget.scrollTop);
  };

  const handleResetToDefaults = () => {
    setConfirmConfig({
      isOpen: true,
      title: t('settingsReset'),
      message: t('settingsResetConfirm'),
      onConfirm: () => {
        const preserved = Object.fromEntries(
          SETTINGS_RESET_PRESERVED_KEYS.map((key) => [key, latestSettingsRef.current[key]]),
        ) as Pick<AppSettings, (typeof SETTINGS_RESET_PRESERVED_KEYS)[number]>;
        onSave({ ...DEFAULT_APP_SETTINGS, ...preserved });
      },
      isDanger: true,
      confirmLabel: t('settingsReset'),
    });
  };

  const handleClearLogs = async () => {
    setConfirmConfig({
      isOpen: true,
      title: t('settingsClearLogs'),
      message: t('settingsClearLogsConfirm'),
      onConfirm: async () => {
        await logService.clearLogs();
      },
      isDanger: true,
      confirmLabel: t('delete'),
    });
  };

  const handleRequestClearHistory = () => {
    setConfirmConfig({
      isOpen: true,
      title: t('settingsClearHistory'),
      message: t('settingsClearHistoryConfirm'),
      onConfirm: onClearAllHistory,
      isDanger: true,
      confirmLabel: t('delete'),
    });
  };

  const handleRequestClearCache = () => {
    setConfirmConfig({
      isOpen: true,
      title: t('settingsClearCache'),
      message: t('settingsClearCacheConfirm'),
      onConfirm: onClearCache,
      isDanger: true,
      confirmLabel: t('delete'),
    });
  };

  const handleRequestImportHistory = (file: File) => {
    setConfirmConfig({
      isOpen: true,
      title: t('settingsImportHistory'),
      message: t('settingsImportHistoryConfirm'),
      onConfirm: () => onImportHistory(file),
      isDanger: false,
      confirmLabel: t('import'),
    });
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (Object.is(latestSettingsRef.current[key], value)) {
      return;
    }

    const nextSettings = { ...latestSettingsRef.current, [key]: value };
    latestSettingsRef.current = nextSettings;
    onSave(nextSettings);
  };

  const handleModelChange = (newModelId: string) => {
    const latestSettings = latestSettingsRef.current;

    if (latestSettings.modelId === newModelId) {
      return;
    }

    const nextSettings = {
      ...latestSettings,
      ...resolveModelSwitchSettings({
        currentSettings: latestSettings,
        sourceSettings: latestSettings,
        targetModelId: newModelId,
      }),
    };

    latestSettingsRef.current = nextSettings;
    onSave(nextSettings);
  };

  const tabs = useMemo<SettingsTabDescriptor[]>(
    () => SETTINGS_TAB_IDS.map((id) => ({ id, labelKey: SETTINGS_TAB_LABEL_KEYS[id] })),
    [],
  );

  const closeConfirm = () => setConfirmConfig((prev) => ({ ...prev, isOpen: false }));

  return {
    activeTab,
    setActiveTab,
    confirmConfig,
    closeConfirm,
    scrollContainerRef,
    handleContentScroll,
    beginAnchorScroll,
    saveActiveScrollPosition,
    handleResetToDefaults,
    handleClearLogs,
    handleRequestClearHistory,
    handleRequestClearCache,
    handleRequestImportHistory,
    updateSetting,
    handleModelChange,
    tabs,
  };
};
