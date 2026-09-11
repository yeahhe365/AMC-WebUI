import { logService } from '@/services/logService';

export interface LineRange {
  start: number;
  end: number;
}

/**
 * Splits text into character index ranges for each line [start, end].
 * `end` excludes the trailing newline (\r?\n), while `start` is the first character.
 */
export function getLineRanges(text: string): LineRange[] {
  const ranges: LineRange[] = [];
  let currentStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      let end = i;
      if (end > currentStart && text[end - 1] === '\r') {
        end--;
      }
      ranges.push({ start: currentStart, end });
      currentStart = i + 1;
    }
  }
  let lastEnd = text.length;
  if (lastEnd > currentStart && text[lastEnd - 1] === '\r') {
    lastEnd--;
  }
  ranges.push({ start: currentStart, end: lastEnd });
  return ranges;
}

/**
 * Locates the DOM text node and offset corresponding to a character index within root.
 */
export function findNodeAndOffset(root: Node, targetIndex: number): { node: Node; offset: number } {
  const doc = root.ownerDocument || document;
  const treeWalker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let textNode = treeWalker.nextNode();
  let lastTextNode: Node | null = null;

  while (textNode) {
    lastTextNode = textNode;
    const length = textNode.textContent?.length ?? 0;
    if (currentOffset + length >= targetIndex) {
      return {
        node: textNode,
        offset: Math.min(Math.max(0, targetIndex - currentOffset), length),
      };
    }
    currentOffset += length;
    textNode = treeWalker.nextNode();
  }

  if (lastTextNode) {
    return {
      node: lastTextNode,
      offset: lastTextNode.textContent?.length ?? 0,
    };
  }

  return { node: root, offset: 0 };
}

/**
 * Selects lines [startLine, endLine] (1-indexed) in the given code container element.
 * Updates the browser's Selection with a Range covering the line content.
 */
export function selectCodeLines(container: HTMLElement, startLine: number, endLine: number): boolean {
  const fullText = container.textContent || '';
  const ranges = getLineRanges(fullText);
  if (ranges.length === 0) return false;

  const minLine = Math.max(1, Math.min(startLine, endLine));
  const maxLine = Math.min(ranges.length, Math.max(startLine, endLine));

  const startIdx = minLine - 1;
  const endIdx = maxLine - 1;

  const startChar = ranges[startIdx].start;
  let endChar = ranges[endIdx].end;

  // If a single empty line is selected, select through the newline if present
  // so the selection is visually apparent in the DOM
  if (minLine === maxLine && startChar === endChar && endChar < fullText.length) {
    endChar += 1;
  }

  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;

  const startPos = findNodeAndOffset(container, startChar);
  const endPos = findNodeAndOffset(container, endChar);

  try {
    const range = doc.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    const selection = win.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  } catch (selectionError) {
    logService.warn('Failed to select code lines', { selectionError });
  }

  return false;
}
