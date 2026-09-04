import type React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface OpenAICompatibleModelFetchResultProps {
  status: 'idle' | 'success' | 'error';
  message?: string | null;
}

export const OpenAICompatibleModelFetchResult: React.FC<OpenAICompatibleModelFetchResultProps> = ({
  status,
  message,
}) => {
  if (status === 'idle' || !message) {
    return null;
  }

  const resultClass =
    status === 'success'
      ? 'border-[var(--theme-text-success)]/25 bg-[var(--theme-bg-success)] text-[var(--theme-text-success)]'
      : 'border-[var(--theme-text-danger)]/25 bg-[var(--theme-bg-danger)] text-[var(--theme-text-danger)]';

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-2 text-xs animate-in fade-in slide-in-from-top-1 ${resultClass}`}
    >
      {status === 'success' ? (
        <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle size={14} className="mt-0.5 flex-shrink-0" />
      )}
      <span className="break-all">{message}</span>
    </div>
  );
};
