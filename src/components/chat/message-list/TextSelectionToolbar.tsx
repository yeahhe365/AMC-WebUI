import { logService } from '@/services/logService';
import React, { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useSettingsStore } from '@/stores/settingsStore';

import { useSelectionPosition } from '@/hooks/text-selection/useSelectionPosition';
import { useSelectionDrag } from '@/hooks/text-selection/useSelectionDrag';
import { useSelectionAudio } from '@/hooks/text-selection/useSelectionAudio';
import type { QuickTtsResult } from '@/hooks/chat/message/useTextToSpeechHandler';
import { copyTextToClipboard } from '@/utils/clipboard';
import { getErrorMessage } from '@/utils/errorMessage';

import { ToolbarContainer } from './text-selection/ToolbarContainer';
import { AudioPlayerView } from './text-selection/AudioPlayerView';
import { StandardActionsView } from './text-selection/StandardActionsView';

interface TextSelectionToolbarProps {
  onQuote: (text: string) => void;
  onInsert?: (text: string) => void;
  onAsk?: (text: string, rect: DOMRect | null) => void;
  onTTS?: (text: string) => Promise<QuickTtsResult>;
  containerRef: RefObject<HTMLElement> | HTMLElement | null;
}

export const TextSelectionToolbar: React.FC<TextSelectionToolbarProps> = ({
  onQuote,
  onInsert,
  onAsk,
  onTTS,
  containerRef,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Two independent timers: one resets the "Copied" feedback, the other hides
  // the toolbar after a button copy. Sharing a ref used to cancel the feedback
  // reset and leave the button stuck in the copied state.
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const copyClearTimeoutRef = useRef<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const preserveFormattingOnCopy = useSettingsStore(
    (state) => state.appSettings.isCopySelectionFormattingEnabled ?? true,
  );

  const showCopiedFeedback = () => {
    setIsCopied(true);
    if (copyFeedbackTimeoutRef.current) {
      window.clearTimeout(copyFeedbackTimeoutRef.current);
    }
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsCopied(false);
      copyFeedbackTimeoutRef.current = null;
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
      if (copyClearTimeoutRef.current) {
        window.clearTimeout(copyClearTimeoutRef.current);
      }
    };
  }, []);

  const audioState = useSelectionAudio();
  const ttsInFlightRef = useRef(false);

  const { position, setPosition, selectedText, selectedSpeechText, selectedCopyText, selectionRect, clearSelection } =
    useSelectionPosition({
      containerRef,
      isAudioActive: audioState.isPlaying || audioState.isLoading,
      isAudioActiveRef: audioState.isAudioActiveRef,
      toolbarRef,
      onCopySuccess: showCopiedFeedback,
      preserveFormattingOnCopy,
    });

  // A pending post-copy clear must not wipe a selection the user starts inside
  // the grace window; any toolbar reposition means new user activity, so drop it.
  useEffect(() => {
    if (position && copyClearTimeoutRef.current !== null) {
      window.clearTimeout(copyClearTimeoutRef.current);
      copyClearTimeoutRef.current = null;
    }
  }, [position]);

  const { handleDragStart, isDragging } = useSelectionDrag({
    toolbarRef,
    position,
    onPositionChange: setPosition,
  });

  const handleQuoteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuote(selectedText);
    clearSelection();
  };

  const handleInsertClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onInsert) onInsert(selectedText);
    clearSelection();
  };

  const handleCopyClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (await copyTextToClipboard(selectedCopyText || selectedText)) {
      showCopiedFeedback();
      if (copyClearTimeoutRef.current) {
        window.clearTimeout(copyClearTimeoutRef.current);
      }
      copyClearTimeoutRef.current = window.setTimeout(() => {
        copyClearTimeoutRef.current = null;
        clearSelection();
      }, 1000);
    }
  };

  const handleSearchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, '_blank', 'noopener,noreferrer');
    clearSelection();
  };

  const handleAskClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAsk) onAsk(selectedText, selectionRect);
  };

  const handleTTSClick = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (ttsInFlightRef.current || !onTTS) return;

    const text = (selectedSpeechText || selectedText).trim();
    if (!text) return;

    ttsInFlightRef.current = true;
    flushSync(() => {
      audioState.setIsLoading(true);
    });
    audioState.armFromUserGesture();

    try {
      const result = await onTTS(text);
      if ('url' in result) {
        audioState.play(result.url);
      } else {
        ttsInFlightRef.current = false;
        audioState.fail(result.error);
      }
    } catch (ttsError) {
      ttsInFlightRef.current = false;
      logService.error('TTS Failed:', ttsError);
      audioState.fail(getErrorMessage(ttsError, 'TTS generation failed.'));
    } finally {
      audioState.setIsLoading(false);
    }
  };

  const handleCloseAudio = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ttsInFlightRef.current = false;
    audioState.stop();
    clearSelection();
  };

  if (!position) return null;

  return (
    <ToolbarContainer ref={toolbarRef} position={position} isDragging={isDragging.current}>
      {audioState.isPlaying || audioState.isLoading ? (
        <AudioPlayerView
          audioUrl={audioState.audioUrl}
          isLoading={audioState.isLoading}
          audioRef={audioState.audioRef}
          onDragStart={handleDragStart}
          onClose={handleCloseAudio}
        />
      ) : (
        <StandardActionsView
          onQuote={handleQuoteClick}
          onInsert={onInsert ? handleInsertClick : undefined}
          onCopy={handleCopyClick}
          onSearch={handleSearchClick}
          onAsk={onAsk ? handleAskClick : undefined}
          onTTS={onTTS ? handleTTSClick : undefined}
          isCopied={isCopied}
          ttsError={audioState.errorMessage}
        />
      )}
    </ToolbarContainer>
  );
};
