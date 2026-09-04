import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useI18n } from '@/contexts/I18nContext';
import type { McpServerConfig } from '@/types';

interface McpTrustDialogProps {
  server: McpServerConfig;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation modal shown before a server flagged untrusted is enabled.
 * Surfaces exactly what the connection will expose (command/args, url,
 * env/header key names) so the user can make an informed call.
 *
 * ESC and backdrop clicks route through the explicit onCancel callback, so
 * dismissing the dialog never enables the server.
 */
export const McpTrustDialog: React.FC<McpTrustDialogProps> = ({ server, onCancel, onConfirm }) => {
  const { t } = useI18n();

  return (
    <Modal
      isOpen
      onClose={onCancel}
      ariaLabel={t('settingsMcpTrustTitle')}
      backdropClassName="bg-black/50"
      contentClassName="w-full max-w-md rounded-xl border bg-[var(--theme-bg-primary)] shadow-xl"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('settingsMcpTrustTitle')}</h2>
          <p className="mt-1 text-xs text-[var(--theme-text-secondary)]">{t('settingsMcpTrustBody')}</p>
        </div>
      </div>
      <pre className="mx-4 mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg border bg-[var(--theme-bg-secondary)] p-2 text-xs">
        {JSON.stringify(
          {
            id: server.id,
            transport: server.transport,
            ...(server.command ? { command: server.command } : {}),
            ...(server.args?.length ? { args: server.args } : {}),
            ...(server.url ? { url: server.url } : {}),
            ...(Object.keys(server.env ?? {}).length ? { envKeys: Object.keys(server.env ?? {}) } : {}),
            ...(Object.keys(server.headers ?? {}).length ? { headerKeys: Object.keys(server.headers ?? {}) } : {}),
          },
          null,
          2,
        )}
      </pre>
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <button
          type="button"
          data-testid="mcp-trust-cancel"
          onClick={onCancel}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[var(--theme-bg-tertiary)]"
        >
          {t('settingsMcpCancel')}
        </button>
        <button
          type="button"
          data-testid="mcp-trust-confirm"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
        >
          {t('settingsMcpTrustAction')}
        </button>
      </div>
    </Modal>
  );
};
