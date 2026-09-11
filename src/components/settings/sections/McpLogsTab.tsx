import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { fetchMcpLogs, type McpLogEntry } from '@/services/api/mcpApi';
import type { McpServerConfig } from '@/types';
import { copyTextToClipboard } from '@/utils/clipboard';

interface McpLogsTabProps {
  server: McpServerConfig;
  t: (key: string) => string;
}

export const McpLogsTab: React.FC<McpLogsTabProps> = ({ server, t }) => {
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const serverIdRef = useRef(server.id);
  serverIdRef.current = server.id;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      setLoading(true);
      try {
        const result = await fetchMcpLogs({ ...server, id: serverIdRef.current }, signal);
        if (!signal?.aborted) setLogs(result.logs);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        // keep previous logs on error
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [server],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 30000);
    const handleVisibilityChange = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load]);

  const handleCopy = useCallback(() => {
    const text = logs.map((entry) => `[${entry.level}] ${entry.message}`).join('\n');
    void copyTextToClipboard(text);
  }, [logs]);

  const levelBadgeClass = (level: string) => {
    if (level === 'error') return 'bg-red-500/10 text-red-600';
    if (level === 'warn') return 'bg-amber-500/10 text-amber-700';
    if (level === 'stderr') return 'bg-orange-500/10 text-orange-700';
    if (level === 'debug') return 'bg-zinc-100 text-zinc-500';
    return 'bg-zinc-100 text-zinc-600';
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          {t('settingsMcpLogsRefresh') === 'settingsMcpLogsRefresh' ? 'Refresh' : t('settingsMcpLogsRefresh')}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
        >
          <Copy size={12} />
          {t('settingsMcpLogsCopy') === 'settingsMcpLogsCopy' ? 'Copy' : t('settingsMcpLogsCopy')}
        </button>
      </div>
      <div className="max-h-[200px] overflow-auto font-mono text-xs divide-y rounded border">
        {logs.length === 0 ? (
          <div className="px-2 py-6 text-center text-[var(--theme-text-tertiary)]">
            {t('settingsMcpLogsEmpty') === 'settingsMcpLogsEmpty' ? 'No logs' : t('settingsMcpLogsEmpty')}
          </div>
        ) : (
          logs.map((entry, index) => (
            <div key={`${entry.timestamp}-${index}`} className="px-2 py-1">
              <span className={`px-1 rounded text-[10px] ${levelBadgeClass(entry.level)}`}>{entry.level}</span>{' '}
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
