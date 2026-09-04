import React from 'react';
import { THINKING_STRIP_CONTENT_HEIGHT_REM } from './thinkingStripMetrics';
import type { ThinkingSection } from '@/utils/chat/parsing';
import { ThinkingSectionsStrip } from './ThinkingSectionsStrip';

interface ThinkingStripProps {
  /** Plain-text tail of the active thought stream (heading markers already stripped). */
  thoughtsTail: string;
  /** Sectioned structure for Gemini-style streams; null/flat falls back to the tail window. */
  sections?: ThinkingSection[] | null;
  /** Provenance of the thinking text. Third-party streams are forced into the
   *  flat tail window (no sectioned rendering), so markdown headers in their
   *  reasoning can never masquerade as Gemini-style sections. */
  thinkingSource?: 'gemini' | 'third-party';
}

/**
 * Bottom-anchored preview of the active thinking stream, capped at 5 lines.
 *
 * The viewport's max height is 5 text lines; short content shrinks to its
 * natural height while longer content locks to the cap and scrolls.
 * `flex-col-reverse` pins the visible window to the newest line as content
 * grows, with no scroll math. Gemini flat streams keep `overflow-y-auto` so
 * users can scroll up to review earlier lines; third-party streams lock the
 * window with `overflow-hidden`, always showing the latest lines with no manual
 * scrolling. There is no title row: third-party providers stream flat reasoning
 * text with no headings, so the title slot previously rendered a meaningless
 * fallback label.
 */
export const ThinkingStrip: React.FC<ThinkingStripProps> = ({ thoughtsTail, sections, thinkingSource }) => {
  const isThirdParty = thinkingSource === 'third-party';
  if (!isThirdParty && sections && sections.length > 0) {
    return <ThinkingSectionsStrip sections={sections} />;
  }

  if (!thoughtsTail) {
    return null;
  }

  return (
    <div
      data-thinking-strip="true"
      data-thinking-mode="flat"
      className="mx-3 mb-2 mt-1 flex rounded-md border border-[var(--theme-border-secondary)]/50 border-l-[3px] border-l-[var(--theme-text-link)] bg-[var(--theme-bg-input)]/50 p-2"
    >
      <div
        data-thinking-strip-viewport="true"
        className={`flex min-w-0 flex-1 flex-col-reverse ${
          isThirdParty ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'
        }`}
        style={{ maxHeight: `${THINKING_STRIP_CONTENT_HEIGHT_REM}rem` }}
      >
        <span className="whitespace-pre-wrap break-words text-xs leading-[1.25rem] text-[var(--theme-text-tertiary)]">
          {thoughtsTail}
        </span>
      </div>
    </div>
  );
};
