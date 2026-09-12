import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { IconMcp } from '@/components/icons';
import { interpolate } from '@/i18n/interpolate';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/shared/Popover';
import { useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVirtualMcpStore } from '@/stores/virtualMcpStore';
import { getVirtualMcpServers } from '@/features/mcp/virtualMcpRegistry';

interface PickerServerItem {
  id: string;
  name: string;
  isVirtual?: boolean;
}

export interface McpPickerMenuProps {
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Composer-level MCP control: master on/off plus per-server narrowing for the
 * next message. Persisted across page refreshes so user selections remain active.
 */
export const McpPickerMenu: React.FC<McpPickerMenuProps> = ({ disabled, disabledReason }) => {
  const { t } = useI18n();
  const mcpServers = useSettingsStore((state) => state.appSettings.mcpServers);
  const enabledServers = useMemo(() => (mcpServers ?? []).filter((server) => server.enabled), [mcpServers]);
  const disabledServerIds = useVirtualMcpStore((state) => state.disabledServerIds);
  const virtualServers = useMemo(() => {
    const disabledSet = new Set(disabledServerIds);
    return getVirtualMcpServers().filter((s) => !disabledSet.has(s.id));
  }, [disabledServerIds]);

  const allAvailableServers: PickerServerItem[] = useMemo(() => {
    return [
      ...enabledServers.map((s) => ({ id: s.id, name: s.name, isVirtual: false })),
      ...virtualServers.map((vs) => ({ id: vs.id, name: vs.name, isVirtual: true })),
    ];
  }, [enabledServers, virtualServers]);

  const allServerIds = useMemo(() => allAvailableServers.map((s) => s.id), [allAvailableServers]);

  const masterEnabled = useMcpRuntimeStore((state) => state.masterEnabled);
  const selectedServerIds = useMcpRuntimeStore((state) => state.selectedServerIds);
  const toggleMaster = useMcpRuntimeStore((state) => state.toggleMaster);
  const toggleServer = useMcpRuntimeStore((state) => state.toggleServer);
  const wakeWithServer = useMcpRuntimeStore((state) => state.wakeWithServer);
  const toggleAllServers = useMcpRuntimeStore((state) => state.toggleAllServers);

  const hasServers = allAvailableServers.length > 0;
  const isEffectivelyDisabled = Boolean(disabled || !hasServers);

  const activeCount =
    masterEnabled && hasServers
      ? selectedServerIds === null
        ? allAvailableServers.length
        : allAvailableServers.filter((s) => selectedServerIds.includes(s.id)).length
      : 0;

  const allActive = masterEnabled && hasServers && selectedServerIds === null;

  // External vs Virtual separation
  const externalServers = useMemo(() => allAvailableServers.filter((s) => !s.isVirtual), [allAvailableServers]);
  const virtualServersList = useMemo(() => allAvailableServers.filter((s) => s.isVirtual), [allAvailableServers]);
  const hasBothGroups = externalServers.length > 0 && virtualServersList.length > 0;

  // Rich tooltip text computation
  const tooltipText = useMemo(() => {
    if (disabled && disabledReason) {
      return disabledReason;
    }
    if (!hasServers) {
      return t('mcpPickerNoServers');
    }
    if (!masterEnabled || activeCount === 0) {
      return t('mcpPickerTooltipDisabled');
    }
    if (allActive) {
      return interpolate(t('mcpPickerTooltipAll'), { count: activeCount, total: allAvailableServers.length });
    }
    return interpolate(t('mcpPickerTooltipPartial'), { count: activeCount, total: allAvailableServers.length });
  }, [disabled, disabledReason, hasServers, masterEnabled, activeCount, allActive, allAvailableServers.length, t]);

  const buttonClass = useMemo(() => {
    if (isEffectivelyDisabled) {
      return `${CHAT_INPUT_BUTTON_CLASS} bg-transparent text-[var(--theme-text-tertiary)] opacity-40 cursor-not-allowed`;
    }
    if (!masterEnabled || activeCount === 0) {
      return `${CHAT_INPUT_BUTTON_CLASS} bg-transparent text-[var(--theme-text-tertiary)] opacity-60 hover:opacity-100 hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]`;
    }
    return `${CHAT_INPUT_BUTTON_CLASS} bg-transparent text-[var(--theme-text-link)] hover:bg-[var(--theme-bg-tertiary)] data-[state=open]:bg-[var(--theme-bg-tertiary)] data-[state=open]:text-[var(--theme-text-primary)]`;
  }, [isEffectivelyDisabled, masterEnabled, activeCount]);

  const renderServerItem = (server: PickerServerItem) => {
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
          toggleServer(server.id, allServerIds);
        }}
        className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span className="min-w-0 truncate text-[var(--theme-text-primary)]">{server.name}</span>
          {server.isVirtual && (
            <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {t('mcpPickerVirtualBadge', t('settingsMcpVirtualBadge', '内置'))}
            </span>
          )}
        </div>
        {checked && <Check size={16} className="text-[var(--theme-text-link)] shrink-0" strokeWidth={2} />}
      </button>
    );
  };

  const triggerButton = (
    <button
      type="button"
      disabled={isEffectivelyDisabled}
      className={buttonClass}
      aria-label={tooltipText}
      title={tooltipText}
      data-testid="mcp-picker-button"
    >
      <IconMcp size={20} />
      {masterEnabled && activeCount > 0 && (
        <span
          data-testid="mcp-picker-count"
          className={`pointer-events-none absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[var(--theme-bg-input)] ${
            allActive ? 'bg-emerald-600' : 'bg-[var(--theme-bg-accent)]'
          }`}
        >
          {activeCount}
        </span>
      )}
    </button>
  );

  if (isEffectivelyDisabled) {
    return (
      <div className="flex items-center">
        <div className="relative">{triggerButton}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-72 sm:w-80 max-h-[70vh] overflow-y-auto custom-scrollbar p-1.5 shadow-premium"
          >
            <div className="px-3.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
              {t('mcpPickerTitle')}
            </div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={masterEnabled}
              data-testid="mcp-picker-master"
              onClick={() => toggleMaster()}
              className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
            >
              <span className="font-medium text-[var(--theme-text-primary)]">{t('mcpPickerMaster')}</span>
              {masterEnabled && <Check size={16} className="text-[var(--theme-text-link)] shrink-0" strokeWidth={2} />}
            </button>

            {masterEnabled && activeCount === 0 && (
              <div
                data-testid="mcp-picker-empty-hint"
                className="mx-1 my-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 leading-tight"
              >
                {t('mcpPickerNoServersSelected')}
              </div>
            )}

            <div className="my-1 h-px bg-[var(--theme-border-secondary)]" />

            {allAvailableServers.length > 1 && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={allActive}
                data-testid="mcp-picker-all"
                onClick={() => toggleAllServers()}
                className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors rounded-lg cursor-pointer"
              >
                <span className="font-medium text-[var(--theme-text-secondary)]">
                  {interpolate(t('mcpPickerAllServers'), { count: allAvailableServers.length })}
                </span>
                {allActive && <Check size={16} className="text-[var(--theme-text-link)] shrink-0" strokeWidth={2} />}
              </button>
            )}

            {hasBothGroups ? (
              <>
                {externalServers.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-3.5 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                      {t('mcpPickerGroupExternal')}
                    </div>
                    {externalServers.map(renderServerItem)}
                  </div>
                )}
                {virtualServersList.length > 0 && (
                  <div className="space-y-0.5 pt-1">
                    <div className="px-3.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                      {t('mcpPickerGroupBuiltin')}
                    </div>
                    {virtualServersList.map(renderServerItem)}
                  </div>
                )}
              </>
            ) : (
              allAvailableServers.map(renderServerItem)
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
