import React, { useEffect, useState } from 'react';
import { Link2Off } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useI18n } from '@/contexts/I18nContext';
import { dedupeServersById, parseMcpShareParam } from '@/features/mcp/importMcpServers';
import { useSettingsStore } from '@/stores/settingsStore';
import type { McpServerConfig } from '@/types';

/**
 * Handles `?mcp=<base64url json>` share links (Cherry Studio's protocol
 * deep-link equivalent for the web). Servers always land disabled + untrusted;
 * enabling them goes through the regular trust dialog.
 *
 * ESC and backdrop clicks dismiss the gate (which also clears the `mcp` URL
 * param), so nothing is installed without an explicit confirm.
 */
export const McpShareInstallGate: React.FC = () => {
  const { t } = useI18n();
  const [pending, setPending] = useState<McpServerConfig[] | null>(null);
  const appSettings = useSettingsStore((state) => state.appSettings);

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('mcp');
      if (!param) return;
      const servers = parseMcpShareParam(param);
      if (servers.length > 0) setPending(servers);
    } catch {
      // Malformed links are ignored silently.
    }
  }, []);

  if (!pending || pending.length === 0) return null;

  const dismiss = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('mcp');
    window.history.replaceState({}, '', url.toString());
    setPending(null);
  };

  const confirm = () => {
    const existing = appSettings.mcpServers ?? [];
    const next = [
      ...existing,
      ...dedupeServersById(
        pending,
        existing.map((s) => s.id),
      ),
    ];
    useSettingsStore.getState().setAppSettings({ ...appSettings, mcpServers: next });
    dismiss();
  };

  return (
    <Modal
      isOpen
      onClose={dismiss}
      ariaLabel={t('settingsMcpShareTitle')}
      backdropClassName="bg-black/50"
      contentClassName="w-full max-w-md rounded-xl border bg-[var(--theme-bg-primary)] shadow-xl"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <Link2Off className="mt-0.5 h-5 w-5 shrink-0 text-[var(--theme-text-secondary)]" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('settingsMcpShareTitle')}</h2>
          <p className="mt-1 text-xs text-[var(--theme-text-secondary)]">{t('settingsMcpShareBody')}</p>
        </div>
      </div>
      <ul className="mx-4 mt-3 max-h-[220px] space-y-1 overflow-auto rounded-lg border bg-[var(--theme-bg-secondary)] p-2 text-xs">
        {pending.map((server) => (
          <li key={server.id} className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{server.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-[var(--theme-text-secondary)]">
              {server.transport.toUpperCase()}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <button
          type="button"
          data-testid="mcp-share-cancel"
          onClick={dismiss}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[var(--theme-bg-tertiary)]"
        >
          {t('settingsMcpCancel')}
        </button>
        <button
          type="button"
          data-testid="mcp-share-confirm"
          onClick={confirm}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
        >
          {t('settingsMcpShareAction')}
        </button>
      </div>
    </Modal>
  );
};
