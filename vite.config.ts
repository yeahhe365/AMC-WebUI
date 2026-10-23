import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { getManualChunk, HEAVY_PRELOAD_PATTERNS } from './vite/chunks';
import { createDisabledMermaidDiagramPlugin } from './vite/disabledMermaidDiagramsPlugin';
import { createLocalApiPlugin } from './vite/localApiPlugin';
import { prepareDefaultPyodidePackages } from './vite/pyodideAssets';
import { ECHARTS_COPY_SOURCE, LAMEJS_WORKER_COPY_SOURCE, PDF_WORKER_COPY_SOURCE } from './vite/staticAssets';

export default defineConfig(async ({ mode, command }) => {
  const externalPythonAssets = process.env.PYODIDE_ASSETS_EXTERNAL === 'true';
  const pythonPackageDirectory =
    command === 'build' && !externalPythonAssets ? await prepareDefaultPyodidePackages() : undefined;
  const analyzerPlugin =
    mode === 'analyze'
      ? [
          (await import('rollup-plugin-visualizer')).visualizer({
            filename: 'dist/bundle-stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }),
        ]
      : [];

  return {
    server: {
      port: 5175,
      strictPort: true,
    },
    plugins: [
      createDisabledMermaidDiagramPlugin(),
      createLocalApiPlugin(),
      tailwindcss(),
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src/pwa',
        filename: 'sw.ts',
        injectRegister: false,
        manifest: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,mjs,json,woff,woff2,ttf}'],
          globIgnores: [
            '**/runtime-config.js',
            '**/bundle-stats.html',
            '**/pyodide/**',
            '**/assets/pyodide-runtime-*.js',
            '**/assets/pdfjs-vendor-*.js',
            '**/assets/markdownPdf-*.js',
            '**/assets/markdown-vendor-*.js',
            '**/assets/math-vendor-*',
            '**/assets/genai-vendor-*.js',
            '**/assets/highlight-vendor-*.js',
            '**/assets/pdf-viewer-vendor-*',
            '**/assets/graphviz-vendor-*.js',
            '**/assets/MermaidBlock-*.js',
            '**/assets/*Diagram*.js',
            '**/assets/KaTeX_*',
            '**/assets/html2canvas.esm-*.js',
            // ECharts and individual icon images load on demand. Startup registry
            // and data chunks must stay precached so image LRU churn cannot evict them.
            '**/assets/echarts-vendor-*.js',
            '**/assets/model-icons/**',
            // E2E-only seed page: must not be shipped to (or cached for) real users.
            '**/e2e-seed.html',
            '**/fonts/NotoSansCJKsc-Regular.ttf',
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      viteStaticCopy({
        targets: [
          ...(externalPythonAssets
            ? []
            : [
                { src: 'node_modules/pyodide/*', dest: 'pyodide' },
                ...(pythonPackageDirectory ? [{ src: `${pythonPackageDirectory}/*`, dest: 'pyodide' }] : []),
              ]),
          {
            src: PDF_WORKER_COPY_SOURCE,
            dest: '.',
          },
          {
            src: LAMEJS_WORKER_COPY_SOURCE,
            dest: '.',
          },
          {
            src: ECHARTS_COPY_SOURCE,
            dest: 'vendor',
          },
        ],
      }),
      ...analyzerPlugin,
    ],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
        '@panzoom/panzoom': path.resolve('./node_modules/@panzoom/panzoom/dist/panzoom.es.js'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      modulePreload: {
        resolveDependencies: (_filename: string, deps: string[]) => {
          return deps.filter((dep) => !HEAVY_PRELOAD_PATTERNS.some((pattern) => pattern.test(dep)));
        },
      },
      rollupOptions: {
        output: {
          manualChunks: getManualChunk,
          assetFileNames: (asset: { originalFileNames: string[] }) =>
            asset.originalFileNames.some((name) => name.replace(/\\/g, '/').includes('/model-icons/'))
              ? 'assets/model-icons/[name]-[hash][extname]'
              : 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
