const YOUTUBE_VIDEO_ID_REGEX = /^[\w-]{11}$/;

/**
 * Extracts the 11-character YouTube video ID from various YouTube URL formats
 * (standard watch URLs, youtu.be short links, shorts, embeds, mobile URLs,
 * links without protocol, or URLs with extra query/tracking parameters).
 */
export const extractYoutubeVideoId = (input?: string | null): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlWithScheme = /^[a-zA-Z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(urlWithScheme);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Case 1: youtu.be/<id>
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
    }

    // Case 2: youtube.com, m.youtube.com, music.youtube.com, etc.
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      // /watch?v=<id>
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        if (v && YOUTUBE_VIDEO_ID_REGEX.test(v)) {
          return v;
        }
        return null;
      }

      // /shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
      const match = parsed.pathname.match(/^\/(?:shorts|embed|v|live)\/([\w-]{11})(?:\/|$)/);
      if (match) {
        return match[1];
      }
      return null;
    }
  } catch {
    // If URL parsing fails, fall through to fallback regex
  }

  // Fallback regex in case of non-standard URL strings
  const fallbackMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/|live\/))([\w-]{11})(?![\w-])/,
  );
  return fallbackMatch ? fallbackMatch[1] : null;
};

/**
 * Normalizes any valid YouTube URL or video ID reference into the canonical
 * format required by Google Gemini API: `https://www.youtube.com/watch?v={videoId}`.
 * Returns `null` if the input is not a valid YouTube video reference.
 */
export const normalizeYoutubeUrl = (input?: string | null): string | null => {
  const videoId = extractYoutubeVideoId(input);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
};

/**
 * Converts a valid YouTube URL or video ID reference into an embed URL:
 * `https://www.youtube.com/embed/{videoId}`.
 * Returns `null` if the input is not a valid YouTube video reference.
 */
export const toYoutubeEmbedUrl = (input?: string | null): string | null => {
  const videoId = extractYoutubeVideoId(input);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
};

/**
 * Checks whether an input string represents a valid YouTube URL.
 */
export const isYoutubeUrl = (input?: string | null): boolean => {
  return extractYoutubeVideoId(input) !== null;
};
