import { formatTimestamp, parseTimestamp } from './timestamp';
import { parseTagAttributes } from './tagAttributes';
import { transformMarkdownTextSegments } from '@/utils/markdownSegments';

// Valid timestamp segment: mm:ss (where ss is 00-59) or hh:mm:ss (where mm and ss are 00-59)
const TIME_SEGMENT_PATTERN = '(?:\\d{1,2}:[0-5]\\d:[0-5]\\d|\\d{1,3}:[0-5]\\d)';

// Matches mm:ss or hh:mm:ss, with optional range separator (- ~ – — 至 到 to)
const TIMESTAMP_PATTERN = new RegExp(
  `(?<![:\\d])(${TIME_SEGMENT_PATTERN})(?:\\s*(?:[-–—~至到]|to)\\s*(${TIME_SEGMENT_PATTERN}))?(?![:\\d])`,
  'g',
);

// Matches timestamps optionally enclosed in [brackets] or (parentheses), including Chinese full-width （） and 【】
export const TIMESTAMP_BRACKET_PATTERN = new RegExp(
  `(?<![:\\d])(?:([[(（【]))?(${TIME_SEGMENT_PATTERN})(?:\\s*(?:[-–—~至到]|to)\\s*(${TIME_SEGMENT_PATTERN}))?(?![:\\d])(?:([\\])）】]))?`,
  'g',
);

/** Checks whether a matched timestamp pattern appears in non-timestamp contexts like ratios, scores, or AM/PM times. */
export const isFalsePositiveTimestampContext = (preceding: string, succeeding: string): boolean => {
  // 1. Ratio / Aspect Ratio / Scale (e.g., "比例 1:20", "长宽比 16:10", "缩放比例 1:50", "aspect ratio 16:10")
  if (/(?:比例|长宽比|纵横比|比例尺|比值|宽高比|ratio|scale|aspect\s*ratio)\s*(?:为|是|：|:)?\s*$/i.test(preceding)) {
    return true;
  }

  // 2. Scores (e.g., "比分 2:10", "总比分 1:20", "战成 1:10")
  if (/(?:比分|总比分|局分|战成|打成|领先|落后|score|scores)\s*(?:为|是|：|:)?\s*$/i.test(preceding)) {
    return true;
  }

  // 3. Explicit clock times of day (e.g., "上午 10:30", "下午 02:30", "晚上 08:00", "09:30 am", "04:15 pm")
  if (/(?:上午|下午|晚上|早晨|清晨|中午|凌晨)\s*$/i.test(preceding) || /^\s*(?:am|pm)\b/i.test(succeeding)) {
    return true;
  }

  return false;
};

// Matches markdown links so we don't transform timestamps inside existing links [text](url)
const MARKDOWN_LINK_PATTERN = /\[((?:\\\]|[^\]])+)\]\(([^)]+)\)/g;

const TIME_LOCATE_TAG_RE = /<(video|audio)-locate\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1-locate>)/gi;
const INLINE_TIME_LOCATE_RE =
  /(?:(\r?\n[ \t]*)|([ \t]*))<(video|audio)-locate\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\3-locate>)/gi;
const PARTIAL_TIME_LOCATE_RE = /<(?:video|audio)-locate\b[^>]*(?:>[^<]*)?$/i;

// Matches lone timestamps wrapped in inline backticks outside fenced code blocks, e.g. `[00:00-00:09]` or `00:15`
const LONE_TIMESTAMP_BACKTICK_RE =
  /`\s*([[(（【]?\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:[-–—~至到]|to)\s*\d{1,2}:\d{2}(?::\d{2})?)?\b[\])）】]?)\s*`/g;

interface OmittedLocateMeta {
  start: number;
  end: number | null;
  kind?: 'video' | 'audio';
  point?: string;
  box?: string;
  video?: string;
  snippet?: string;
  used?: boolean;
}

const normalizeCoordinates = (value?: string): string | null => {
  if (!value?.trim()) return null;
  const parts = value
    .replace(/[()[\]]/g, '')
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(',') : null;
};

