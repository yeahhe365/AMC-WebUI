import React, { useEffect, useMemo, useRef } from 'react';
import { type ChatMessage, type UploadedFile, type AppSettings, type SideViewContent } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { useI18n } from '@/contexts/I18nContext';
import { LazyMarkdownRenderer } from '@/components/message/LazyMarkdownRenderer';
import { isCodeExecutionPendingInContent } from '@/features/chat-streaming/messageStreamParts';
import { GroundedResponse } from '@/components/message/GroundedResponse';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { extractAutoPreviewableBlock, normalizePreviewableMarkdownContent } from '@/utils/previewableMarkdown';
import { useSmoothStreaming } from '@/hooks/ui/useSmoothStreaming';
import { useMessageStream } from '@/hooks/ui/useMessageStream';
import { extractRawThinkingBlocks } from '@/utils/chat/reasoning';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  getUserMessageCollapseKey,
  shouldCollapseUserMessageContent,
  USER_MESSAGE_COLLAPSED_LINE_HEIGHT,
  USER_MESSAGE_COLLAPSE_LINE_THRESHOLD,
  type UserMessageCollapseController,
} from './userMessageCollapse';
import { resolveLiveArtifactsFontSize } from '@/utils/live-artifacts/liveArtifactsFontSize';
import { isLiveArtifactsModeFromSettings } from '@/utils/live-artifacts/liveArtifactsMode';
import { parseLocateMarkers } from '@/utils/media-nav/locateMarker';
import { LocateChips } from '@/components/media-nav/LocateChips';
import { useChatStore } from '@/stores/chatStore';

interface MessageTextProps {
  message: ChatMessage;
  showThoughts: boolean;
  appSettings: AppSettings;
  themeId: string;
  baseFontSize: number;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  expandCodeBlocksByDefault: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  onOpenSidePanel: (content: SideViewContent) => void;
  userMessageCollapse?: UserMessageCollapseController;
  diagramLoadMode?: 'deferred' | 'eager';
}

