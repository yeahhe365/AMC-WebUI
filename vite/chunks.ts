const isPackagePath = (id: string, packages: string[]) => {
  return packages.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`));
};

const MARKDOWN_PACKAGES = [
  'react-markdown',
  'remark-gfm',
  'remark-breaks',
  'rehype-raw',
  'rehype-sanitize',
  'unified',
  'remark-parse',
  'remark-rehype',
  'unist-util-visit',
  'unist-util-visit-parents',
  'unist-util-is',
  'micromark',
  'mdast-util-from-markdown',
  'mdast-util-to-hast',
  'mdast-util-to-string',
  'hast-util-to-html',
  'hast-util-from-html-isomorphic',
  'hast-util-to-text',
  'property-information',
  'vfile',
];

const MATH_PACKAGES = ['remark-math', 'rehype-katex', 'katex'];
const HIGHLIGHT_PACKAGES = ['rehype-highlight', 'highlight.js', 'lowlight'];
const REACT_PACKAGES = ['react', 'react-dom', 'scheduler'];
const PDF_VIEWER_PACKAGES = ['react-pdf'];
const PDFJS_PACKAGES = ['pdfjs-dist'];
const GRAPHVIZ_PACKAGES = ['@viz-js/viz'];
const VITE_PRELOAD_HELPER_ID = 'vite/preload-helper';

export const HEAVY_PRELOAD_PATTERNS = [
  /^assets\/pyodide-runtime-.*\.js$/,
  /^assets\/pyodideService-.*\.js$/,
  /^assets\/pdfjs-vendor-.*\.js$/,
  /^assets\/pdf-viewer-vendor-.*\.(?:js|css)$/,
  /^assets\/markdown-vendor-.*\.js$/,
  /^assets\/math-vendor-.*\.(?:js|css)$/,
  /^assets\/highlight-vendor-.*\.js$/,
  /^assets\/genai-vendor-.*\.js$/,
  /^assets\/graphviz-vendor-.*\.js$/,
  /^assets\/html2canvas\.esm-.*\.js$/,
];

const isSourcePath = (id: string, sourcePath: string) =>
  id.endsWith(sourcePath) || id.includes(sourcePath.replace(/\//g, '\\'));

export const getManualChunk = (id: string) => {
  if (id.includes(VITE_PRELOAD_HELPER_ID)) {
    return 'vite-preload-helper';
  }

  if (isSourcePath(id, '/src/constants/settingsModelOptions.ts')) {
    return 'settings-options';
  }

  if (!id.includes('node_modules')) return undefined;

  if (isPackagePath(id, REACT_PACKAGES)) {
    return 'react-vendor';
  }

  if (isPackagePath(id, ['@google/genai'])) {
    return 'genai-vendor';
  }

  if (isPackagePath(id, HIGHLIGHT_PACKAGES)) {
    return 'highlight-vendor';
  }

  if (isPackagePath(id, MATH_PACKAGES)) {
    return 'math-vendor';
  }

  if (isPackagePath(id, MARKDOWN_PACKAGES)) {
    return 'markdown-vendor';
  }

  if (isPackagePath(id, ['lucide-react'])) {
    return 'icons-vendor';
  }

  if (isPackagePath(id, ['zustand'])) {
    return 'state-vendor';
  }

  if (isPackagePath(id, GRAPHVIZ_PACKAGES)) {
    return 'graphviz-vendor';
  }

  if (isPackagePath(id, ['@formkit/auto-animate'])) {
    return 'ui-vendor';
  }

  if (isPackagePath(id, ['react-virtuoso'])) {
    return 'ui-vendor';
  }

  if (isPackagePath(id, PDFJS_PACKAGES)) {
    return 'pdfjs-vendor';
  }

  if (isPackagePath(id, PDF_VIEWER_PACKAGES)) {
    return 'pdf-viewer-vendor';
  }

  return undefined;
};
