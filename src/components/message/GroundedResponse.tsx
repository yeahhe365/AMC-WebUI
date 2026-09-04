import React, { useEffect, useMemo, useRef } from 'react';
import { type UploadedFile, type SideViewContent } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';
import { insertCitations, extractSources } from './grounded-response/groundingSources';
import { extractMapsPlaces } from '@/utils/groundingMetadata';
import { ContextUrls } from './grounded-response/ContextUrls';
import { SearchSources } from './grounded-response/SearchSources';
import { MapsWidget } from './grounded-response/MapsWidget';
import { IconGoogle } from '@/components/icons';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';

interface GroundedResponseProps {
  messageId?: string;
  text: string;
  metadata: unknown;
  urlContextMetadata?: unknown;
  isLoading: boolean;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  expandCodeBlocksByDefault: boolean;
  onImageClick: (file: UploadedFile) => void;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  files?: UploadedFile[];
  liveArtifactFontSize?: number;
  liveArtifactsMode?: boolean;
}

interface SearchQueryMetadata {
  searchEntryPoint?: {
    renderedContent?: string;
  };
}

const SEARCH_ENTRY_WIDGET_OVERRIDES = `
  :host {
    display: block;
    color: var(--theme-text-primary);
  }

  .container {
    display: inline-flex !important;
    align-items: center;
    gap: 0.5rem;
    min-width: max-content;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .container::before,
  .container::after {
    content: none !important;
    display: none !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  a,
  button,
  [role="button"] {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
    margin: 0 !important;
    line-height: 1.4;
    padding: 0.375rem 0.875rem;
    border-radius: 9999px;
    border: 1px solid var(--theme-border-secondary) !important;
    background: color-mix(in srgb, var(--theme-bg-secondary) 72%, transparent) !important;
    color: var(--theme-text-primary) !important;
    text-decoration: none !important;
    white-space: nowrap !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08) !important;
  }

  a:hover,
  button:hover,
  [role="button"]:hover {
    background: var(--theme-bg-tertiary) !important;
    border-color: var(--theme-border-focus) !important;
    color: var(--theme-text-link) !important;
  }
`;

const SearchEntryPointWidget: React.FC<{ renderedContent: string }> = ({ renderedContent }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof window === 'undefined') {
      return;
    }

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '';

    const overrideStyle = window.document.createElement('style');
    overrideStyle.textContent = SEARCH_ENTRY_WIDGET_OVERRIDES;
    shadowRoot.appendChild(overrideStyle);

    const template = window.document.createElement('template');
    template.innerHTML = renderedContent;
    shadowRoot.appendChild(template.content.cloneNode(true));

    const shouldRemoveElement = (element: HTMLElement) => {
      const identityText = [
        typeof element.className === 'string' ? element.className : '',
        element.id,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-testid'),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const isInteractive = element.matches('a, button, [role="button"]');
      const hasInteractiveDescendants = Boolean(element.querySelector('a, button, [role="button"]'));
      const hasIconContent = Boolean(element.querySelector('img, svg, use, path, circle, rect'));
      const hasMeaningfulText = (element.textContent ?? '').trim().length > 0;
      const isLogoLike = /(logo|icon|google|brand)/.test(identityText);
      const isDividerLike = /(separator|divider|split|rule)/.test(identityText);

      if ((isDividerLike || isLogoLike) && !isInteractive && !hasInteractiveDescendants) {
        return true;
      }

      return !isInteractive && !hasInteractiveDescendants && !hasIconContent && !hasMeaningfulText && !isLogoLike;
    };

    let removedAny = true;
    while (removedAny) {
      removedAny = false;
      const elements = Array.from(shadowRoot.querySelectorAll('.container *')) as HTMLElement[];

      for (const element of elements.reverse()) {
        if (shouldRemoveElement(element)) {
          element.remove();
          removedAny = true;
        }
      }
    }
  }, [renderedContent]);

  return (
    <div className="flex items-center gap-3">
      <div data-testid="search-entry-google-logo" className="flex flex-shrink-0 items-center">
        <IconGoogle size={18} />
      </div>
      <div
        ref={hostRef}
        className="search-entry-surface custom-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto bg-transparent"
      />
    </div>
  );
};

export const GroundedResponse: React.FC<GroundedResponseProps> = ({
  messageId,
  text,
  metadata,
  urlContextMetadata,
  isLoading,
  onOpenHtmlPreview,
  onLiveArtifactFollowUp,
  expandCodeBlocksByDefault,
  onImageClick,
  isMermaidRenderingEnabled,
  isGraphvizRenderingEnabled,
  themeId,
  onOpenSidePanel,
  files,
  liveArtifactFontSize,
  liveArtifactsMode,
}) => {
  const content = useMemo(() => insertCitations(text, metadata), [text, metadata]);
  const sources = useMemo(() => extractSources(metadata), [metadata]);
  const mapsPlaces = useMemo(() => extractMapsPlaces(metadata), [metadata]);
  const searchEntryPointContent = useMemo(() => {
    if (typeof metadata !== 'object' || metadata === null) {
      return undefined;
    }

    const searchMetadata = metadata as SearchQueryMetadata;
    return searchMetadata.searchEntryPoint?.renderedContent;
  }, [metadata]);

  return (
    <div className="space-y-4">
      {searchEntryPointContent ? <SearchEntryPointWidget renderedContent={searchEntryPointContent} /> : null}

      <div className="markdown-body">
        <LazyMarkdownRenderer
          messageId={messageId}
          content={content}
          isLoading={isLoading}
          onImageClick={onImageClick}
          onOpenHtmlPreview={onOpenHtmlPreview}
          onLiveArtifactFollowUp={onLiveArtifactFollowUp}
          expandCodeBlocksByDefault={expandCodeBlocksByDefault}
          isMermaidRenderingEnabled={isMermaidRenderingEnabled}
          isGraphvizRenderingEnabled={isGraphvizRenderingEnabled}
          allowHtml={true}
          themeId={themeId}
          onOpenSidePanel={onOpenSidePanel}
          files={files}
          liveArtifactFontSize={liveArtifactFontSize}
          liveArtifactsMode={liveArtifactsMode}
        />
      </div>

      <ContextUrls metadata={urlContextMetadata} />

      {mapsPlaces.length > 0 ? <MapsWidget places={mapsPlaces} /> : <SearchSources sources={sources} />}
    </div>
  );
};
