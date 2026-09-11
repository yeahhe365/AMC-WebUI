export const LARGE_FILE_PREVIEW_LENGTH_THRESHOLD = 120000;

const LARGE_MARKDOWN_LINE_THRESHOLD = 2500;
const LARGE_MARKDOWN_FENCE_THRESHOLD = 300;

export const shouldDeferMarkdownPreview = (content: string): boolean => {
  if (!content) return false;

  const lineCount = (content.match(/\n/g)?.length ?? 0) + 1;
  const fenceCount = content.match(/```/g)?.length ?? 0;

  return (
    content.length > LARGE_FILE_PREVIEW_LENGTH_THRESHOLD ||
    lineCount > LARGE_MARKDOWN_LINE_THRESHOLD ||
    fenceCount >= LARGE_MARKDOWN_FENCE_THRESHOLD
  );
};
