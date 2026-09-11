import { getGroundingChunkSource, type GroundingChunkLike, type GroundingSource } from '@/utils/groundingMetadata';

interface GroundingSupport {
  segment?: {
    endIndex?: number;
  };
  groundingChunkIndices?: number[];
}

interface GroundingMetadataLike {
  groundingSupports?: GroundingSupport[];
  groundingChunks?: GroundingChunkLike[];
  citations?: GroundingSource[];
}

export const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const formatUrlPath = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return url;
  }
};

export const getFavicon = (url: string, title?: string) => {
  try {
    // If the title looks like a domain (has dot, no spaces), use it.
    // This helps when the URI is a proxy/redirect (e.g. Vertex AI Search).
    if (title && title.includes('.') && !title.trim().includes(' ')) {
      return `https://www.google.com/s2/favicons?domain=${title.trim()}&sz=64`;
    }
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return null;
  }
};

const isGroundingMetadataLike = (value: unknown): value is GroundingMetadataLike =>
  typeof value === 'object' && value !== null;

export const insertCitations = (text: string, metadata: unknown): string => {
  if (!isGroundingMetadataLike(metadata) || !metadata.groundingSupports) {
    return text;
  }

  // Do not sanitize text here.
  // The indices in metadata.groundingSupports are byte offsets based on the RAW text returned by the API.
  // Combine grounding chunks and citations into a single indexed array.
  const sources = [
    ...(metadata.groundingChunks?.map((chunk) => getGroundingChunkSource(chunk)) || []),
    ...(metadata.citations || []),
  ].filter(Boolean);

  if (sources.length === 0) return text;

  const encodedText = new TextEncoder().encode(text);
  const toCharIndex = (byteIndex: number) => {
    // Decode bytes up to byteIndex to find the corresponding character index in the JS string.
    return new TextDecoder().decode(encodedText.slice(0, byteIndex)).length;
  };

  const sortedSupports = [...metadata.groundingSupports].sort(
    (a, b) => (b.segment?.endIndex || 0) - (a.segment?.endIndex || 0),
  );

  let contentWithCitations = text;
  for (const support of sortedSupports) {
    const byteEndIndex = support.segment?.endIndex;
    if (typeof byteEndIndex !== 'number') continue;

    const charEndIndex = toCharIndex(byteEndIndex);
    const chunkIndices = support.groundingChunkIndices || [];

    const citationLinksHtml = chunkIndices
      .map((chunkIndex: number) => {
        if (chunkIndex >= sources.length) return '';
        const source = sources[chunkIndex];
        if (!source || !source.uri) return '';

        const titleAttr = `Source: ${source.title || source.uri}`.replace(/"/g, '&quot;');
        const citationLabel = `[${chunkIndex + 1}]`;
        return `<a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="citation-ref" title="${titleAttr}">${citationLabel}</a>`;
      })
      .join('');

    if (citationLinksHtml) {
      contentWithCitations =
        contentWithCitations.slice(0, charEndIndex) + citationLinksHtml + contentWithCitations.slice(charEndIndex);
    }
  }
  return contentWithCitations;
};

export const extractSources = (metadata: unknown) => {
  if (!isGroundingMetadataLike(metadata)) return [];

  const uniqueSources = new Map<string, { uri: string; title: string }>();

  const addSource = (uri: string, title?: string) => {
    if (uri && !uniqueSources.has(uri)) {
      uniqueSources.set(uri, { uri, title: title || new URL(uri).hostname });
    }
  };

  if (metadata.groundingChunks && Array.isArray(metadata.groundingChunks)) {
    metadata.groundingChunks.forEach((chunk) => {
      const source = getGroundingChunkSource(chunk);
      if (source?.uri) {
        addSource(source.uri, source.title);
      }
    });
  }

  if (metadata.citations && Array.isArray(metadata.citations)) {
    metadata.citations.forEach((citation) => {
      if (citation?.uri) {
        addSource(citation.uri, citation.title);
      }
    });
  }

  return Array.from(uniqueSources.values());
};
