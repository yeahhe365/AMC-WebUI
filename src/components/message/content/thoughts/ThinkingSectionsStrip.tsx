import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { ThinkingSection } from '@/utils/chat/parsing';
import { THINKING_STRIP_CONTENT_HEIGHT_REM } from './thinkingStripMetrics';
import { interpolate } from '@/i18n/interpolate';

interface ThinkingSectionsStripProps {
  sections: ThinkingSection[];
}

const SCROLL_FOLLOW_THRESHOLD_PX = 24;

// Sectioned view for Gemini-style thinking streams (each section opens with a
// `**Title**` line). The header row is sticky: the current title is bold with a
// slide-in animation beside the section counter, and the body viewport caps at
// 5 lines (short content shrinks to its natural height, longer content locks to
// the cap and scrolls) while auto-following the newest line. Scrolling up
// pauses follow-up and reveals a "back to latest" button. When a new section
// arrives, keying the body window on the section count remounts it (scroll
// resets to the top) and re-shows the "latest" affordance.
export const ThinkingSectionsStrip: React.FC<ThinkingSectionsStripProps> = ({ sections }) => {
  const { t } = useI18n();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const currentSection = sections[sections.length - 1];

  // Auto-follow while the user has not scrolled up. Keying the body on the
  // section count already remounts it on a new section, so scroll starts at the
  // top and re-follows on the first render of the new body.
  useLayoutEffect(() => {
    if (!isFollowing) {
      return;
    }
    const body = bodyRef.current;
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [sections, isFollowing]);

  const handleScroll = () => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    // Near the bottom → following; scrolling up more than the threshold pauses it.
    setIsFollowing(body.scrollHeight - body.scrollTop - body.clientHeight <= SCROLL_FOLLOW_THRESHOLD_PX);
  };

  const scrollToLatest = () => {
    const body = bodyRef.current;
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
    setIsFollowing(true);
  };

  return (
    <div
      data-thinking-strip="true"
      data-thinking-mode="sections"
      className="mx-3 mb-2 mt-1 flex flex-col rounded-md border border-[var(--theme-border-secondary)]/50 border-l-[3px] border-l-[var(--theme-text-link)] bg-[var(--theme-bg-input)]/50 p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div
          key={sections.length}
          data-thinking-section-title="true"
          className="thinking-title-in flex min-w-0 items-center"
        >
          <span className="truncate text-xs font-semibold text-[var(--theme-text-secondary)]">
            {currentSection.title ?? currentSection.body.split('\n')[0]}
          </span>
        </div>

        <div className="flex min-w-0 flex-shrink-0 items-center gap-1.5">
          <span
            data-thinking-section-counter="true"
            className="flex-shrink-0 rounded-full bg-[var(--theme-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--theme-text-tertiary)]"
          >
            {interpolate(t('thinkingSectionCounter'), { index: String(sections.length) })}
          </span>
        </div>
      </div>

      <div className="relative mt-1">
        <div
          key={sections.length}
          ref={bodyRef}
          data-thinking-section-body="true"
          onScroll={handleScroll}
          className="flex min-w-0 flex-col overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-xs leading-[1.25rem] text-[var(--theme-text-tertiary)]"
          style={{ maxHeight: `${THINKING_STRIP_CONTENT_HEIGHT_REM}rem` }}
        >
          {currentSection.body}
        </div>

        {!isFollowing && (
          <button
            type="button"
            onClick={scrollToLatest}
            data-thinking-back-to-latest="true"
            className="absolute bottom-1 right-1 z-10 flex items-center gap-1 rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-text-secondary)] shadow-sm transition-colors hover:text-[var(--theme-text-primary)]"
          >
            <ArrowDown size={11} strokeWidth={2.5} />
            {t('thinkingBackToLatest')}
          </button>
        )}
      </div>
    </div>
  );
};
