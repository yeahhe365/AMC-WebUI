import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { IconMcp } from '@/components/icons';
import { interpolate } from '@/i18n/interpolate';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { usePortaledMenu } from '@/hooks/ui/usePortaledMenu';
import { selectServersForTurn, useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Composer-level MCP control: master on/off plus per-server narrowing for the
 * next message. Persisted across page refreshes so user selections remain active.
 */
export const McpPickerMenu: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { t } = useI18n();
  const { isOpen, menuPosition, containerRef, buttonRef, menuRef, targetWindow, toggleMenu } = usePortaledMenu({
    menuWidth: 256,
    constrainHeight: true,
  });
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
      <div className="relative" ref={containerRef}>
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleMenu}
          disabled={disabled}
          className={`${CHAT_INPUT_BUTTON_CLASS} ${
            isOpen
              ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
              : hasNarrowedSelection
                ? 'bg-transparent text-[var(--theme-text-link)] hover:bg-[var(--theme-bg-tertiary)]'
                : !masterEnabled || activeCount === 0
                  ? 'bg-transparent text-[var(--theme-text-tertiary)] opacity-60 hover:opacity-100 hover:bg-[var(--theme-bg-tertiary)]'
                  : 'bg-transparent text-[var(--theme-icon-attach)] hover:bg-[var(--theme-bg-tertiary)]'
          }`}
          aria-label={t('mcpPickerTitle')}
          title={t('mcpPickerTitle')}
          aria-haspopup="true"
          aria-expanded={isOpen}
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
        {isOpen &&
          targetWindow &&
          createPortal(
            <div
              ref={menuRef}
              className="fixed w-64 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-xl shadow-premium py-1.5 overflow-y-auto custom-scrollbar"
              style={menuPosition}
              role="menu"
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
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors"
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
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors"
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
                      // Clicking a row while MCP is off reads as "I want this
                      // server", so wake the master switch with just it.
                      if (!masterEnabled) {
                        wakeWithServer(server.id);
                        return;
                      }
                      toggleServer(
                        server.id,
                        enabledServers.map((entry) => entry.id),
                      );
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--theme-bg-tertiary)] focus:outline-none focus-visible:bg-[var(--theme-bg-tertiary)] flex items-center justify-between transition-colors"
                  >
                    <span className="min-w-0 truncate">{server.name}</span>
                    {checked && <Check size={16} className="text-[var(--theme-text-link)]" strokeWidth={2} />}
                  </button>
                );
              })}
            </div>,
            targetWindow.document.body,
          )}
      </div>
    </div>
  );
};
