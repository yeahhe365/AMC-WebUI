import { copyTextToClipboard, copyRichTableToClipboard, type RichTableClipboardContent } from '@/utils/clipboard';
import { useState, useCallback, useEffect, useRef } from 'react';

export const useCopyToClipboard = (resetDuration = 2000) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const copyToClipboard = useCallback(
    async (content: string | RichTableClipboardContent): Promise<boolean> => {
      const success =
        typeof content === 'string' ? await copyTextToClipboard(content) : await copyRichTableToClipboard(content);
      if (success) {
        setIsCopied(true);

        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
          setIsCopied(false);
          timeoutRef.current = null;
        }, resetDuration);
        return true;
      }
      setIsCopied(false);
      return false;
    },
    [resetDuration],
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isCopied, copyToClipboard };
};
