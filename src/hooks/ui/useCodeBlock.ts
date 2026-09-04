import React, { useState, useRef, useLayoutEffect } from 'react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { getCodeBlockPreviewType } from '@/utils/previewableMarkdown';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload, sanitizeFilename } from '@/utils/export/core';
import { type SideViewContent } from '@/types';
import { type OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { useI18n } from '@/contexts/I18nContext';

const COLLAPSE_THRESHOLD_PX = 320;

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  node: 'js',
  typescript: 'ts',
  ts: 'ts',
  python: 'py',
  py: 'py',
  py3: 'py',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  cs: 'cs',
  'c#': 'cs',
  go: 'go',
  golang: 'go',
  rust: 'rs',
  rs: 'rs',
  php: 'php',
  ruby: 'rb',
  rb: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  kt: 'kt',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  xml: 'xml',
  svg: 'svg',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  shell: 'sh',
  bash: 'sh',
  sh: 'sh',
  zsh: 'sh',
  markdown: 'md',
  md: 'md',
  react: 'jsx',
  jsx: 'jsx',
  tsx: 'tsx',
  vue: 'vue',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  perl: 'pl',
  pl: 'pl',
  powershell: 'ps1',
  ps1: 'ps1',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  batch: 'bat',
  bat: 'bat',
  text: 'txt',
  txt: 'txt',
  plaintext: 'txt',
};

interface UseCodeBlockProps {
  children: React.ReactNode;
  className?: string;
  expandCodeBlocksByDefault: boolean;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onOpenSidePanel: (content: SideViewContent) => void;
}

type CodeElementProps = {
  className?: string;
  children?: React.ReactNode;
};

export const useCodeBlock = ({
  children,
  className,
  expandCodeBlocksByDefault,
  onOpenHtmlPreview,
  onOpenSidePanel,
}: UseCodeBlockProps) => {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);

  const { isCopied, copyToClipboard } = useCopyToClipboard();

  // Tracks the length from the previous layout pass. A code block only auto-follows
  // to its bottom while its text is actively growing (i.e. streaming). Static blocks
  // — historical sessions, finished messages — are left pinned to the top.
  const prevTextLength = useRef(0);

  const codeElement = React.Children.toArray(children).find(
    (child): child is React.ReactElement<CodeElementProps> =>
      React.isValidElement<CodeElementProps>(child) &&
      (child.type === 'code' || Boolean(child.props.className?.includes('language-'))),
  );

  const resolvedCodeText = codeElement
    ? extractTextFromNode(codeElement.props.children)
    : extractTextFromNode(children);
  const isExpanded = expandedOverride ?? expandCodeBlocksByDefault;

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
  // work — re-parsing markdown each chunk must not cost N forced layouts for N blocks.
  // Runs after the follow effect above so growth detection sees the pre-flip length.
  useLayoutEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > COLLAPSE_THRESHOLD_PX;
    if (overflowing !== isOverflowing) {
      // Threshold-crossing commit: leave prevTextLength untouched so the follow
      // effect in the synced commit still sees this chunk as growth.
      setIsOverflowing(overflowing);
      return;
    }
    prevTextLength.current = resolvedCodeText.length;
  }, [resolvedCodeText, isOverflowing]);

  const handleToggleExpand = () => {
    setExpandedOverride((prev) => !(prev ?? expandCodeBlocksByDefault));
  };

  const handleCopy = () => {
    if (resolvedCodeText && !isCopied) {
      copyToClipboard(resolvedCodeText);
    }
  };

  const langMatch = className?.match(/language-(\S+)/);
  const language = langMatch ? langMatch[1].toLowerCase() : 'txt';

  const previewMarkupType = getCodeBlockPreviewType(resolvedCodeText, language);

  let mimeType = 'text/plain';
  if (language === 'svg' || previewMarkupType === 'svg') mimeType = 'image/svg+xml';
  else if (['html', 'xml'].includes(language) || previewMarkupType === 'html') mimeType = 'text/html';
  else if (['javascript', 'js', 'typescript', 'ts'].includes(language)) mimeType = 'application/javascript';
  else if (language === 'css') mimeType = 'text/css';
  else if (language === 'json') mimeType = 'application/json';
  else if (['markdown', 'md'].includes(language)) mimeType = 'text/markdown';

  const showPreview = previewMarkupType !== null;
  const downloadMimeType =
    mimeType !== 'text/plain'
      ? mimeType
      : previewMarkupType === 'svg'
        ? 'image/svg+xml'
        : showPreview
          ? 'text/html'
          : 'text/plain';

  let finalLanguage = language;
  if (previewMarkupType === 'html') finalLanguage = 'html';
  else if (previewMarkupType === 'svg') finalLanguage = 'svg';

  const handleOpenSide = () => {
    let displayTitle = t('htmlPreviewTitle');
    if (finalLanguage === 'html') {
      const titleMatch = resolvedCodeText.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        displayTitle = titleMatch[1];
      }
    }

    onOpenSidePanel({
      type: 'html',
      content: resolvedCodeText,
      language: finalLanguage,
      title: displayTitle,
    });
  };

  const handleOpenPreview = () => {
    onOpenHtmlPreview(resolvedCodeText, { privilege: 'unrestricted' });
  };

  const handleDownload = () => {
    const ext = LANGUAGE_EXTENSION_MAP[finalLanguage.toLowerCase()] || finalLanguage;
    let filename = `snippet.${ext}`;

    if (downloadMimeType === 'text/html' || ext === 'html') {
      const titleMatch = resolvedCodeText.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const saneTitle = sanitizeFilename(titleMatch[1].trim());
        if (saneTitle) filename = `${saneTitle}.html`;
      }
    }
    const blob = new Blob([resolvedCodeText], { type: downloadMimeType });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, filename);
  };

  return {
    preRef,
    isExpanded,
    isOverflowing,
    isCopied,
    sourceLanguage: language,
    finalLanguage,
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