export const MessageText: React.FC<MessageTextProps> = ({
  message,
  showThoughts,
  appSettings,
  themeId,
  baseFontSize,
  onImageClick,
  onOpenHtmlPreview,
  onLiveArtifactFollowUp,
  expandCodeBlocksByDefault,
  isMermaidRenderingEnabled,
  isGraphvizRenderingEnabled,
  onOpenSidePanel,
  userMessageCollapse,
  diagramLoadMode,
}) => {
  const { t } = useI18n();
  const { content, audioSrc, groundingMetadata, urlContextMetadata, thoughts } = message;
  const isLoading = message.isLoading ?? false;

  const { streamContent, streamThoughts } = useMessageStream(message.id, isLoading && message.role === 'model');

  const fullStreamingText = streamContent ? `${content || ''}${streamContent}` : content;
  // 流式期间本组件每帧重渲染，extraction 对全文跑正则，必须 memo；
  // 字符串相等时 React 保留上一次结果，避免每帧重复解析。
  const rawThinkingExtraction = useMemo(() => extractRawThinkingBlocks(fullStreamingText), [fullStreamingText]);
  // PDF locate markers (<pdf-locate …>) live in the raw content but must never
  // reach the markdown renderer; parse is memoized like thinking extraction.
  const locateExtraction = useMemo(
    () =>
      message.role === 'model'
        ? parseLocateMarkers(rawThinkingExtraction.content)
        : { cleanContent: rawThinkingExtraction.content, pdfLocates: [], videoLocates: [], audioLocates: [] },
    [rawThinkingExtraction.content, message.role],
  );
  const effectiveContent = locateExtraction.cleanContent;
  const effectiveThoughts = useMemo(
    () => [thoughts, streamThoughts, rawThinkingExtraction.thoughts].filter(Boolean).join('\n\n'),
    [thoughts, streamThoughts, rawThinkingExtraction.thoughts],
  );

  const shouldSmooth = isLoading && message.role === 'model';
  const displayedContent = useSmoothStreaming(effectiveContent, shouldSmooth);
  const markdownContent = useMemo(
    () =>
      normalizePreviewableMarkdownContent(displayedContent, {
        isStreaming: shouldSmooth,
        unwrapMislabeledHtmlBlocks: appSettings.unwrapMislabeledHtmlBlocks ?? true,
      }),
    [displayedContent, shouldSmooth, appSettings.unwrapMislabeledHtmlBlocks],
  );
  // The sandbox round-trip has no tokens to show while Google executes, so the
  // code-exec card would sit silently. The content itself carries the signal:
  // an executableCode block with no following tool-result block means the
  // sandbox is still running (streaming only — completed messages resolve it).
  const hasPendingCodeExecution = useMemo(
    () => isLoading && message.role === 'model' && isCodeExecutionPendingInContent(markdownContent),
    [markdownContent, isLoading, message.role],
  );
  const shouldOfferUserMessageCollapse =
    Boolean(userMessageCollapse) &&
    message.role === 'user' &&
    !isLoading &&
    shouldCollapseUserMessageContent(displayedContent);
  const userMessageCollapseKey = getUserMessageCollapseKey(message.id, displayedContent);
  const isUserMessageExpanded = userMessageCollapse?.expandedUserMessageKeys.has(userMessageCollapseKey) ?? false;
  const isUserMessageCollapsed = shouldOfferUserMessageCollapse && !isUserMessageExpanded;
  const userMessageCollapseRegionId = `${message.id}-message-text`;
  const collapsedMaxHeight = baseFontSize * USER_MESSAGE_COLLAPSED_LINE_HEIGHT * USER_MESSAGE_COLLAPSE_LINE_THRESHOLD;
  const liveArtifactFontSize = useMemo(() => resolveLiveArtifactsFontSize(appSettings), [appSettings]);
  // LA mode must match the header button, which tracks the ACTIVE session's
  // systemInstruction (currentChatSettings), not the global default. The
  // message list only renders the active session's messages, so reading the
  // same session setting here keeps the renderer and button consistent —
  // otherwise a global LA prompt could mislabel a ```json block in a session
  // that has its own custom system prompt (or miss a session that enabled LA
  // locally). The LA prompt mode/overrides stay app-level (they are not
  // per-session fields).
  // Select narrowly (savedSessions + activeSessionId only): activeMessages
  // changes on every streaming chunk, and subscribing to it would defeat
  // React.memo on sibling message bubbles. Two primitive selectors so the
  // object identity is stable across unrelated store updates.
  const savedSessions = useChatStore((state) => state.savedSessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const currentChatSettingsSystemInstruction = useMemo(() => {
    const activeSession = savedSessions.find((session) => session.id === activeSessionId);
    return activeSession?.settings.systemInstruction ?? appSettings.systemInstruction;
  }, [activeSessionId, appSettings.systemInstruction, savedSessions]);
  const liveArtifactsMode = useMemo(
    () =>
      isLiveArtifactsModeFromSettings({
        systemInstruction: currentChatSettingsSystemInstruction,
        promptMode: appSettings.liveArtifactsPromptMode,
        liveArtifactsSystemPrompt: appSettings.liveArtifactsSystemPrompt,
        liveArtifactsSystemPrompts: appSettings.liveArtifactsSystemPrompts,
      }),
    [
      appSettings.liveArtifactsPromptMode,
      appSettings.liveArtifactsSystemPrompt,
      appSettings.liveArtifactsSystemPrompts,
      currentChatSettingsSystemInstruction,
    ],
  );

  const prevIsLoadingRef = useRef(isLoading);
  useEffect(() => {
    let previewTimeout: number | null = null;

    if (prevIsLoadingRef.current && !isLoading) {
      if (appSettings.autoOpenHtmlPreview && message.role === 'model' && markdownContent) {
        // Strict auto-open path: only explicit html/svg fences or an unlabeled
        // full HTML/SVG document trigger the preview, so code labeled
        // python/css/text never opens the preview by content sniffing.
        // Live Artifacts (amc-live-artifact-html) are intentionally excluded —
        // they render inline via ArtifactFrame and never auto-open the modal.
        const previewableBlock = extractAutoPreviewableBlock(markdownContent);
        if (previewableBlock) {
          previewTimeout = window.setTimeout(() => {
            onOpenHtmlPreview(previewableBlock.content, {
              initialTrueFullscreen: false,
              privilege: 'unrestricted',
            });
          }, 100);
        }
      }
    }
    prevIsLoadingRef.current = isLoading;

    return () => {
      if (previewTimeout !== null) {
        clearTimeout(previewTimeout);
      }
    };
  }, [isLoading, appSettings.autoOpenHtmlPreview, markdownContent, message.role, onOpenHtmlPreview]);

  // Avoid showing the primary spinner when content, audio, or MessageThoughts already covers the loading state.
  const showPrimaryThinkingIndicator =
    isLoading && !effectiveContent && !audioSrc && (!showThoughts || !effectiveThoughts);

  return (
    <>
      {showPrimaryThinkingIndicator && (
        <div className="flex items-center text-sm text-[var(--theme-bg-model-message-text)] py-1 px-1 opacity-80 animate-pulse">
          <div className="mr-2.5 flex-shrink-0">
            <GoogleSpinner size={14} />
          </div>
          <span className="font-medium">{t('thinkingText')}</span>
        </div>
      )}

      {groundingMetadata || urlContextMetadata ? (
        <GroundedResponse
          messageId={message.id}
          text={displayedContent || ''}
          metadata={groundingMetadata}
          urlContextMetadata={urlContextMetadata}
          isLoading={isLoading}
          onOpenHtmlPreview={onOpenHtmlPreview}
          expandCodeBlocksByDefault={expandCodeBlocksByDefault}
          onImageClick={onImageClick}
          onLiveArtifactFollowUp={onLiveArtifactFollowUp}
          isMermaidRenderingEnabled={isMermaidRenderingEnabled}
          isGraphvizRenderingEnabled={isGraphvizRenderingEnabled}
          themeId={themeId}
          onOpenSidePanel={onOpenSidePanel}
          files={message.files}
          liveArtifactFontSize={liveArtifactFontSize}
          liveArtifactsMode={liveArtifactsMode}
        />
      ) : effectiveContent ? (
        <div data-user-message-collapsed={shouldOfferUserMessageCollapse ? String(isUserMessageCollapsed) : undefined}>
          <div
            id={userMessageCollapseRegionId}
            className={isUserMessageCollapsed ? 'overflow-hidden' : undefined}
            style={isUserMessageCollapsed ? { maxHeight: `${collapsedMaxHeight}px` } : undefined}
          >
            <div className={`markdown-body ${isLoading ? 'is-loading' : ''}`} style={{ fontSize: `${baseFontSize}px` }}>
              <LazyMarkdownRenderer
                messageId={message.id}
                content={markdownContent}
                contentPreNormalized={true}
                isLoading={isLoading}
                onImageClick={onImageClick}
                onOpenHtmlPreview={onOpenHtmlPreview}
                onLiveArtifactFollowUp={onLiveArtifactFollowUp}
                expandCodeBlocksByDefault={expandCodeBlocksByDefault}
                isMermaidRenderingEnabled={isMermaidRenderingEnabled}
                isGraphvizRenderingEnabled={isGraphvizRenderingEnabled}
                allowHtml={true}
                hasPendingCodeExecution={hasPendingCodeExecution}
                themeId={themeId}
                onOpenSidePanel={onOpenSidePanel}
                hideThinkingInContext={appSettings.hideThinkingInContext}
                files={message.files}
                liveArtifactFontSize={liveArtifactFontSize}
                liveArtifactsMode={liveArtifactsMode}
                unwrapMislabeledHtmlBlocks={appSettings.unwrapMislabeledHtmlBlocks ?? true}
                diagramLoadMode={diagramLoadMode}
              />
            </div>
          </div>

          {shouldOfferUserMessageCollapse && (
            <button
              type="button"
              aria-controls={userMessageCollapseRegionId}
              aria-expanded={isUserMessageExpanded}
              aria-label={isUserMessageExpanded ? t('collapse') : t('expand')}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-current opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
              onClick={() => userMessageCollapse?.onToggleUserMessageExpanded(userMessageCollapseKey)}
            >
              {isUserMessageExpanded ? t('collapse') : t('expand')}
              {isUserMessageExpanded ? (
                <ChevronUp size={15} strokeWidth={2} />
              ) : (
                <ChevronDown size={15} strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      ) : null}

      {message.role === 'model' && (
        <LocateChips
          messageId={message.id}
          pdfLocates={locateExtraction.pdfLocates}
          videoLocates={locateExtraction.videoLocates}
          audioLocates={locateExtraction.audioLocates}
        />
      )}
    </>
  );
};
