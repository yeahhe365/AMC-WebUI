import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/utils/errorMessage';
import { ChevronDown, ChevronUp, Plus, SearchX, Server, Store } from 'lucide-react';
import type { AppSettings, McpServerConfig } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { Select } from '@/components/shared/Select';
import {
  SETTINGS_OUTLINE_BUTTON_CLASS,
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
  SETTINGS_SECONDARY_ACTION_BUTTON_CLASS,
} from '@/constants/buttonClasses';
import { SETTINGS_SECTION_CARD_CLASS } from '@/constants/designTokens';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { fetchMcpServerCapabilities } from '@/services/api/mcpApi';
import { McpImportError, dedupeServersById, parseImportJson } from '@/features/mcp/importMcpServers';
import { useMcpStatusStore } from '@/stores/mcpStatusStore';
import { deriveStatus } from '@/features/mcp/mcpStatus';
import { MCP_INPUT_BASE_CLASSES, createMcpServer, type CapabilityTestState } from './mcp/mcpSectionShared';
import { McpMarketplaceGrid } from './mcp/McpMarketplaceGrid';
import { McpServerCard } from './mcp/McpServerCard';
import { McpTrustDialog } from './mcp/McpTrustDialog';

interface McpSectionProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

type ServerFilter = 'all' | 'enabled' | 'disabled' | 'http' | 'sse' | 'stdio';

const matchesFilter = (filter: ServerFilter, server: McpServerConfig): boolean => {
  if (filter === 'enabled' && !server.enabled) return false;
  if (filter === 'disabled' && server.enabled) return false;
  if (filter === 'http' && server.transport !== 'http') return false;
  if (filter === 'sse' && server.transport !== 'sse') return false;
  if (filter === 'stdio' && server.transport !== 'stdio') return false;
  return true;
};

