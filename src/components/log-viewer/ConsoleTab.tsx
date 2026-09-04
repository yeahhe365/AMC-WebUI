import React, { useState } from 'react';
import { Filter, Download, Trash2, RefreshCw, Terminal } from 'lucide-react';
import type { LogEntry, LogLevel, LogCategory } from '@/types/logging';
import { LOG_LEVEL_COLORS, CATEGORY_COLORS } from './logColorClasses';
import { LogRow } from './LogRow';
import { useI18n } from '@/contexts/I18nContext';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';

interface ConsoleTabProps {
  logs: LogEntry[];
  isLoading: boolean;
  hasMore: boolean;
  onFetchMore: () => void;
  onClear: () => void;
  /** Set when the logging toggle is off, so the empty state explains why. */
  loggingDisabled?: boolean;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({
  logs,
  isLoading,
  hasMore,
  onFetchMore,
  onClear,
  loggingDisabled = false,
}) => {
  const { t } = useI18n();
  const [filterText, setFilterText] = useState('');
  const [activeCategory, setActiveCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [visibleLevels, setVisibleLevels] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
    DEBUG: true,
  });
  const toggleLevel = (level: LogLevel) => setVisibleLevels((prev) => ({ ...prev, [level]: !prev[level] }));
  const toPascal = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  const categoryLabel = (category: LogCategory | 'ALL') => t(`logCategory${toPascal(category)}`, category);
  const levelLabel = (level: LogLevel) => t(`logLevel${toPascal(level)}`, level);

  const filteredLogs = logs.filter((log) => {
    if (!visibleLevels[log.level]) return false;
    if (activeCategory !== 'ALL' && log.category !== activeCategory) return false;
    if (!filterText.trim()) return true;
    const lowerFilter = filterText.toLowerCase();
    return (
      log.message.toLowerCase().includes(lowerFilter) ||
      (log.data && JSON.stringify(log.data).toLowerCase().includes(lowerFilter))
    );
  });

  const handleExport = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    triggerDownload(createManagedObjectUrl(blob), `logs-export-${new Date().toISOString()}.json`);
  };

  return (
    <>
      <div className="p-3 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={t('logViewerSearchPlaceholder')}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-grow min-w-[150px] px-3 py-1.5 text-sm bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-md focus:ring-1 focus:ring-[var(--theme-border-focus)] text-[var(--theme-text-primary)]"
        />

        <div className="h-6 w-px bg-[var(--theme-border-secondary)] mx-1" />

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[var(--theme-text-tertiary)]" />
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value as LogCategory | 'ALL')}
            className="bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] text-xs rounded border border-[var(--theme-border-secondary)] px-2 py-1 focus:outline-none"
          >
            <option value="ALL">{t('logViewerAllCategories')}</option>
            {Object.keys(CATEGORY_COLORS).map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabel(cat as LogCategory)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs select-none">
          {Object.keys(visibleLevels).map((level) => (
            <label
              key={level}
              className="flex items-center gap-1 cursor-pointer bg-[var(--theme-bg-tertiary)]/50 px-2 py-1 rounded hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            >
              <input
                type="checkbox"
                checked={visibleLevels[level as LogLevel]}
                onChange={() => toggleLevel(level as LogLevel)}
                className="accent-[var(--theme-bg-accent)]"
              />
              <span className={LOG_LEVEL_COLORS[level as LogLevel]}>{levelLabel(level as LogLevel)}</span>
            </label>
          ))}
        </div>

        <div className="flex-grow" />

        <button
          onClick={handleExport}
          className={`flex items-center gap-1.5 text-xs bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] px-3 py-1.5 rounded-md transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
          title={t('logViewerExportJson')}
        >
          <Download size={14} /> {t('logViewerExportJson')}
        </button>
        <button
          onClick={onClear}
          className={`flex items-center gap-1.5 text-xs bg-[var(--theme-bg-danger)]/10 text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/20 px-3 py-1.5 rounded-md transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
        >
          <Trash2 size={14} /> {t('logViewerClearButton')}
        </button>
      </div>

      <div className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar bg-[var(--theme-bg-primary)]">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--theme-text-tertiary)] opacity-50">
            <Terminal size={48} className="mb-2" />
            <p>{t('logViewerNoLogs')}</p>
            {loggingDisabled && <p className="mt-2 text-xs opacity-80">{t('logViewerLoggingDisabledHint')}</p>}
          </div>
        ) : (
          filteredLogs.map((log) => <LogRow key={log.id || log.timestamp.toISOString()} log={log} />)
        )}

        {hasMore && filteredLogs.length > 0 && (
          <div className="p-4 flex justify-center border-t border-[var(--theme-border-secondary)]">
            <button
              onClick={onFetchMore}
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--theme-text-link)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors disabled:opacity-50 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
            >
              {isLoading ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              {t('logViewerLoadOlder')}
            </button>
          </div>
        )}
      </div>
    </>
  );
};
