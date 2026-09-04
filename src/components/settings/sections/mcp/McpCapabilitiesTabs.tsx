import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import type { McpServerCapabilities } from '@/services/api/mcpApi';
import type { McpServerConfig } from '@/types';
import { McpLogsTab } from '@/components/settings/sections/McpLogsTab';
import { McpPromptsTab } from '@/components/settings/sections/McpPromptsTab';
import { McpResourcesTab } from '@/components/settings/sections/McpResourcesTab';
import { McpToolSchemaView } from './McpToolSchemaView';

const inputBaseClasses =
  'w-full rounded-lg border p-2.5 text-sm transition-all duration-200 focus:ring-2 focus:ring-offset-0';

type CapabilityTabId = 'tools' | 'prompts' | 'resources' | 'logs';

interface McpCapabilitiesTabsProps {
  server: McpServerConfig;
  index: number;
  capabilities: McpServerCapabilities;
  activeTab: string;
  toolQuery: string;
  deferredToolQuery: string;
  schemaToolNames: Set<string>;
  onTabChange: (tab: CapabilityTabId) => void;
  onToolQueryChange: (query: string) => void;
  onToggleSchemaTool: (toolName: string) => void;
  onUpdateServer: (serverIndex: number, updates: Partial<McpServerConfig>) => void;
  t: (key: string) => string;
}

