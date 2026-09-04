import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Nodes, Root } from 'hast';
import type { PluggableList } from 'unified';
import { HIGHLIGHT_ALIASES, HIGHLIGHT_LANGUAGES, HIGHLIGHT_PLAINTEXT } from './highlightConfig';
import { remarkWrappedStrong } from './remarkWrappedStrong';

const ALLOWED_STYLE_PROPERTIES = new Set([
  'align-items',
  'align-content',
  'background',
  'background-color',
  'border',
  'border-collapse',
  'border-color',
  'border-radius',
  'border-spacing',
  'border-style',
  'border-width',
  'bottom',
  'box-shadow',
  'box-sizing',
  'caption-side',
  'color',
  'cursor',
  'display',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'grid-auto-columns',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-column',
  'grid-row',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'height',
  'justify-content',
  'justify-items',
  'left',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'aspect-ratio',
  'object-fit',
  'opacity',
  'overflow',
  'overflow-x',
  'overflow-y',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'row-gap',
  'text-align',
  'text-decoration',
  'text-transform',
  'top',
  'transform',
  'transition',
  'vertical-align',
  'white-space',
  'width',
  'word-break',
]);

const BLOCKED_STYLE_VALUE_PATTERN =
  /(?:url\s*\(|expression\s*\(|behavior\s*:|@import|javascript:|vbscript:|data:|!important)/i;
const ALLOWED_POSITION_VALUES = new Set(['static', 'relative', 'absolute']);

const splitStyleDeclarations = (style: string): string[] => {
  const declarations: string[] = [];
  let current = '';
  let parenDepth = 0;
  let quote: '"' | "'" | null = null;

  for (const char of style) {
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
    } else if (char === ')' && parenDepth > 0) {
      parenDepth -= 1;
    }

    if (char === ';' && parenDepth === 0) {
      declarations.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    declarations.push(current);
  }

  return declarations;
};

const isSafeStyleDeclaration = (property: string, value: string): boolean => {
  if (!ALLOWED_STYLE_PROPERTIES.has(property) || BLOCKED_STYLE_VALUE_PATTERN.test(value)) {
    return false;
  }

  if (property === 'position') {
    return ALLOWED_POSITION_VALUES.has(value.trim().toLowerCase());
  }

  return true;
};

const sanitizeInlineStyle = (style: string): string | undefined => {
  const declarations = splitStyleDeclarations(style).flatMap((declaration) => {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex === -1) {
      return [];
    }

    const property = declaration.slice(0, colonIndex).trim().toLowerCase();
    const value = declaration.slice(colonIndex + 1).trim();

    if (!property || !value || !isSafeStyleDeclaration(property, value)) {
      return [];
    }

    return [`${property}:${value}`];
  });

  return declarations.length > 0 ? declarations.join(';') : undefined;
};

const sanitizeStyleNodes = (node: Nodes | Root): void => {
  if (node.type === 'element') {
    const rawStyle = node.properties.style;

    if (typeof rawStyle === 'string') {
      const sanitizedStyle = sanitizeInlineStyle(rawStyle);
      if (sanitizedStyle) {
        node.properties.style = sanitizedStyle;
      } else {
        delete node.properties.style;
      }
    } else if (rawStyle !== undefined) {
      delete node.properties.style;
    }
  }

  if ('children' in node) {
    node.children.forEach(sanitizeStyleNodes);
  }
};

const rehypeSafeInlineStyles = () => {
  return (tree: Root) => {
    sanitizeStyleNodes(tree);
  };
};

export const getBaseRehypePlugins = (
  allowHtml: boolean,
  options: { syntaxHighlighting?: boolean } = {},
): PluggableList => {
  const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames || []),
      'div',
      'span',
      'pre',
      'code',
      'section',
      'header',
      'footer',
      'nav',
      'article',
      'aside',
      'figure',
      'figcaption',
      'button',
      'label',
      'input',
      'select',
      'option',
      'textarea',
      'progress',
      'meter',
      'svg',
      'path',
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'text',
      'defs',
      'symbol',
      'use',
      'g',
      'table',
      'caption',
      'colgroup',
      'col',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'details',
      'summary',
    ],
    attributes: {
      ...defaultSchema.attributes,
      '*': ['ariaHidden', 'ariaLabel', 'role', 'title', 'style'],
      code: [...(defaultSchema.attributes?.code || []), 'inline'],
      // Server code execution blocks mark their <pre> so the renderer can wrap
      // them in the code-execution card (CodeExecutionBlock).
      pre: [...(defaultSchema.attributes?.pre || []), ['className', 'code-exec-code']],
      span: [...(defaultSchema.attributes?.span || [])],
      div: [...(defaultSchema.attributes?.div || []), 'align', ['className', 'tool-result', /^outcome-[a-z0-9_-]+$/]],
      p: [...(defaultSchema.attributes?.p || []), 'align'],
      img: [...(defaultSchema.attributes?.img || []), 'align', 'width', 'height', 'src'],
      button: ['type', 'disabled', 'name', 'value'],
      label: ['for', 'htmlFor'],
      input: ['type', 'checked', 'disabled', 'value', 'name', 'min', 'max', 'step', 'placeholder'],
      select: ['disabled', 'name', 'value'],
      option: ['value', 'selected', 'disabled'],
      textarea: ['disabled', 'placeholder', 'rows', 'cols', 'name'],
      progress: ['value', 'max'],
      meter: ['value', 'min', 'max', 'low', 'high', 'optimum'],
      caption: ['align'],
      colgroup: ['span', 'width'],
      col: ['span', 'width'],
      td: ['align', 'colSpan', 'rowSpan', 'valign'],
      th: ['align', 'colSpan', 'rowSpan', 'valign'],
      svg: ['width', 'height', 'viewBox', 'preserveAspectRatio', 'xmlns', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      path: ['d', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'opacity'],
      polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      polygon: ['points', 'fill', 'stroke', 'strokeWidth', 'opacity'],
      text: [
        'x',
        'y',
        'dx',
        'dy',
        'textAnchor',
        'dominantBaseline',
        'fill',
        'stroke',
        'fontSize',
        'fontWeight',
        'opacity',
      ],
      defs: [],
      symbol: ['viewBox'],
      use: ['href'],
      g: ['fill', 'stroke', 'strokeWidth', 'opacity'],
      details: ['open'],
      summary: [],
    },
    protocols: {
      ...defaultSchema.protocols,
      src: ['http', 'https', 'data', 'blob'],
    },
    clobberPrefix: 'user-content-',
  };

  const plugins: PluggableList = [];

  if (allowHtml) {
    plugins.push(rehypeRaw);
    plugins.push(rehypeSafeInlineStyles);
  }

  plugins.push([rehypeSanitize, sanitizeSchema] as const);

  if (options.syntaxHighlighting ?? true) {
    plugins.push([
      rehypeHighlight,
      {
        ignoreMissing: true,
        detect: true,
        languages: HIGHLIGHT_LANGUAGES,
        aliases: HIGHLIGHT_ALIASES,
        plainText: HIGHLIGHT_PLAINTEXT,
        subset: Object.keys(HIGHLIGHT_LANGUAGES),
      },
    ] as const);
  }

  return plugins;
};

export const baseRemarkPlugins: PluggableList = [remarkGfm, remarkBreaks, remarkWrappedStrong];
