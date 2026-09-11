import { useState, useRef, useLayoutEffect, useEffect, useMemo, type ReactNode } from 'react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { extractTextFromNode, findCodeElement } from '@/utils/reactNodeText';
import { getCodeBlockPreviewType } from '@/utils/previewableMarkdown';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { hashString } from '@/utils/stringHash';
import {
  LANGUAGE_EXTENSION_MAP,
  detectSnippetFilename,
  getSnippetMimeType,
  repairIncompleteSvg,
} from '@/utils/codeSnippet';
import { type SideViewContent } from '@/types';
import { type OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { useI18n } from '@/contexts/I18nContext';

const COLLAPSE_THRESHOLD_PX = 320;
const COLLAPSE_TOLERANCE_PX = 48;
const DOWNLOAD_FEEDBACK_MS = 2000;

const MAX_EXPANDED_STATE_CACHE_ENTRIES = 500;
const codeBlockExpandedCache = new Map<string, boolean>();

export const readCachedCodeBlockExpanded = (key: string): boolean | undefined => {
  const cached = codeBlockExpandedCache.get(key);
  if (cached !== undefined) {
    codeBlockExpandedCache.delete(key);
    codeBlockExpandedCache.set(key, cached);
  }
  return cached;
};

export const writeCachedCodeBlockExpanded = (key: string, isExpanded: boolean) => {
  if (codeBlockExpandedCache.has(key)) {
    codeBlockExpandedCache.delete(key);
  }
  codeBlockExpandedCache.set(key, isExpanded);
  while (codeBlockExpandedCache.size > MAX_EXPANDED_STATE_CACHE_ENTRIES) {
    const oldestKey = codeBlockExpandedCache.keys().next().value;
    if (oldestKey === undefined) break;
    codeBlockExpandedCache.delete(oldestKey);
  }
};

export const clearCodeBlockExpandedCache = () => {
  codeBlockExpandedCache.clear();
};

export const getCodeBlockExpandedCacheKey = (
  cacheKey?: string,
  messageId?: string,
  resolvedCodeText?: string,
): string | undefined => {
  if (cacheKey) return cacheKey;
  if (messageId && resolvedCodeText !== undefined) {
    return `${messageId}:${resolvedCodeText.length}:${hashString(resolvedCodeText)}`;
  }
  if (resolvedCodeText !== undefined && resolvedCodeText.length > 0) {
    return `code:${resolvedCodeText.length}:${hashString(resolvedCodeText)}`;
  }
  return undefined;
};

interface UseCodeBlockProps {
  children: ReactNode;
  className?: string;
  cacheKey?: string;
  messageId?: string;
  expandCodeBlocksByDefault: boolean;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onOpenSidePanel: (content: SideViewContent) => void;
  isLoading?: boolean;
}

export const useCodeBlock = ({
  children,
  className,
  cacheKey,
  messageId,
  expandCodeBlocksByDefault,
  onOpenHtmlPreview,
  onOpenSidePanel,
  isLoading,
}: UseCodeBlockProps) => {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);

  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleWrap = () => {
    setIsWrapped((prev) => !prev);
  };

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current);
      }
    };
  }, []);

  // Tracks the length from the previous layout pass. A code block only auto-follows
  // to its bottom while its text is actively growing (i.e. streaming). Static blocks
  // — historical sessions, finished messages — are left pinned to the top.
  const prevTextLength = useRef(0);

  const codeElement = findCodeElement(children);

  const resolvedCodeText = codeElement
    ? extractTextFromNode(codeElement.props.children)
    : extractTextFromNode(children);

  const effectiveCacheKey = useMemo(
    () => getCodeBlockExpandedCacheKey(cacheKey, messageId, resolvedCodeText),
    [cacheKey, messageId, resolvedCodeText],
  );

  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(() => {
    if (effectiveCacheKey) {
      const cached = readCachedCodeBlockExpanded(effectiveCacheKey);
      if (cached !== undefined) return cached;
    }
    return null;
  });

  useEffect(() => {
    if (effectiveCacheKey) {
      const cached = readCachedCodeBlockExpanded(effectiveCacheKey);
      if (cached !== undefined) {
        setExpandedOverride(cached);
      }
    }
  }, [effectiveCacheKey]);

  const isExpanded =
    expandedOverride ??
    (effectiveCacheKey ? readCachedCodeBlockExpanded(effectiveCacheKey) : undefined) ??
    expandCodeBlocksByDefault;

  // Collapsed blocks hide overflow (overflow-y: hidden) so the user can never scroll
  // them manually — there is no "user scrolled up" state to honor. Auto-follow is
  // driven purely by text growth below.

  // Pin a growing block to its tail. Declared FIRST so it runs before the measure
  // effect below (effects run in declaration order), letting it read the previous
  // commit's length. The write is deferred to a frame callback: reading scrollHeight
  // already forced layout, and writing scrollTop in the same pass would force a
  // second one. The browser runs the callback before painting, so follow still lands
  // without a visible flash.
  useLayoutEffect(() => {
    if (isExpanded || !isOverflowing) return;
    const el = preRef.current;
    if (!el) return;
    const currentLength = resolvedCodeText.length;
    // prevTextLength starts at 0 on mount: a long static block (history) must stay
    // pinned to the top, only actively growing streams auto-follow to the bottom.
    if (prevTextLength.current <= 0 || currentLength <= prevTextLength.current) return;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [resolvedCodeText, isExpanded, isOverflowing]);

  // Measure only when the block's text actually changed. `resolvedCodeText` is a
  // plain string, so finished blocks (already-closed code in a streaming message,
  // history) compare equal across the per-chunk React re-render and skip all layout
  // Measure only when the block's text or wrapping mode actually changed. `resolvedCodeText` is a
  // plain string, so finished blocks compare equal across re-renders and skip all layout work.
  // When isWrapped changes, height reflows and scrollHeight changes, so it must re-measure.
  // Measure only when the block's text or wrapping mode actually changed. `resolvedCodeText` is a
  // plain string, so finished blocks compare equal across re-renders and skip all layout work.
  // When isWrapped changes, height reflows and scrollHeight changes, so it must re-measure.
  // COLLAPSE_TOLERANCE_PX prevents small overflows (e.g. 1-3 lines) from being awkwardly truncated.
  useLayoutEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > COLLAPSE_THRESHOLD_PX + COLLAPSE_TOLERANCE_PX;
    if (overflowing !== isOverflowing) {
      // Threshold-crossing commit: leave prevTextLength untouched so the follow
      // effect in the synced commit still sees this chunk as growth.
      setIsOverflowing(overflowing);
      return;
    }
    prevTextLength.current = resolvedCodeText.length;
  }, [resolvedCodeText, isOverflowing, isWrapped]);

  // When streaming finishes (isLoading flips from true to false), smoothly reset
  // scroll position to the top of the collapsed code block so the user can read
  // from line 1 instead of being trapped at the bottom.
  const wasLoadingRef = useRef(Boolean(isLoading));
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      if (!isExpanded && preRef.current && preRef.current.scrollTop > 0) {
        if (typeof preRef.current.scrollTo === 'function') {
          preRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          preRef.current.scrollTop = 0;
        }
      }
    }
    wasLoadingRef.current = Boolean(isLoading);
  }, [isLoading, isExpanded]);

  // Monitor element/window resize so that wrapped lines reflowing due to width changes
  // correctly re-evaluate overflow state.
  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    const checkOverflow = () => {
      const overflowing = el.scrollHeight > COLLAPSE_THRESHOLD_PX + COLLAPSE_TOLERANCE_PX;
      setIsOverflowing((prev) => (prev !== overflowing ? overflowing : prev));
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(checkOverflow);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, []);

  const handleToggleExpand = () => {
    const willCollapse = isExpanded;
    if (willCollapse && preRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (
          preRef.current.contains(range.commonAncestorContainer) ||
          preRef.current.contains(range.startContainer) ||
          preRef.current.contains(range.endContainer)
        ) {
          selection.removeAllRanges();
        }
      }

      // Smoothly anchor viewport if the top of the code block was scrolled above viewport
      if (typeof preRef.current.scrollIntoView === 'function') {
        const rect = preRef.current.getBoundingClientRect();
        if (rect.top < 0) {
          preRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
    setExpandedOverride((prev) => {
      const current =
        prev ??
        (effectiveCacheKey ? readCachedCodeBlockExpanded(effectiveCacheKey) : undefined) ??
        expandCodeBlocksByDefault;
      const next = !current;
      if (effectiveCacheKey) {
        writeCachedCodeBlockExpanded(effectiveCacheKey, next);
      }
      return next;
    });
  };

  const handleCopy = () => {
    if (resolvedCodeText && !isCopied) {
      copyToClipboard(resolvedCodeText);
    }
  };

  const langMatch = className?.match(/language-(\S+)/);
  let rawLang = langMatch ? langMatch[1] : 'txt';
  let fenceFilename: string | undefined;

  const colonIdx = rawLang.indexOf(':');
  if (colonIdx > 0) {
    fenceFilename = rawLang.slice(colonIdx + 1);
    rawLang = rawLang.slice(0, colonIdx);
  }

  const language = rawLang.toLowerCase();

  const previewMarkupType = getCodeBlockPreviewType(resolvedCodeText, language);

  let finalLanguage = language;
  if (previewMarkupType === 'html') finalLanguage = 'html';
  else if (previewMarkupType === 'svg') finalLanguage = 'svg';

  const showPreview = previewMarkupType !== null;
  const downloadMimeType = getSnippetMimeType(finalLanguage, previewMarkupType);

  const handleOpenSide = () => {
    let displayTitle = t('htmlPreviewTitle');
    if (finalLanguage === 'html' || finalLanguage === 'svg') {
      const ext = LANGUAGE_EXTENSION_MAP[finalLanguage.toLowerCase()] || finalLanguage;
      const detected = detectSnippetFilename(resolvedCodeText, finalLanguage, ext, fenceFilename);
      if (detected) {
        displayTitle = detected.replace(/\.[^.]+$/, '');
      }
    }

    let contentToPreview = resolvedCodeText;
    if (finalLanguage === 'svg') {
      contentToPreview = repairIncompleteSvg(contentToPreview);
    }

    onOpenSidePanel({
      type: 'html',
      content: contentToPreview,
      language: finalLanguage,
      title: displayTitle,
    });
  };

  const handleOpenPreview = () => {
    let contentToPreview = resolvedCodeText;
    if (finalLanguage === 'svg') {
      contentToPreview = repairIncompleteSvg(contentToPreview);
    }
    onOpenHtmlPreview(contentToPreview, { privilege: 'unrestricted' });
  };

  const handleDownload = () => {
    const ext = LANGUAGE_EXTENSION_MAP[finalLanguage.toLowerCase()] || finalLanguage;
    const filename = detectSnippetFilename(resolvedCodeText, finalLanguage, ext, fenceFilename);

    let codeToDownload = resolvedCodeText;
    if (finalLanguage === 'svg' || ext === 'svg') {
      codeToDownload = repairIncompleteSvg(codeToDownload);
    }

    const blob = new Blob([codeToDownload], { type: downloadMimeType });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, filename);

    setIsDownloaded(true);
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current);
    }
    downloadTimerRef.current = setTimeout(() => {
      setIsDownloaded(false);
    }, DOWNLOAD_FEEDBACK_MS);
  };

  // 跨行划词选择自动展开（对标 Cherry Studio onRequestExpand 机制）
  // 当代码块处于截断折叠状态且用户划选跨越多行时，平滑展开完整内容
  useEffect(() => {
    if (isExpanded || !isOverflowing) return;
    const preEl = preRef.current;
    if (!preEl) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

      const range = selection.getRangeAt(0);
      if (
        !preEl.contains(range.commonAncestorContainer) &&
        !preEl.contains(range.startContainer) &&
        !preEl.contains(range.endContainer)
      ) {
        return;
      }

      const selectedText = selection.toString();
      if (selectedText.includes('\n')) {
        setExpandedOverride(true);
        if (effectiveCacheKey) {
          writeCachedCodeBlockExpanded(effectiveCacheKey, true);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [isExpanded, isOverflowing, effectiveCacheKey]);

  const lineCount = useMemo(() => {
    if (!resolvedCodeText) return 0;
    return resolvedCodeText.split('\n').length;
  }, [resolvedCodeText]);

  return {
    preRef,
    isExpanded,
    isOverflowing,
    isCopied,
    isDownloaded,
    isWrapped,
    handleToggleWrap,
    sourceLanguage: language,
    finalLanguage,
    fenceFilename,
    lineCount,
    showPreview,
    handleToggleExpand,
    handleCopy,
    handleOpenSide,
    handleOpenPreview,
    handleDownload,
    codeElement,
    resolvedCodeText,
    previewMarkupType,
    COLLAPSE_THRESHOLD_PX,
  };
};