/** Post-test capability summary plus the tools/prompts/resources/logs panels. */
export const McpCapabilitiesTabs: React.FC<McpCapabilitiesTabsProps> = ({
  server,
  index,
  capabilities,
  activeTab,
  toolQuery,
  deferredToolQuery,
  schemaToolNames,
  onTabChange,
  onToolQueryChange,
  onToggleSchemaTool,
  onUpdateServer,
  t,
}) => {
  const capabilityErrors = capabilities.errors ?? [];
  const resourceCount = (capabilities.resources.length ?? 0) + (capabilities.resourceTemplates.length ?? 0);
  const currentTab = activeTab as CapabilityTabId;

  const tabButtonClass = (isActive: boolean) =>
    `px-3 py-1.5 text-xs font-medium ${isActive ? 'border-b-2 border-[var(--theme-text-accent)] text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)]'}`;

  return (
    <>
      <div className="rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-3 text-xs text-[var(--theme-text-secondary)]">
        <div className="flex flex-wrap gap-3 font-medium">
          <span>
            {t('settingsMcpCapabilityTools')} {capabilities.tools.length}
          </span>
          <span>
            {t('settingsMcpCapabilityResources')} {resourceCount}
          </span>
          <span>
            {t('settingsMcpCapabilityPrompts')} {capabilities.prompts.length}
          </span>
        </div>
        {capabilityErrors.length > 0 && (
          <div className="mt-2 space-y-1 text-[var(--theme-text-danger)]">
            {capabilityErrors.map((error) => (
              <div key={`${error.serverId}-${error.error}`}>{error.error}</div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-[var(--theme-border-secondary)]">
        <button
          role="tab"
          aria-selected={currentTab === 'tools'}
          onClick={() => onTabChange('tools')}
          className={tabButtonClass(currentTab === 'tools')}
        >
          {t('settingsMcpTabTools')}
        </button>
        <button
          role="tab"
          aria-selected={currentTab === 'prompts'}
          onClick={() => onTabChange('prompts')}
          className={tabButtonClass(currentTab === 'prompts')}
        >
          {t('settingsMcpTabPrompts')}
        </button>
        <button
          role="tab"
          aria-selected={currentTab === 'resources'}
          onClick={() => onTabChange('resources')}
          className={tabButtonClass(currentTab === 'resources')}
        >
          {t('settingsMcpTabResources')}
        </button>
        <button
          role="tab"
          aria-selected={currentTab === 'logs'}
          onClick={() => onTabChange('logs')}
          className={tabButtonClass(currentTab === 'logs')}
        >
          {t('settingsMcpTabLogs')}
        </button>
      </div>

      {currentTab === 'tools' && (
        <div className="space-y-2">
          <input
            placeholder={t('settingsMcpToolSearchPlaceholder')}
            value={toolQuery}
            onChange={(e) => onToolQueryChange(e.target.value)}
            className={`${inputBaseClasses} ${SETTINGS_INPUT_CLASS}`}
          />
          <div className="overflow-hidden rounded-lg border border-[var(--theme-border-secondary)]">
            {(() => {
              const filteredTools = capabilities.tools.filter((tool) => {
                if (!deferredToolQuery.trim()) return true;
                const hay = `${tool.name} ${tool.description ?? ''}`.toLowerCase();
                return hay.includes(deferredToolQuery.toLowerCase());
              });
              if (filteredTools.length === 0) {
                return (
                  <div className="px-3 py-6 text-center text-xs text-[var(--theme-text-secondary)]">
                    {capabilities.tools.length === 0 ? t('settingsMcpEmptyTools') : t('settingsMcpEmptyFiltered')}
                  </div>
                );
              }
              return filteredTools.map((tool) => {
                const disabled = new Set(server.disabledTools ?? []);
                const autoDisabled = new Set(server.disabledAutoApproveTools ?? []);
                const isEnabled = !disabled.has(tool.name);
                const isAutoApproved = !autoDisabled.has(tool.name);
                const toggleTool = (toolName: string, enabled: boolean) => {
                  const next = enabled
                    ? (server.disabledTools ?? []).filter((n) => n !== toolName)
                    : [...(server.disabledTools ?? []), toolName];
                  onUpdateServer(index, { disabledTools: next.length ? next : undefined });
                };
                const toggleAutoApprove = (toolName: string, autoApprove: boolean) => {
                  const next = autoApprove
                    ? (server.disabledAutoApproveTools ?? []).filter((n) => n !== toolName)
                    : [...(server.disabledAutoApproveTools ?? []), toolName];
                  onUpdateServer(index, {
                    disabledAutoApproveTools: next.length ? next : undefined,
                  });
                };
                return (
                  <div
                    key={tool.name}
                    className="border-t border-[var(--theme-border-secondary)] px-3 py-2 first:border-t-0"
                  >
                    <div className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          data-testid={`mcp-tool-schema-toggle-${tool.name}`}
                          onClick={() => onToggleSchemaTool(tool.name)}
                          className="w-full truncate text-left text-sm text-[var(--theme-text-primary)] hover:text-[var(--theme-text-link)]"
                          title={t('settingsMcpToggleSchema')}
                        >
                          {tool.name}
                        </button>
                        <div className="truncate text-xs text-[var(--theme-text-secondary)]">{tool.description}</div>
                      </div>
                      <Toggle
                        checked={isEnabled}
                        onChange={(v) => toggleTool(tool.name, v)}
                        ariaLabel={`${isEnabled ? 'Disable' : 'Enable'} ${tool.name}`}
                      />
                      <button
                        type="button"
                        aria-label={`Auto-approve ${tool.name}`}
                        aria-pressed={isAutoApproved}
                        disabled={!isEnabled}
                        onClick={() => toggleAutoApprove(tool.name, !isAutoApproved)}
                        title={
                          isAutoApproved ? t('settingsMcpAutoApproveEnabled') : t('settingsMcpAutoApproveDisabled')
                        }
                        className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${!isEnabled ? 'opacity-40' : isAutoApproved ? 'text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400' : 'text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-tertiary)]'}`}
                      >
                        <ShieldCheck size={16} strokeWidth={1.7} />
                      </button>
                    </div>
                    {schemaToolNames.has(tool.name) && tool.inputSchema && (
                      <McpToolSchemaView inputSchema={tool.inputSchema} />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
      {currentTab === 'prompts' && <McpPromptsTab server={server} prompts={capabilities.prompts ?? []} t={t} />}
      {currentTab === 'resources' && (
        <McpResourcesTab
          server={server}
          resources={capabilities.resources ?? []}
          templates={capabilities.resourceTemplates ?? []}
          t={t}
        />
      )}
      {currentTab === 'logs' && <McpLogsTab server={server} t={t} />}
    </>
  );
};