const unwrapLoneTimestampBackticks = (text: string): string => {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => {
      // Even indices are outside fenced code blocks
      if (index % 2 === 0) {
        return part.replace(LONE_TIMESTAMP_BACKTICK_RE, '$1');
      }
      return part;
    })
    .join('');
};

const checkPrecedingTextHasMatchingTimestamp = (precedingText: string, startSec: number): boolean => {
  const clean = precedingText.replace(TIME_LOCATE_TAG_RE, '');
  TIMESTAMP_PATTERN.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TIMESTAMP_PATTERN.exec(clean)) !== null) {
    const s = parseTimestamp(tm[1]);
    const e = tm[2] ? parseTimestamp(tm[2]) : null;
    if (s !== null) {
      if (e !== null) {
        if (startSec >= s - 1 && startSec <= e + 1) return true;
      } else if (Math.abs(s - startSec) <= 2) {
        return true;
      }
    }
  }
  return false;
};

const buildVideoSeekMarkdownLink = (
  attrs: Record<string, string>,
  inner: string,
  tagKind?: 'video' | 'audio',
): string | null => {
  const rawStart = attrs.start ?? attrs.ts ?? attrs.time;
  const startSeconds = parseTimestamp(rawStart);
  if (startSeconds === null) return null;

  const endSeconds = attrs.end ? parseTimestamp(attrs.end) : null;
  const hasValidEnd = endSeconds !== null && endSeconds > startSeconds;

  const query = new URLSearchParams();
  query.set('start', String(startSeconds));
  if (hasValidEnd) query.set('end', String(endSeconds));
  const normalizedPoint = normalizeCoordinates(attrs.point);
  if (normalizedPoint) query.set('point', normalizedPoint);
  const normalizedBox = normalizeCoordinates(attrs.box);
  if (normalizedBox) query.set('box', normalizedBox);

  const isAudio = tagKind === 'audio' || Boolean(attrs.audio);
  if (isAudio) {
    query.set('kind', 'audio');
    if (attrs.audio) {
      query.set('audio', attrs.audio.trim());
      query.set('video', attrs.audio.trim());
    }
  } else if (attrs.video) {
    query.set('video', attrs.video.trim());
  }

  const cleanSnippet = inner.trim();
  if (cleanSnippet) query.set('snippet', cleanSnippet);

  const timeStr = hasValidEnd
    ? `${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds!)}`
    : formatTimestamp(startSeconds);

  let label: string;
  if (!cleanSnippet) {
    label = timeStr;
  } else if (cleanSnippet.includes(':') || cleanSnippet === timeStr) {
    label = cleanSnippet;
  } else {
    label = `${timeStr} · ${cleanSnippet}`;
  }

  const safeLabel = label.replace(/[[\]]/g, '\\$&');
  return `[${safeLabel}](#video-seek?${query.toString()})`;
};

/**
 * Transforms plain timestamps like "00:02-00:04" or "01:05" as well as
 * <video-locate> and <audio-locate> tags in text into internal `#video-seek` markdown links.
 * Avoids transforming inside code blocks and existing markdown links.
 */