const matchKeywords = (q: string, s: McpServerConfig) => {
  if (!q.trim()) return true;
  const sExtra = s as McpServerConfig & { description?: unknown; provider?: unknown; tags?: unknown };
  const extra = [sExtra.description, sExtra.provider, sExtra.tags]
    .flat()
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  const hay = `${s.name} ${s.id} ${s.transport} ${s.url ?? ''} ${s.command ?? ''} ${extra}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
};

export const McpSection: React.FC<McpSectionProps> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const setStatus = useMcpStatusStore((s) => s.setStatus);
  const servers = settings.mcpServers ?? [];
  const [filter, setFilter] = useState<ServerFilter>('all');
  const [search, setSearch] = useState('');
  const [schemaToolNames, setSchemaToolNames] = useState<Set<string>>(new Set());
  const [pendingTrustIndex, setPendingTrustIndex] = useState<number | null>(null);
  const [showMarketplaces, setShowMarketplaces] = useState(false);
  // Server cards collapse to a one-line summary by default; editing and the
  // capability tabs live behind the expand chevron to keep the list scannable.
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set());
  const toggleCardExpanded = useCallback((key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  const expandCard = useCallback((key: string) => {
    setExpandedCards((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const deferredSearch = useDeferredValue(search);
  const [sortOrder, setSortOrder] = useState<string[]>(() => servers.map((s) => s.id));
  const serverIdsKey = servers.map((s) => s.id).join(',');
  useEffect(() => {
    setSortOrder((prev) => {
      const ids = servers.map((s) => s.id);
      const next = ids.filter((id) => !prev.includes(id)).concat(prev.filter((id) => ids.includes(id)));
      return ids.length === prev.length && ids.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [serverIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- realign only when the server id set changes
  const filtered = servers.filter((s) => matchesFilter(filter, s) && matchKeywords(deferredSearch, s));
  const filteredAndSorted = [...filtered].sort((a, b) => sortOrder.indexOf(a.id) - sortOrder.indexOf(b.id));
  const moveServer = (id: string, direction: -1 | 1) => {
    const idx = sortOrder.indexOf(id);
    const next = [...sortOrder];
    const j = idx + direction;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setSortOrder(next);
    const reordered = next.map((nid) => servers.find((s) => s.id === nid)!).filter(Boolean);
    onUpdate('mcpServers', reordered);
  };
  const [capabilityStates, setCapabilityStates] = useState<Record<string, CapabilityTestState>>({});
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [toolQueries, setToolQueries] = useState<Record<string, string>>({});
  const deferredToolQueries = useDeferredValue(toolQueries);

  // Card identities must stay stable across edits: the server id is
  // user-editable on every keystroke and indexes shift when a server is
  // removed, so neither can back React keys or capability test state.
  const nextCardKeyIdRef = useRef(0);
  const createCardKey = useCallback(() => `mcp-card-${++nextCardKeyIdRef.current}`, []);
  const [cardKeys, setCardKeys] = useState<string[]>(() => servers.map(createCardKey));

  useEffect(() => {
    setCardKeys((prev) => {
      if (prev.length === servers.length) {
        return prev;
      }
      // Servers were replaced externally (import/reset): realign by position.
      if (servers.length > prev.length) {
        return [...prev, ...Array.from({ length: servers.length - prev.length }, createCardKey)];
      }
      return prev.slice(0, servers.length);
    });
  }, [servers.length, createCardKey]);

  const updateServers = (nextServers: McpServerConfig[]) => {
    onUpdate('mcpServers', nextServers);
  };

  const updateServer = (serverIndex: number, updates: Partial<McpServerConfig>) => {
    updateServers(servers.map((server, index) => (index === serverIndex ? { ...server, ...updates } : server)));
  };

  const removeServer = (serverIndex: number) => {
    const removedCardKey = cardKeys[serverIndex];
    updateServers(servers.filter((_, index) => index !== serverIndex));
    setCardKeys((keys) => keys.filter((_, index) => index !== serverIndex));
    if (removedCardKey !== undefined) {
      setExpandedCards((prev) => {
        if (!prev.has(removedCardKey)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(removedCardKey);
        return next;
      });
      setCapabilityStates((prev) => {
        if (!(removedCardKey in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[removedCardKey];
        return next;
      });
    }
  };

  const addServer = () => {
    const key = createCardKey();
    updateServers([...servers, createMcpServer(t('settingsMcpNewServer'))]);
    setCardKeys((keys) => [...keys, key]);
    // New servers expand immediately so the user lands in the edit form.
    expandCard(key);
  };

  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const importErrorFromCode = (error: unknown): string => {
    const code = error instanceof McpImportError ? error.code : null;
    if (code === 'empty') return t('settingsMcpImportEmptyJson');
    if (code === 'notObject') return t('settingsMcpImportNotObject');
    return t('settingsMcpImportUnrecognized');
  };

  const parseJsonToServers = (text: string): McpServerConfig[] => {
    try {
      return parseImportJson(text);
    } catch (error) {
      if (error instanceof McpImportError) throw new Error(importErrorFromCode(error), { cause: error });
      throw error;
    }
  };

  const handleImportJson = () => {
    try {
      const imported = parseJsonToServers(importJson);
      if (imported.length === 0) throw new Error(t('settingsMcpImportNoneParsed'));
      const deduped = dedupeServersById(
        imported,
        servers.map((s) => s.id),
      );
      const newKeys = deduped.map(() => createCardKey());
      updateServers([...servers, ...deduped]);
      setCardKeys((keys) => [...keys, ...newKeys]);
      if (newKeys[0] !== undefined) {
        expandCard(newKeys[0]);
      }
      setImportJson('');
      setImportError(null);
      setShowImport(false);
      // Imported servers arrive disabled by default; the trust dialog fires
      // when the user enables them, which then auto-probes capabilities.
    } catch (importError) {
      setImportError(getErrorMessage(importError));
    }
  };

  const testServerCapabilities = async (server: McpServerConfig, cardKey: string) => {
    setCapabilityStates((prev) => ({ ...prev, [cardKey]: { status: 'loading' } }));

    try {
      const capabilities = await fetchMcpServerCapabilities({ ...server, enabled: true });
      const derived = deriveStatus(capabilities, null, true);
      setStatus(server.id, { state: derived.state, lastError: undefined, version: derived.version });
      setCapabilityStates((prev) => ({ ...prev, [cardKey]: { status: 'success', capabilities } }));
    } catch (error) {
      const message = getErrorMessage(error);
      const derived = deriveStatus(null, message, server.enabled);
      setStatus(server.id, { state: derived.state, lastError: derived.lastError });
      setCapabilityStates((prev) => ({
        ...prev,
        [cardKey]: {
          status: 'error',
          error: message,
        },
      }));
    }
  };

  const enableServerWithProbe = (serverIndex: number, cardKey: string) => {
    const target = servers[serverIndex];
    if (!target) return;
    const next = { ...target, enabled: true, ...(target.isTrusted === undefined ? { isTrusted: true } : {}) };
    updateServers(servers.map((server, i) => (i === serverIndex ? next : server)));
    void testServerCapabilities(next as McpServerConfig, cardKey);
  };

  return (
    <div className="space-y-4" data-settings-item="mcp-root">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('settingsMcpTitle')}</h3>
          <p className="text-sm leading-relaxed text-[var(--theme-text-secondary)]">{t('settingsMcpDescription')}</p>
        </div>
        <button
          type="button"
          onClick={addServer}
          className={`${SETTINGS_PRIMARY_ACTION_BUTTON_CLASS} shrink-0 whitespace-nowrap`}
        >
          <Plus size={14} strokeWidth={2} />
          {t('settingsMcpAddServer')}
        </button>
      </div>

      <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            aria-expanded={showImport}
            title={t('settingsMcpImportHint')}
            className={`${SETTINGS_OUTLINE_BUTTON_CLASS} ${showImport ? 'bg-[var(--theme-bg-tertiary)]' : ''}`}
          >
            {t('settingsMcpImportJson')}
            {showImport ? (
              <ChevronUp size={14} strokeWidth={1.7} className="text-[var(--theme-text-tertiary)]" aria-hidden />
            ) : (
              <ChevronDown size={14} strokeWidth={1.7} className="text-[var(--theme-text-tertiary)]" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowMarketplaces((v) => !v)}
            className={SETTINGS_OUTLINE_BUTTON_CLASS}
            aria-expanded={showMarketplaces}
          >
            <Store size={13} strokeWidth={1.7} />
            {t('settingsMcpMarketplaces')}
          </button>
        </div>
        {showImport && (
          <div className="space-y-2">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`{\n  "mcpServers": {\n    "my-server": { "url": "https://example.com/mcp" }\n  }\n}`}
              className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS} min-h-[140px] resize-y font-mono text-xs`}
              spellCheck={false}
            />
            {importError && (
              <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{importError}</div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleImportJson} className={SETTINGS_SECONDARY_ACTION_BUTTON_CLASS}>
                {t('settingsMcpImportConfirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportError(null);
                }}
                className={SETTINGS_OUTLINE_BUTTON_CLASS}
              >
                {t('settingsMcpImportCancel')}
              </button>
            </div>
          </div>
        )}
        {showMarketplaces && <McpMarketplaceGrid />}
      </div>

      <div className="flex gap-2">
        <Select
          id="mcp-filter-select"
          label={t('settingsMcpFilterAria')}
          hideLabel
          value={filter}
          onChange={(e) => setFilter(e.target.value as ServerFilter)}
          wrapperClassName="w-36 shrink-0 sm:w-40"
        >
          <option value="all">{t('settingsMcpFilterAll')}</option>
          <option value="enabled">{t('settingsMcpFilterEnabled')}</option>
          <option value="disabled">{t('settingsMcpFilterDisabled')}</option>
          <option value="http">{t('settingsMcpFilterHttp')}</option>
          <option value="sse">{t('settingsMcpFilterSse')}</option>
          <option value="stdio">{t('settingsMcpFilterStdio')}</option>
        </Select>
        <input
          placeholder={t('settingsMcpSearchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${MCP_INPUT_BASE_CLASSES} ${SETTINGS_INPUT_CLASS}`}
        />
      </div>

      {servers.length === 0 ? (
        <div
          className={`${SETTINGS_SECTION_CARD_CLASS} flex flex-col items-center justify-center gap-2 border-dashed py-10 text-center text-sm text-[var(--theme-text-secondary)]`}
        >
          <Server size={28} strokeWidth={1.5} className="opacity-40" aria-hidden />
          <span>{t('settingsMcpEmpty')}</span>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div
          className={`${SETTINGS_SECTION_CARD_CLASS} flex flex-col items-center justify-center gap-2 border-dashed py-10 text-center text-sm text-[var(--theme-text-secondary)]`}
        >
          <SearchX size={28} strokeWidth={1.5} className="opacity-40" aria-hidden />
          <span>{t('settingsMcpEmptyFiltered')}</span>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSearch('');
            }}
            className={`${SETTINGS_OUTLINE_BUTTON_CLASS} mt-1`}
          >
            {t('settingsMcpClearFilters')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSorted.map((server) => {
            const origIndex = servers.indexOf(server);
            const fallbackIndex = origIndex !== -1 ? origIndex : 0;
            const stateKey =
              origIndex !== -1
                ? (cardKeys[origIndex] ?? `mcp-card-fallback-${origIndex}`)
                : `mcp-card-fallback-${server.id}`;
            const index = origIndex !== -1 ? origIndex : fallbackIndex;
            const sortIndex = sortOrder.indexOf(server.id);
            const isExpanded = expandedCards.has(stateKey);

            return (
              <McpServerCard
                key={stateKey}
                server={server}
                index={index}
                isExpanded={isExpanded}
                capabilityState={capabilityStates[stateKey]}
                canMoveUp={sortIndex > 0}
                canMoveDown={sortIndex !== -1 && sortIndex < sortOrder.length - 1}
                activeTab={activeTabs[stateKey] ?? 'tools'}
                toolQuery={toolQueries[stateKey] ?? ''}
                deferredToolQuery={deferredToolQueries[stateKey] ?? ''}
                schemaToolNames={schemaToolNames}
                onToggleExpanded={() => toggleCardExpanded(stateKey)}
                onToggleEnabled={(enabled) => {
                  if (enabled && server.isTrusted === false) {
                    setPendingTrustIndex(index);
                    return;
                  }
                  if (enabled) {
                    enableServerWithProbe(index, stateKey);
                    return;
                  }
                  updateServer(index, { enabled });
                }}
                onRemove={() => removeServer(index)}
                onTestCapabilities={() => void testServerCapabilities(server, stateKey)}
                onMove={(direction) => moveServer(server.id, direction)}
                onUpdateServer={(updates) => updateServer(index, updates)}
                onTabChange={(tab) => setActiveTabs((prev) => ({ ...prev, [stateKey]: tab }))}
                onToolQueryChange={(query) => setToolQueries((prev) => ({ ...prev, [stateKey]: query }))}
                onToggleSchemaTool={(toolName) =>
                  setSchemaToolNames((prev) => {
                    const next = new Set(prev);
                    if (next.has(toolName)) {
                      next.delete(toolName);
                    } else {
                      next.add(toolName);
                    }
                    return next;
                  })
                }
                t={t}
              />
            );
          })}
        </div>
      )}
      {pendingTrustIndex !== null && servers[pendingTrustIndex] && (
        <McpTrustDialog
          server={servers[pendingTrustIndex]}
          onCancel={() => setPendingTrustIndex(null)}
          onConfirm={() => {
            const index = pendingTrustIndex;
            setPendingTrustIndex(null);
            if (index === null) return;
            const next = { ...servers[index], enabled: true, isTrusted: true };
            updateServer(index, next);
            void testServerCapabilities(next as McpServerConfig, cardKeys[index]);
          }}
        />
      )}
    </div>
  );
};
