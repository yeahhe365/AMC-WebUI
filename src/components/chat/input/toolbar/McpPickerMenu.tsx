import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { IconMcp } from '@/components/icons';
import { interpolate } from '@/i18n/interpolate';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/shared/Popover';
import { selectServersForTurn, useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Composer-level MCP control: master on/off plus per-server narrowing for the
 * next message. Persisted across page refreshes so user selections remain active.
 */
export const McpPickerMenu: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { t } = useI18n();
  const mcpServers = useSettingsStore((state) => state.appSettings.mcpServers);
  const enabledServers = useMemo(() => (mcpServers ?? []).filter((server) => server.enabled), [mcpServers]);
  const masterEnabled = useMcpRuntimeStore((state) => state.masterEnabled);
  const selectedServerIds = useMcpRuntimeStore((state) => state.selectedServerIds);
  const toggleMaster = useMcpRuntimeStore((state) => state.toggleMaster);
  const toggleServer = useMcpRuntimeStore((state) => state.toggleServer);
  const wakeWithServer = useMcpRuntimeStore((state) => state.wakeWithServer);
  const selectAllServers = useMcpRuntimeStore((state) => state.selectAllServers);

  if (enabledServers.length === 0) return null;

  const activeCount = selectServersForTurn(enabledServers, { masterEnabled, selectedServerIds }).length;
  const allOn = selectedServerIds === null && masterEnabled;
  const hasNarrowedSelection = masterEnabled && !allOn && activeCount > 0;

  return (
    <div className="flex items-center">
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={`${CHAT_INPUT_BUTTON_CLASS} ${
                hasNarrowedSelection
                  ? 'bg-transparent text-[var(--theme-text-link)] hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]'
                  : !masterEnabled || activeCount === 0
                    ? 'bg-transparent text-[var(--theme-text-tertiary)] opacity-60 hover:opacity-100 hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]'
                    : 'bg-transparent text-[var(--theme-icon-attach)] hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]'
              }`}
              aria-label={t('mcpPickerTitle')}
              title={t('mcpPickerTitle')}
              data-testid="mcp-picker-button"
            >
              <IconMcp size={20} />
              {hasNarrowedSelection && (
                <span
                  data-testid="mcp-picker-count"
                  className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--theme-bg-accent)] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--theme-bg-input)]"
                >
                  {activeCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-64 max-h-[70vh] overflow-y-auto custom-scrollbar p-1.5 shadow-premium"
          >
            <div className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
              {t('mcpPickerTitle')}
            </div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={masterEnabled}
              data-testid="mcp-picker-master"
              onClick={() => toggleMaster()}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
            >
              <span className="font-medium">{t('mcpPickerMaster')}</span>
              {masterEnabled && <Check size={16} className="text-[var(--theme-text-link)]" strokeWidth={2} />}
            </button>
            <div className="my-1 h-px bg-[var(--theme-border-secondary)]" />
            {(() => {
              const allActive = masterEnabled && selectedServerIds === null;
              return (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={allActive}
                  data-testid="mcp-picker-all"
                  onClick={selectAllServers}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
                >
                  <span className="font-medium">
                    {interpolate(t('mcpPickerAllServers'), { count: enabledServers.length })}
                  </span>
                  {allActive && <Check size={16} className="text-[var(--theme-text-link)]" strokeWidth={2} />}
                </button>
              );
            })()}
            {enabledServers.map((server) => {
              const checked = masterEnabled && (selectedServerIds === null || selectedServerIds.includes(server.id));
              return (
                <button
                  key={server.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  data-testid={`mcp-picker-server-${server.id}`}
                  onClick={() => {
                    if (!masterEnabled) {
                      wakeWithServer(server.id);
                      return;
                    }
                    toggleServer(
                      server.id,
                      enabledServers.map((entry) => entry.id),
                    );
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
                >
                  <span className="min-w-0 truncate">{server.name}</span>
                  {checked && <Check size={16} className="text-[var(--theme-text-link)]" strokeWidth={2} />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
