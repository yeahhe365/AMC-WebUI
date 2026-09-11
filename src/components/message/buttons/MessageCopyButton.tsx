import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Check, ClipboardCopy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

import { toastSuccess } from '@/stores/toastStore';

interface MessageCopyButtonProps {
  textToCopy?: string;
  className?: string;
  iconSize?: number;
}

export const MessageCopyButton: React.FC<MessageCopyButtonProps> = ({ textToCopy, className, iconSize = 14 }) => {
  const { t } = useI18n();
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const handleCopy = () => {
    if (textToCopy) {
      copyToClipboard(textToCopy);
      toastSuccess(t('copiedButtonTitle') || 'Copied to clipboard');
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!textToCopy}
      className={`${className}`}
      aria-label={isCopied ? t('copiedButtonTitle') : t('copyButtonTitle')}
      title={isCopied ? t('copiedButtonTitle') : t('copyButtonTitle')}
    >
      {isCopied ? (
        <Check size={iconSize} className="text-[var(--theme-text-success)] icon-animate-pop" strokeWidth={1.5} />
      ) : (
        <ClipboardCopy size={iconSize} strokeWidth={1.5} />
      )}
    </button>
  );
};
