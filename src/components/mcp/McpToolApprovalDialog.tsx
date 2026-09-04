import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useI18n } from '@/contexts/I18nContext';
import { useMcpApprovalStore } from '@/stores/mcpApprovalStore';

/**
 * ESC and backdrop clicks resolve the pending request as an explicit deny so
 * awaiting callers are never left hanging.
 */
export const McpToolApprovalDialog: React.FC = () => {
  const { t } = useI18n();
  const pending = useMcpApprovalStore((state) => state.pending);
  const resolveApproval = useMcpApprovalStore((state) => state.resolveApproval);

  if (!pending) return null;

  return (
    <Modal
      isOpen
      onClose={() => resolveApproval('deny')}
      ariaLabel={t('mcpApprovalTitle')}
      backdropClassName="bg-black/50"
      contentClassName="w-full max-w-md rounded-xl border bg-[var(--theme-bg-primary)] shadow-xl"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('mcpApprovalTitle')}</h2>
          <p className="mt-1 truncate text-xs text-[var(--theme-text-secondary)]">
            {pending.request.serverName} · <span className="font-mono">{pending.request.toolName}</span>
          </p>
        </div>
      </div>
      <pre className="mx-4 mt-3 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg border bg-[var(--theme-bg-secondary)] p-2 text-xs">
        {JSON.stringify(pending.request.args, null, 2)}
      </pre>
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => resolveApproval('deny')}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[var(--theme-bg-tertiary)]"
        >
          {t('mcpApprovalDeny')}
        </button>
        <button
          type="button"
          onClick={() => resolveApproval('allow-once')}
          className="rounded-lg border border-emerald-600/40 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
        >
          {t('mcpApprovalAllowOnce')}
        </button>
        <button
          type="button"
          data-testid="mcp-approval-session"
          onClick={() => resolveApproval('allow-session')}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
        >
          {t('mcpApprovalAllowSession')}
        </button>
      </div>
    </Modal>
  );
};
