interface MarkdownDocumentStats {
  characters: number;
  lines: number;
  words: number;
}

export const getMarkdownDocumentStats = (content: string): MarkdownDocumentStats => {
  if (!content) {
    return { characters: 0, lines: 0, words: 0 };
  }

  const lines = (content.match(/\r\n|\r|\n/g)?.length ?? 0) + 1;
  const cjkMatches = content.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  const nonCjkText = content.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').trim();
  const nonCjkWords = nonCjkText ? nonCjkText.split(/\s+/).filter(Boolean).length : 0;

  return {
    characters: content.length,
    lines,
    words: cjkCount + nonCjkWords,
  };
};
