const INLINE_IMAGE_DATA_URL_PATTERN = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
const INLINE_IMAGE_PLACEHOLDER_PATTERN = /!\[([^\]]*)\]\((内嵌图片-\d+)\)/g;

export const createInlineImagePlaceholder = (index: number) => `内嵌图片-${index}`;

export const extractInlineImagePlaceholders = (content: string, startIndex = 1) => {
  const placeholders = new Map<string, string>();
  let nextIndex = startIndex;

  const editorContent = content.replace(INLINE_IMAGE_DATA_URL_PATTERN, (_match, alt: string, dataUrl: string) => {
    const placeholder = createInlineImagePlaceholder(nextIndex++);
    placeholders.set(placeholder, dataUrl);
    return `![${alt}](${placeholder})`;
  });

  return {
    editorContent,
    placeholders,
    nextIndex,
  };
};

export const resolveInlineImagePlaceholders = (content: string, placeholders: Map<string, string>) =>
  content.replace(INLINE_IMAGE_PLACEHOLDER_PATTERN, (match, alt: string, placeholder: string) => {
    const dataUrl = placeholders.get(placeholder);
    if (!dataUrl) {
      return match;
    }

    return `![${alt}](${dataUrl})`;
  });
