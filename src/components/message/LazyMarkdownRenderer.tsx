import React, { useEffect, useState, Suspense } from 'react';
import type { MarkdownRendererProps } from './BaseMarkdownRenderer';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { hasLikelyTexMathMarkdown } from '@/utils/markdownMathConfig';

const LazyBasicMarkdownRenderer = lazyNamedComponent(() => import('./BasicMarkdownRenderer'), 'BasicMarkdownRenderer');
const LazyMathMarkdownRenderer = lazyNamedComponent(() => import('./MathMarkdownRenderer'), 'MathMarkdownRenderer');

interface LazyMarkdownRendererProps extends MarkdownRendererProps {
  fallbackMode?: 'raw' | 'none';
}

/**
 * Chooses between the basic and math-enabled markdown renderers.
 *
 * Math is only engaged when the message actually looks like it contains TeX
 * (see hasLikelyTexMathMarkdown). To avoid the basic→math flip remounting the
 * whole tree mid-stream — and downloading the math chunk at the worst moment —
 * the switch only happens once the message has finished loading:
 *
 * - While streaming (isLoading), always render with the basic renderer. When a
 *   math candidate appears, preload the math chunk in the background so the
 *   flip at stream-end is instant (no chunk download stall).
 * - Once loading finishes, flip to the math renderer if a candidate exists.
 *   That single remount is the same one the message already pays at completion
 *   for syntax highlighting, so no extra flicker is introduced.
 */
export const LazyMarkdownRenderer: React.FC<LazyMarkdownRendererProps> = ({
  content,
  isLoading,
  fallbackMode = 'raw',
  ...props
}) => {
  const [mathChunkWarmed, setMathChunkWarmed] = useState(false);

  // While streaming, preload the math chunk as soon as a likely math candidate
  // appears so the end-of-stream flip does not stall on a download.
  useEffect(() => {
    if (!mathChunkWarmed && hasLikelyTexMathMarkdown(content)) {
      setMathChunkWarmed(true);
      void import('./MathMarkdownRenderer').catch(() => {
        // Ignore: the chunk will be retried on the next math candidate.
      });
    }
  }, [content, mathChunkWarmed]);

  // Streaming keeps the basic renderer (no mid-stream remount). The flip to the
  // math renderer happens once, after the message has finished loading, and only
  // if a likely math candidate was seen.
  const shouldLoadMathRenderer = !isLoading && hasLikelyTexMathMarkdown(content);

  const fallback =
    fallbackMode === 'raw' ? (
      <div className="whitespace-pre-wrap break-words text-[var(--theme-text-secondary)]">{content}</div>
    ) : null;

  if (!shouldLoadMathRenderer) {
    return (
      <Suspense fallback={fallback}>
        <LazyBasicMarkdownRenderer {...props} content={content} isLoading={isLoading} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={fallback}>
      <LazyMathMarkdownRenderer content={content} {...props} isLoading={isLoading} />
    </Suspense>
  );
};
