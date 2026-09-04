import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SUGGESTIONS_KEYS } from '@/constants/welcomeSuggestions';
import { SUGGESTION_CHIP_ACTIVE_CLASS, SUGGESTION_CHIP_CLASS } from '@/constants/designTokens';
import { SuggestionIcon } from './SuggestionIcon';
import { NavChip } from './NavChip';
import { type translations } from '@/i18n/translations';

/** Scroll-arrow chrome shared by both directions. */
const SUGGESTION_SCROLL_ARROW_CLASSES =
  'absolute top-1/2 -translate-y-[calc(50%+4px)] z-10 p-1.5 rounded-full bg-[var(--theme-bg-primary)]/95 border border-[var(--theme-border-secondary)] shadow-md text-[var(--theme-text-primary)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:border-[var(--theme-border-focus)]';

/** Trailing state dot — separates toggle chips (导航/BBox/Guide) from one-shot actions. */
const SuggestionToggleDot = () => (
  <span aria-hidden="true" className="h-1 w-1 flex-shrink-0 rounded-full bg-current opacity-50" />
);

/** Hidden-by-default state that stays reachable via keyboard focus. */
const SUGGESTION_SCROLL_ARROW_HIDDEN_CLASSES =
  'opacity-0 pointer-events-none focus-visible:opacity-100 focus-visible:pointer-events-auto';

/**
 * Directional edge fade — only the side that actually hides chips fades, so a
 * clipped chip reads as "scrollable" instead of "broken". Correct at both
 * scroll extremes, unlike the old static always-both-sides mask.
 */
const suggestionFadeClass = (fadeLeft: boolean, fadeRight: boolean): string => {
  if (fadeLeft && fadeRight) return 'fade-mask-x-both';
  if (fadeLeft) return 'fade-mask-x-l';
  if (fadeRight) return 'fade-mask-x-r';
  return '';
};

interface ChatSuggestionsProps {
  show: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onOrganizeInfoClick?: (suggestion: string) => void;
  onToggleBBox?: () => void;
  isBBoxModeActive?: boolean;
  onToggleGuide?: () => void;
  isGuideModeActive?: boolean;
  onTogglePdfNav?: () => void;
  isPdfNavEnabled?: boolean;
  onToggleVideoNav?: () => void;
  isVideoNavEnabled?: boolean;
  onToggleAudioNav?: () => void;
  isAudioNavEnabled?: boolean;
  isFullscreen: boolean;
}

