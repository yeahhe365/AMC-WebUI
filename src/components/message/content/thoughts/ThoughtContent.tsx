import React from 'react';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';
import { type SideViewContent, type UploadedFile } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { useMessageStream } from '@/hooks/ui/useMessageStream';

interface ThoughtContentProps {
  messageId: string;
  isLoading: boolean;
  content: string; // Persisted content
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  expandCodeBlocksByDefault: boolean;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  unwrapMislabeledHtmlBlocks?: boolean;
}

export const ThoughtContent: React.FC<ThoughtContentProps> = ({
  messageId,
  isLoading,
  content,
  onImageClick,
  onOpenHtmlPreview,
  expandCodeBlocksByDefault,
  themeId,
  onOpenSidePanel,
  unwrapMislabeledHtmlBlocks,
}) => {
  // Subscribe to live thoughts if loading
  const { streamThoughts } = useMessageStream(messageId, isLoading);
  const effectiveContent = streamThoughts || content;

  return (
    <div className="px-3 pb-3 pt-2 border-t border-[var(--theme-border-secondary)]/50 text-xs relative">
      <div className="prose prose-sm max-w-none dark:prose-invert text-[var(--theme-text-secondary)] leading-relaxed markdown-body thought-process-content opacity-90">
        <LazyMarkdownRenderer
          messageId={messageId}
          content={effectiveContent}
          isLoading={isLoading}
          onImageClick={onImageClick}
          onOpenHtmlPreview={onOpenHtmlPreview}
          expandCodeBlocksByDefault={expandCodeBlocksByDefault}
          isMermaidRenderingEnabled={false}
          isGraphvizRenderingEnabled={false}
          allowHtml={false}
          themeId={themeId}
          onOpenSidePanel={onOpenSidePanel}
          unwrapMislabeledHtmlBlocks={unwrapMislabeledHtmlBlocks}
        />
      </div>
    </div>
  );
};
