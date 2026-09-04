import { logService } from '@/services/logService';
import React, { useMemo, useState } from 'react';
import { type ChatMessage, type AppSettings, type SideViewContent, type UploadedFile } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { getThinkingStreamTail, parseThinkingSections } from '@/utils/chat/parsing';
import { THINKING_STRIP_MAX_SOURCE_LINES } from './thoughts/thinkingStripMetrics';
import { translateTextApi } from '@/services/api/generation/textApi';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { DEFAULT_THOUGHT_TRANSLATION_MODEL_ID } from '@/constants/modelConfiguration';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { ThinkingHeader } from './thoughts/ThinkingHeader';
import { ThinkingStrip } from './thoughts/ThinkingStrip';
import { ThinkingActions } from './thoughts/ThinkingActions';
import { ThoughtContent } from './thoughts/ThoughtContent';
import { useMessageStream } from '@/hooks/ui/useMessageStream';
import { extractRawThinkingBlocks } from '@/utils/chat/reasoning';

interface MessageThoughtsProps {
  message: ChatMessage;
  showThoughts: boolean;
  appSettings: AppSettings;
  themeId: string;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  expandCodeBlocksByDefault: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  onOpenSidePanel: (content: SideViewContent) => void;
}

export const MessageThoughts: React.FC<MessageThoughtsProps> = ({
  message,
  showThoughts,
  appSettings,
  themeId,
  onImageClick,
  onOpenHtmlPreview,
  expandCodeBlocksByDefault,
  onOpenSidePanel,
}) => {
  const { content, thoughts, isLoading, role, id: messageId } = message;

  // Subscribe to live thoughts if loading to check visibility
  const { streamContent, streamThoughts } = useMessageStream(messageId, !!isLoading && role === 'model');
  const fullStreamingText = streamContent ? `${content || ''}${streamContent}` : content;
  // 流式期间本组件每帧重渲染，extraction 对全文跑正则，必须 memo；
  // 字符串相等时 React 保留上一次结果，避免每帧重复解析。
  const rawThinkingExtraction = useMemo(() => extractRawThinkingBlocks(fullStreamingText), [fullStreamingText]);
  const effectiveThoughts = useMemo(
    () => [thoughts, streamThoughts, rawThinkingExtraction.thoughts].filter(Boolean).join('\n\n'),
    [thoughts, streamThoughts, rawThinkingExtraction.thoughts],
  );

  const areThoughtsVisible = role === 'model' && effectiveThoughts && showThoughts;

  // UI State
  const [isExpanded, setIsExpanded] = useState(false);
  const [translatedThoughts, setTranslatedThoughts] = useState<string | null>(null);
  const [isShowingTranslation, setIsShowingTranslation] = useState(false);
  const [isTranslatingThoughts, setIsTranslatingThoughts] = useState(false);

  // Copy Hook
  const { isCopied, copyToClipboard } = useCopyToClipboard(2000);

  const thoughtsTail = useMemo(
    () => getThinkingStreamTail(effectiveThoughts, THINKING_STRIP_MAX_SOURCE_LINES),
    [effectiveThoughts],
  );

  // Sectioned Gemini-style streams (each section opens with a `**Title**`
  // line) drive the sectioned strip; flat/third-party streams fall back to the
  // tail window via the null return.
  const thinkingSections = useMemo(() => parseThinkingSections(effectiveThoughts), [effectiveThoughts]);

  // Preview strip is a live collapsed readout of thinking in progress.
  // Hide it as soon as thinking settles (thinkingTimeMs is committed /
  // thinkingActive is false), even if the answer is still streaming — otherwise
  // the last section sits outside the accordion until the whole message ends.
  // thinkingActive true re-opens it for interleaved re-thinking (syncThinkingResume
  // clears thinkingTimeMs). Older messages without those fields keep the strip
  // while loading and no time has settled.
  const hasSettledThinking = message.thinkingTimeMs !== undefined;
  const showThinkingStrip =
    !isExpanded &&
    thoughtsTail.length > 0 &&
    !hasSettledThinking &&
    (message.thinkingActive === true || (!!isLoading && message.thinkingActive === undefined));

  if (!areThoughtsVisible) return null;

  const handleTranslateThoughts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isShowingTranslation) {
      setIsShowingTranslation(false);
      return;
    }

    if (translatedThoughts) {
      setIsShowingTranslation(true);
      return;
    }

    if (!effectiveThoughts || isTranslatingThoughts) return;

    setIsTranslatingThoughts(true);
    try {
      const tempSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
      const keyResult = getGeminiKeyForRequest(appSettings, tempSettings, { skipIncrement: true });
      if ('error' in keyResult) {
        logService.error('API Key error for translation:', keyResult.error);
        return;
      }

      const result = await translateTextApi(
        keyResult.key,
        effectiveThoughts,
        appSettings.thoughtTranslationTargetLanguage || 'Simplified Chinese',
        appSettings.thoughtTranslationModelId || DEFAULT_THOUGHT_TRANSLATION_MODEL_ID,
      );
      setTranslatedThoughts(result);
      setIsShowingTranslation(true);
    } catch (error) {
      logService.error('Failed to translate thoughts:', error);
    } finally {
      setIsTranslatingThoughts(false);
    }
  };

  const handleCopyThoughts = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const textToCopy = isShowingTranslation && translatedThoughts ? translatedThoughts : effectiveThoughts;
    if (textToCopy) {
      copyToClipboard(textToCopy);
    }
  };
  const toggleExpanded = () => setIsExpanded((value) => !value);
  const handleToggleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Ignore key events bubbling up from inner buttons so Enter/Space on the
    // translate/copy actions no longer collapses the accordion or cancels the click.
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }

    e.preventDefault();
    toggleExpanded();
  };

  const hasFiles = message.files && message.files.length > 0;

  return (
    <div className={`mb-2 ${hasFiles ? 'mt-1' : '-mt-2'} message-thoughts-block`}>
      <div
        className={`group rounded-xl bg-[var(--theme-bg-tertiary)]/20 overflow-hidden transition-all duration-200 ${isExpanded ? 'bg-[var(--theme-bg-tertiary)]/30 shadow-sm' : ''}`}
      >
        <div
          className="flex select-none items-center justify-between gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-[var(--theme-bg-tertiary)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)]"
          onClick={toggleExpanded}
          onKeyDown={handleToggleKeyDown}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
        >
          <ThinkingHeader
            isLoading={!!isLoading}
            thinkingTimeMs={message.thinkingTimeMs}
            generationStartTime={message.generationStartTime}
            firstTokenTimeMs={message.firstTokenTimeMs}
            isExpanded={isExpanded}
          />

          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {/* Stop propagation to prevent toggling when clicking actions */}
            <div onClick={(e) => e.stopPropagation()}>
              <ThinkingActions
                isExpanded={isExpanded}
                isShowingTranslation={isShowingTranslation}
                isTranslatingThoughts={isTranslatingThoughts}
                isCopied={isCopied}
                onTranslate={handleTranslateThoughts}
                onCopy={handleCopyThoughts}
              />
            </div>
          </div>
        </div>

        {showThinkingStrip && (
          <ThinkingStrip
            thoughtsTail={thoughtsTail}
            sections={thinkingSections}
            thinkingSource={message.thinkingSource}
          />
        )}

        {isExpanded && (
          <div className="thought-process-accordion expanded">
            <div className="thought-process-inner">
              <ThoughtContent
                messageId={messageId}
                isLoading={!!isLoading}
                content={isShowingTranslation && translatedThoughts ? translatedThoughts : effectiveThoughts}
                onImageClick={onImageClick}
                onOpenHtmlPreview={onOpenHtmlPreview}
                expandCodeBlocksByDefault={expandCodeBlocksByDefault}
                themeId={themeId}
                onOpenSidePanel={onOpenSidePanel}
                unwrapMislabeledHtmlBlocks={appSettings.unwrapMislabeledHtmlBlocks ?? true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
