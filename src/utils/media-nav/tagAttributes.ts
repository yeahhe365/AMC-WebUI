const ATTRIBUTE_RE = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

export const parseTagAttributes = (attributeString: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTRIBUTE_RE.lastIndex = 0;
  while ((match = ATTRIBUTE_RE.exec(attributeString)) !== null) {
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[match[1]] = val;
  }
  return attributes;
};
