import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, RefreshCw, Wrench } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_OUTLINE_BUTTON_CLASS, SMALL_ICON_BUTTON_CLASS } from '@/constants/buttonClasses';
import { SETTINGS_SECTION_CARD_CLASS } from '@/constants/designTokens';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import type { VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import { copyTextToClipboard } from '@/utils/clipboard';
import { McpToolSchemaView } from './McpToolSchemaView';
import { MCP_INPUT_BASE_CLASSES } from './mcpSectionShared';

interface VirtualMcpServerCardProps {
  server: VirtualMcpServer;
  isExpanded: boolean;
  isEnabled: boolean;
  onToggleExpanded: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  t: (key: string) => string;
}

export const VirtualMcpServerCard: React.FC<VirtualMcpServerCardProps> = ({
  server,
  isExpanded,
  isEnabled,
  onToggleExpanded,
  onToggleEnabled,
  t,
}) => {
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [schemaToolNames, setSchemaToolNames] = useState<Set<string>>(new Set());
  const [toolQuery, setToolQuery] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoadingTools(true);
        const fetched = await server.listTools();
        if (!cancelled) setTools(fetched);
      } finally {
        if (!cancelled) setLoadingTools(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [server]);

  const handleTest = async () => {
    setLoadingTools(true);
    try {
      const fetched = await server.listTools();
      setTools(fetched);
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 2000);
    } finally {
      setLoadingTools(false);
    }
  };

  const toggleSchemaTool = (name: string) => {
    setSchemaToolNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyTextToClipboard(server.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const filteredTools = tools.filter((tool) => {
    if (!toolQuery.trim()) return true;
    const q = toolQuery.toLowerCase();
    return tool.name.toLowerCase().includes(q) || (tool.description ?? '').toLowerCase().includes(q);
  });

  return (
    <section
      className={`${SETTINGS_SECTION_CARD_CLASS} border-[var(--theme-border-secondary)]`}
      data-settings-item={`virtual-mcp-server-${server.id}`}
    >
      <div data-mcp-server-card-header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          data-testid={`virtual-mcp-card-expand-${server.id}`}
          aria-expanded={isExpanded}
          title={t('settingsMcpToggleExpand')}
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={16} strokeWidth={1.8} className="text-[var(--theme-text-tertiary)] shrink-0" />
          ) : (
            <ChevronRight size={16} strokeWidth={1.8} className="text-[var(--theme-text-tertiary)] shrink-0" />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--theme-text-primary)]">{server.name}</span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {t('settingsMcpVirtualBadge') || '内置'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                isEnabled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}
              />
              {isEnabled ? t('settingsMcpStatusConnected') : t('settingsMcpStatusDisabled')}
            </span>
            <span className="text-[11px] text-[var(--theme-text-secondary)]">
              {tools.length} {t('settingsMcpCapabilityTools')}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            data-testid={`virtual-mcp-copy-id-${server.id}`}
            title={copiedId ? t('settingsMcpIdCopied') : t('settingsMcpCopyId')}
            onClick={handleCopyId}
            className={SMALL_ICON_BUTTON_CLASS}
          >
            {copiedId ? (
              <Check size={14} strokeWidth={2} className="text-emerald-600" />
            ) : (
              <Copy size={14} strokeWidth={1.7} />
            )}
          </button>
          <button
            type="button"
            data-testid={`virtual-mcp-test-${server.id}`}
            title={t('settingsMcpTestServer')}
            disabled={loadingTools}
            onClick={handleTest}
            className={SMALL_ICON_BUTTON_CLASS}
          >
            <RefreshCw size={14} strokeWidth={1.7} className={loadingTools ? 'animate-spin' : ''} />
          </button>
          <Toggle
            checked={isEnabled}
            onChange={onToggleEnabled}
            ariaLabel={`Toggle ${server.name}`}
          />
        </div>
      </div>

      {!isExpanded && (
        <div className="mt-1 truncate pl-6 text-xs text-[var(--theme-text-secondary)]">{server.description}</div>
      )}

      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--theme-border-secondary)]/50 pt-4">
          <div className="rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-3 text-xs text-[var(--theme-text-secondary)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="leading-relaxed">{server.description}</span>
              {testSuccess && (
                <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <Check size={13} />
                  <span>服务状态正常，全部工具就绪</span>
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
                {t('settingsMcpCapabilityTools')} ({filteredTools.length})
              </span>
              <input
                type="text"
                placeholder={t('settingsMcpToolSearchPlaceholder')}
                value={toolQuery}
                onChange={(e) => setToolQuery(e.target.value)}
                className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} max-w-xs text-xs py-1 px-2`}
              />
            </div>

            {filteredTools.length === 0 ? (
              <div className="rounded-md border border-dashed py-4 text-center text-xs text-[var(--theme-text-secondary)]">
                {t('settingsMcpEmptyTools')}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTools.map((tool) => {
                  const showSchema = schemaToolNames.has(tool.name);
                  return (
                    <div
                      key={tool.name}
                      data-testid={`virtual-mcp-tool-${tool.name}`}
                      className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/60 p-3 text-xs transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Wrench size={13} className="text-[var(--theme-text-secondary)] shrink-0" />
                            <span className="font-mono font-medium text-[var(--theme-text-primary)]">{tool.name}</span>
                            <span className="rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {t('settingsMcpAutoApproveEnabled')}
                            </span>
                          </div>
                          {tool.description && (
                            <p className="text-[11px] leading-relaxed text-[var(--theme-text-secondary)]">
                              {tool.description}
                            </p>
                          )}
                        </div>
                        {tool.inputSchema && (
                          <button
                            type="button"
                            onClick={() => toggleSchemaTool(tool.name)}
                            aria-expanded={showSchema}
                            title={t('settingsMcpToggleSchema')}
                            className={`${SETTINGS_OUTLINE_BUTTON_CLASS} text-[11px] px-2 py-1 shrink-0`}
                          >
                            {showSchema ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span>JSON Schema</span>
                          </button>
                        )}
                      </div>
                      {showSchema && tool.inputSchema && (
                        <div className="mt-2 pt-2 border-t border-[var(--theme-border-secondary)]/30">
                          <McpToolSchemaView inputSchema={tool.inputSchema as Record<string, unknown>} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
