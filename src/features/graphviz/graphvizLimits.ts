/**
 * Single source of truth for the declarative graphviz limits advertised in the
 * Live Artifacts prompts (liveArtifacts.ts) and enforced at runtime (vizRuntime.ts).
 *
 * Both the node and edge counters are heuristic UPPER-BOUND guards, not a DOT
 * parser: they must never UNDER-count (a too-big graph slipping past the guard),
 * while occasional OVER-counting is acceptable (an edge-case graph refused).
 * Keep this bias in mind when touching the regexes.
 */

export const DOT_MAX_CHARS = 16_000;
export const DOT_MAX_NODES = 40;
export const DOT_MAX_EDGES = 80; // was 200 before the alignment with the prompt

const DOT_RESERVED_WORDS = new Set(['graph', 'digraph', 'subgraph', 'node', 'edge', 'strict']);

/**
 * Replaces comment contents and string/attribute contents with same-length
 * spaces so they cannot contribute node/edge matches. Mirrors the comment state
 * machine from isProbablyCompleteDot in graphvizRendererScript.ts (kept in sync
 * by hand; no shared import between the injected string and this module).
 */
const stripDotCommentsAndStrings = (dot: string): string => {
  const chars = dot.split('');
  let inLineComment = false;
  let inBlockComment = false;
  let inDoubleQuote = false;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : '';

    if (inLineComment) {
      chars[i] = ' ';
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      chars[i] = ' ';
      if (ch === '*' && next === '/') {
        chars[i + 1] = ' ';
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (ch === '\\') {
      chars[i] = ' ';
      i += 1;
      if (i < chars.length) chars[i] = ' ';
      continue;
    }
    if (inDoubleQuote) {
      chars[i] = ' ';
      if (ch === '"') inDoubleQuote = false;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      // Keep the quote character so string boundaries survive; blank only the
      // content. This stops an id inside a label from looking like a standalone
      // node declaration after blanking.
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      continue;
    }
    if (ch === '#') {
      inLineComment = true;
      chars[i] = ' ';
      continue;
    }
  }

  return chars.join('');
};

export const countDotEdges = (dot: string): number => {
  const cleaned = stripDotCommentsAndStrings(dot);
  const matches = cleaned.match(/->|--/g);
  return matches ? matches.length : 0;
};

export const countDotNodes = (dot: string): number => {
  let cleaned = stripDotCommentsAndStrings(dot);
  // A subgraph's name (`subgraph cluster0 {`) is a cluster id, not a node.
  cleaned = cleaned.replace(/\bsubgraph\s+[A-Za-z_]\w*/g, ' ');
  // Attribute assignments (key=value, incl. label="...", rank=same, shape=box)
  // are not node declarations: blank the whole assignment so neither the key
  // nor the value is counted as a node. The value terminates at `;` `,` `[`
  // `]` `}` or newline — never swallow the next declaration.
  cleaned = cleaned.replace(/\b[A-Za-z_]\w*\s*=\s*[^;,[\]}\n]*/g, ' ');
  // Edge operators and statement terminators are not part of an id: replace
  // them with spaces so `A->C }` and `A; B` yield cleanly separated tokens.
  cleaned = cleaned.replace(/->|--|;/g, ' ');

  const ids = new Set<string>();
  const tokenPattern = /[A-Za-z_][\w.-]*|\d+/g;
  for (const m of cleaned.matchAll(tokenPattern)) {
    const id = m[0];
    if (!DOT_RESERVED_WORDS.has(id)) {
      ids.add(id);
    }
  }
  return ids.size;
};