const ChatSuggestionsComponent: React.FC<ChatSuggestionsProps> = ({
  show,
  onSuggestionClick,
  onOrganizeInfoClick,
  onToggleBBox,
  isBBoxModeActive,
  onToggleGuide,
  isGuideModeActive,
  onTogglePdfNav,
  isPdfNavEnabled,
  onToggleVideoNav,
  isVideoNavEnabled,
  onToggleAudioNav,
  isAudioNavEnabled,
  isFullscreen,
}) => {
  const { t } = useI18n();
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [isSuggestionsHovered, setIsSuggestionsHovered] = useState(false);

  const checkScroll = useCallback(() => {
    if (suggestionsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = suggestionsRef.current;
      setShowLeftArrow(scrollLeft > 5); // Small threshold
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, show]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (suggestionsRef.current) {
      const scrollAmount = suggestionsRef.current.clientWidth * 0.6;
      suggestionsRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!show || isFullscreen) return null;

  return (
    <div
      className="relative group/suggestions mb-1.5 sm:mb-2"
      onMouseEnter={() => setIsSuggestionsHovered(true)}
      onMouseLeave={() => setIsSuggestionsHovered(false)}
    >
      <div
        ref={suggestionsRef}
        onScroll={checkScroll}
        className={`flex gap-2 overflow-x-auto pb-1 px-1 no-scrollbar scroll-smooth ${suggestionFadeClass(showLeftArrow, showRightArrow)}`}
      >
        {SUGGESTIONS_KEYS.map((suggestion, index) => (
          <React.Fragment key={index}>
            <button
              type="button"
              onClick={() => {
                const text = t(suggestion.descKey as keyof typeof translations);
                if (suggestion.specialAction === 'organize' && onOrganizeInfoClick) {
                  onOrganizeInfoClick(text);
                } else if (onSuggestionClick) {
                  onSuggestionClick(text);
                }
              }}
              className={SUGGESTION_CHIP_CLASS}
            >
              <SuggestionIcon iconName={suggestion.icon} />
              <span>{t(suggestion.titleKey as keyof typeof translations)}</span>
            </button>

            {suggestion.specialAction === 'organize' && (
              <>
                {onToggleBBox && (
                  <button
                    type="button"
                    onClick={onToggleBBox}
                    className={isBBoxModeActive ? SUGGESTION_CHIP_ACTIVE_CLASS : SUGGESTION_CHIP_CLASS}
                    aria-label={t('bboxButtonTitle')}
                    aria-pressed={!!isBBoxModeActive}
                    title={t('bboxButtonTitle')}
                  >
                    <SuggestionIcon iconName="BoxSelect" />
                    <span>{t('bboxButtonShort')}</span>
                    <SuggestionToggleDot />
                  </button>
                )}
                {onToggleGuide && (
                  <button
                    type="button"
                    onClick={onToggleGuide}
                    className={isGuideModeActive ? SUGGESTION_CHIP_ACTIVE_CLASS : SUGGESTION_CHIP_CLASS}
                    aria-label={t('guideButtonTitle')}
                    aria-pressed={!!isGuideModeActive}
                    title={t('guideButtonTitle')}
                  >
                    <SuggestionIcon iconName="MousePointer2" />
                    <span>{t('guideButtonShort')}</span>
                    <SuggestionToggleDot />
                  </button>
                )}
                {onTogglePdfNav && (
                  <NavChip
                    iconName="Pdf"
                    labelKey="pdfNavLabel"
                    missingHintKey="pdfNavNoPdfHint"
                    mediaKind="pdf"
                    isEnabled={!!isPdfNavEnabled}
                    onToggle={onTogglePdfNav}
                    testId="pdf-nav-chip"
                  />
                )}
                {onToggleVideoNav && (
                  <NavChip
                    iconName="Clapperboard"
                    labelKey="videoNavChipLabel"
                    missingHintKey="videoNavNoVideoHint"
                    mediaKind="video"
                    isEnabled={!!isVideoNavEnabled}
                    onToggle={onToggleVideoNav}
                    testId="video-nav-chip"
                  />
                )}
                {onToggleAudioNav && (
                  <NavChip
                    iconName="AudioLines"
                    labelKey="audioNavChipLabel"
                    missingHintKey="audioNavNoAudioHint"
                    mediaKind="audio"
                    isEnabled={!!isAudioNavEnabled}
                    onToggle={onToggleAudioNav}
                    testId="audio-nav-chip"
                  />
                )}
              </>
            )}
          </React.Fragment>
        ))}
      </div>

      {showLeftArrow && (
        <button
          type="button"
          onClick={() => handleScroll('left')}
          className={`${SUGGESTION_SCROLL_ARROW_CLASSES} left-0 ${isSuggestionsHovered ? 'opacity-100' : SUGGESTION_SCROLL_ARROW_HIDDEN_CLASSES}`}
          aria-label={t('suggestionsScrollLeft')}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      )}
      {showRightArrow && (
        <button
          type="button"
          onClick={() => handleScroll('right')}
          className={`${SUGGESTION_SCROLL_ARROW_CLASSES} right-0 ${isSuggestionsHovered ? 'opacity-100' : SUGGESTION_SCROLL_ARROW_HIDDEN_CLASSES}`}
          aria-label={t('suggestionsScrollRight')}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
};

export const ChatSuggestions = React.memo(ChatSuggestionsComponent);