export const linkifyTimestamps = (text: string): string => {
  if (!text) {
    return text;
  }

  const unwrappedText = unwrapLoneTimestampBackticks(text);

  return transformMarkdownTextSegments(unwrappedText, (plainText) => {
    let processedText = plainText;
    const omittedLocateMetas: OmittedLocateMeta[] = [];

    const recordOmittedLocate = (attrs: Record<string, string>, inner?: string, tagKind?: 'video' | 'audio') => {
      const rawStart = attrs.start ?? attrs.ts ?? attrs.time;
      const sec = parseTimestamp(rawStart);
      if (sec === null) return;
      const endSec = attrs.end ? parseTimestamp(attrs.end) : null;
      const point = normalizeCoordinates(attrs.point) ?? undefined;
      const box = normalizeCoordinates(attrs.box) ?? undefined;
      const video = attrs.video?.trim() || attrs.audio?.trim() || undefined;
      const snippet = inner?.trim() || undefined;

      if (point || box || tagKind === 'audio' || attrs.audio) {
        omittedLocateMetas.push({
          start: sec,
          end: endSec,
          kind: tagKind ?? (attrs.audio ? 'audio' : undefined),
          point,
          box,
          video,
          snippet,
        });
      }
    };

    if (processedText.includes('<video-locate') || processedText.includes('<audio-locate')) {
      // Split off trailing locate tags that appear as a distinct bottom block separated by blank line
      const trailingMatch = processedText.match(
        /^([\s\S]*?\n)\s*\n\s*((?:<(?:video|audio)-locate\b[^>]*(?:\/>|>[\s\S]*?<\/(?:video|audio)-locate>)\s*)+)$/i,
      );

      const bodyPart = trailingMatch ? trailingMatch[1] : processedText;
      const trailingPart = trailingMatch ? trailingMatch[2] : '';

      // Collect existing start timestamps in the body text (excluding locate tags)
      const bodyWithoutTags = bodyPart.replace(TIME_LOCATE_TAG_RE, '');
      const existingTimestamps = new Set<number>();
      TIMESTAMP_PATTERN.lastIndex = 0;
      let tsMatch: RegExpExecArray | null;
      while ((tsMatch = TIMESTAMP_PATTERN.exec(bodyWithoutTags)) !== null) {
        const sec = parseTimestamp(tsMatch[1]);
        if (sec !== null) existingTimestamps.add(sec);
      }

      // Convert inline locate tags in the body
      let transformedBody = bodyPart.replace(
        INLINE_TIME_LOCATE_RE,
        (
          _full,
          leadingNewline: string | undefined,
          leadingSpace: string | undefined,
          tagKind: string,
          attrStr: string,
          inner: string | undefined,
          offset: number,
          fullStr: string,
        ) => {
          const attrs = parseTagAttributes(attrStr);
          const sec = parseTimestamp(attrs.start ?? attrs.ts ?? attrs.time);
          if (sec === null) return '';

          const normalizedKind = tagKind.toLowerCase() === 'audio' ? 'audio' : 'video';

          if (existingTimestamps.has(sec) || checkPrecedingTextHasMatchingTimestamp(fullStr.slice(0, offset), sec)) {
            // Already represented by an inline timestamp in the preceding sentence or bullet!
            recordOmittedLocate(attrs, inner, normalizedKind);
            return '';
          }

          const link = buildVideoSeekMarkdownLink(attrs, inner || '', normalizedKind);
          if (link) {
            existingTimestamps.add(sec);
            const prefix = leadingNewline || leadingSpace || '';
            return `${prefix}${link}`;
          }
          return '';
        },
      );

      // Clean up excessive blank lines left behind by omitted tags
      transformedBody = transformedBody.replace(/\n\s*(\n\s*)+/g, '\n\n');
      // Clean up whitespace before trailing punctuation left behind by omitted tags
      transformedBody = transformedBody.replace(/[ \t]+([。，、！？；：.!?])/g, '$1');

      // Convert trailing locate tags, omitting those whose timestamp is already in the body
      const transformedTrailingButtons: string[] = [];
      TIME_LOCATE_TAG_RE.lastIndex = 0;
      let trailingMatchItem: RegExpExecArray | null;
      while ((trailingMatchItem = TIME_LOCATE_TAG_RE.exec(trailingPart)) !== null) {
        const normalizedKind = trailingMatchItem[1].toLowerCase() === 'audio' ? 'audio' : 'video';
        const attrs = parseTagAttributes(trailingMatchItem[2]);
        const sec = parseTimestamp(attrs.start ?? attrs.ts ?? attrs.time);
        if (sec !== null && (existingTimestamps.has(sec) || checkPrecedingTextHasMatchingTimestamp(bodyPart, sec))) {
          // Already represented by an inline button in the body text
          recordOmittedLocate(attrs, trailingMatchItem[3], normalizedKind);
          continue;
        }
        const link = buildVideoSeekMarkdownLink(attrs, trailingMatchItem[3] || '', normalizedKind);
        if (link) {
          transformedTrailingButtons.push(link);
          if (sec !== null) existingTimestamps.add(sec);
        }
      }

      if (transformedTrailingButtons.length > 0) {
        const trailingRow = transformedTrailingButtons.join(' ');
        processedText = transformedBody.trimEnd() ? `${transformedBody.trimEnd()}\n\n${trailingRow}` : trailingRow;
      } else {
        processedText = transformedBody;
      }
    }

    // Strip any unterminated mid-stream partial locate tag at the end
    processedText = processedText.replace(PARTIAL_TIME_LOCATE_RE, '');

    if (!processedText.includes(':')) {
      return processedText;
    }

    // Split plain text by existing markdown links
    const parts: { type: 'text' | 'link'; content: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN.exec(processedText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: processedText.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'link', content: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < processedText.length) {
      parts.push({ type: 'text', content: processedText.slice(lastIndex) });
    }

    return parts
      .map((part) => {
        if (part.type === 'link') {
          return part.content;
        }

        TIMESTAMP_BRACKET_PATTERN.lastIndex = 0;
        return part.content.replace(
          TIMESTAMP_BRACKET_PATTERN,
          (
            fullMatch,
            openB: string | undefined,
            rawStart: string,
            rawEnd: string | undefined,
            closeB: string | undefined,
            offset: number,
            fullContent: string,
          ) => {
            const preceding = fullContent.slice(Math.max(0, offset - 20), offset);
            const succeeding = fullContent.slice(offset + fullMatch.length, offset + fullMatch.length + 20);
            if (isFalsePositiveTimestampContext(preceding, succeeding)) {
              return fullMatch;
            }

            const startSeconds = parseTimestamp(rawStart);
            if (startSeconds === null) {
              return fullMatch;
            }

            const endSeconds = rawEnd ? parseTimestamp(rawEnd) : null;
            const hasValidEnd = endSeconds !== null && endSeconds > startSeconds;

            // Look for matching omitted locate metadata to retain visual coordinates/snippets
            let matchedMeta: OmittedLocateMeta | undefined;
            if (hasValidEnd) {
              const textSpan = endSeconds - startSeconds;
              // 1. Exact range match (start and end both match within 3s)
              matchedMeta = omittedLocateMetas.find(
                (m) =>
                  !m.used &&
                  Math.abs(m.start - startSeconds) <= 3 &&
                  (m.end === null || Math.abs(m.end - endSeconds) <= 3),
              );
              // 2. Sub-span match (e.g. text item is 00:10-00:25 and tag is 00:21-00:25):
              // Only for focused item spans (textSpan <= 90s), with matching end and tag within range
              if (!matchedMeta && textSpan <= 90) {
                matchedMeta = omittedLocateMetas.find(
                  (m) =>
                    !m.used &&
                    m.end !== null &&
                    Math.abs(m.end - endSeconds) <= 3 &&
                    m.start >= startSeconds - 1 &&
                    m.start <= endSeconds + 1,
                );
              }
            } else {
              // Single timestamp point
              matchedMeta = omittedLocateMetas.find(
                (m) =>
                  !m.used && Math.abs(m.start - startSeconds) <= 2 && (m.end === null || m.end <= startSeconds + 5),
              );
            }

            if (matchedMeta) {
              matchedMeta.used = true;
            }

            const query = new URLSearchParams();
            query.set('start', String(startSeconds));
            if (hasValidEnd) query.set('end', String(endSeconds));
            if (matchedMeta?.point) query.set('point', matchedMeta.point);
            if (matchedMeta?.box) query.set('box', matchedMeta.box);
            if (matchedMeta?.kind === 'audio') query.set('kind', 'audio');
            if (matchedMeta?.video) query.set('video', matchedMeta.video);
            if (matchedMeta?.snippet) query.set('snippet', matchedMeta.snippet);

            const hasPair =
              (openB === '[' && closeB === ']') ||
              (openB === '(' && closeB === ')') ||
              (openB === '（' && closeB === '）') ||
              (openB === '【' && closeB === '】');
            const coreMatch = hasPair ? fullMatch.slice(1, -1) : fullMatch;
            const prefix = hasPair ? '' : openB || '';
            const suffix = hasPair ? '' : closeB || '';

            return `${prefix}[${coreMatch}](#video-seek?${query.toString()})${suffix}`;
          },
        );
      })
      .join('');
  });
};
