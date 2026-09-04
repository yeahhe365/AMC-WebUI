import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { projectRoot } from './projectFiles';

const viteConfigPath = path.join(projectRoot, 'vite.config.ts');
const viteChunksPath = path.join(projectRoot, 'vite/chunks.ts');
const viteStaticAssetsPath = path.join(projectRoot, 'vite/staticAssets.ts');
const lazyMarkdownRendererPath = path.join(projectRoot, 'src/components/message/LazyMarkdownRenderer.tsx');
const mathMarkdownRendererPath = path.join(projectRoot, 'src/components/message/MathMarkdownRenderer.tsx');
const basicMarkdownRendererPath = path.join(projectRoot, 'src/components/message/BasicMarkdownRenderer.tsx');
const i18nContextPath = path.join(projectRoot, 'src/contexts/I18nContext.tsx');
const i18nTranslationsPath = path.join(projectRoot, 'src/i18n/translations.ts');
const i18nFeatureTranslationsPath = path.join(projectRoot, 'src/i18n/featureTranslations.ts');
const indexEntryPath = path.join(projectRoot, 'src/index.tsx');
const useChatPath = path.join(projectRoot, 'src/hooks/chat/useChat.ts');
const standardChatStrategyPath = path.join(projectRoot, 'src/features/message-sender/standardChatStrategy.ts');
const standardChatApiCallPath = path.join(projectRoot, 'src/features/message-sender/standardChatApiCall.ts');
const usePyodidePath = path.join(projectRoot, 'src/features/local-python/usePyodide.ts');
const pyodideLoaderPath = path.join(projectRoot, 'src/features/local-python/loadPyodideService.ts');
const standardClientFunctionsPath = path.join(projectRoot, 'src/features/standard-chat/standardClientFunctions.ts');
const liveClientFunctionsPath = path.join(projectRoot, 'src/utils/live-api/liveClientFunctions.ts');
const ttsVoiceSelectorPath = path.join(projectRoot, 'src/components/chat/input/toolbar/TtsVoiceSelector.tsx');
const markdownPdfExportPath = path.join(projectRoot, 'src/utils/export/markdownPdf.ts');
const markdownPdfFontsPath = path.join(projectRoot, 'src/utils/export/markdownPdfFonts.ts');
const markdownPdfImagesPath = path.join(projectRoot, 'src/utils/export/markdownPdfImages.ts');
const markdownPdfRendererPath = path.join(projectRoot, 'src/utils/export/markdownPdfRenderer.ts');
const chatInputModalsPath = path.join(projectRoot, 'src/components/chat/input/ChatInputCoreModals.tsx');
const chatInputFileModalsPath = path.join(projectRoot, 'src/components/chat/input/ChatInputFileModals.tsx');
const useCreateFileEditorPath = path.join(projectRoot, 'src/components/modals/create-file/useCreateFileEditor.ts');
const clipboardDataPath = path.join(projectRoot, 'src/utils/chat-input/clipboardData.ts');
const useChatInputClipboardPath = path.join(projectRoot, 'src/hooks/chat-input/useChatInputClipboard.ts');
const useSelectionPositionPath = path.join(projectRoot, 'src/hooks/text-selection/useSelectionPosition.ts');
const tableBlockPath = path.join(projectRoot, 'src/components/message/blocks/TableBlock.tsx');
const pdfRuntimePath = path.join(projectRoot, 'src/utils/pdfRuntime.ts');
const pdfFileThumbnailPath = path.join(projectRoot, 'src/components/chat/input/files/PdfFileThumbnail.tsx');
const usePdfViewerPath = path.join(projectRoot, 'src/hooks/ui/usePdfViewer.ts');
const importContextLoadersPath = path.join(projectRoot, 'src/utils/import-context/loaders.ts');
const useFileDragDropPath = path.join(projectRoot, 'src/hooks/file-upload/useFileDragDrop.ts');
const useFilePreProcessingPath = path.join(projectRoot, 'src/hooks/file-upload/useFilePreProcessing.ts');
const useFilePreProcessingEffectsPath = path.join(projectRoot, 'src/hooks/chat-input/useFilePreProcessingEffects.ts');
const audioApiPath = path.join(projectRoot, 'src/services/api/generation/audioApi.ts');
const localPythonClientFunctionToolPath = path.join(projectRoot, 'src/features/local-python/clientFunctionTool.ts');
const assistantAvatarPath = path.join(projectRoot, 'public/assets/assistant-avatar.png');
const interfaceTogglesPath = path.join(projectRoot, 'src/components/settings/sections/appearance/InterfaceToggles.tsx');

const expectTypeImportFrom = (source: string, moduleName: string, importedNames: string[]) => {
  const escapedModuleName = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const typeImportPattern = new RegExp(`import\\s+type\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escapedModuleName}['"]`);
  const match = source.match(typeImportPattern);
  expect(match).not.toBeNull();

  const importedTypeNames =
    match?.[1]
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter(Boolean) ?? [];

  expect(importedTypeNames).toEqual(expect.arrayContaining(importedNames));
};

describe('vite.config runtime ownership', () => {
  it('does not externalize core runtime libraries needed in the Vite bundle', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');

    expect(config).not.toMatch(/external\s*:\s*\[/);
  });

  it('splits heavy runtime libraries into dedicated lazy chunks', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');
    const chunks = fs.readFileSync(viteChunksPath, 'utf8');

    expect(chunks).toContain("'pdfjs-vendor'");
    expect(chunks).toContain("'highlight-vendor'");
    expect(chunks).toContain("'graphviz-vendor'");
    expect(chunks).toContain("'vite-preload-helper'");
    expect(chunks).toContain('vite/preload-helper');
    expect(chunks).not.toContain("'html-export-vendor'");
    expect(chunks).not.toContain("'mermaid-vendor'");
    expect(chunks).toMatch(/highlight\.js/);
    expect(chunks).toMatch(/pdfjs-dist/);
    expect(config).toMatch(/chunkSizeWarningLimit:\s*1500/);
  });

  it("copies the PDF worker from react-pdf's pinned pdfjs-dist version", () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');
    const staticAssets = fs.readFileSync(viteStaticAssetsPath, 'utf8');

    expect(staticAssets).toContain("const PDF_WORKER_COPY_SOURCE = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'");
    expect(config).toContain('src: PDF_WORKER_COPY_SOURCE');
    expect(staticAssets).not.toContain(
      "const PDF_WORKER_COPY_SOURCE = 'node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'",
    );
  });

  it('centralizes PDF worker runtime configuration', () => {
    const pdfRuntimeSource = fs.readFileSync(pdfRuntimePath, 'utf8');
    const thumbnailSource = fs.readFileSync(pdfFileThumbnailPath, 'utf8');
    const usePdfViewerSource = fs.readFileSync(usePdfViewerPath, 'utf8');

    expect(pdfRuntimeSource).toContain("import { pdfjs } from 'react-pdf'");
    expect(pdfRuntimeSource).toContain('configurePdfWorker(pdfjs)');
    expect(pdfRuntimeSource).toContain('pdfWorkerConfigured');
    expect(thumbnailSource).toContain("from '@/utils/pdfRuntime'");
    expect(usePdfViewerSource).toContain("from '@/utils/pdfRuntime'");
    expect(thumbnailSource).not.toContain('pdfjs');
    expect(usePdfViewerSource).not.toContain('pdfjs');
  });

  it('copies the lamejs encoder asset used by the audio compression worker', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');
    const staticAssets = fs.readFileSync(viteStaticAssetsPath, 'utf8');
    const packageJson = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');

    expect(packageJson).toContain('"lamejs"');
    expect(staticAssets).toContain("const LAMEJS_WORKER_COPY_SOURCE = 'node_modules/lamejs/lame.min.js'");
    expect(config).toContain('src: LAMEJS_WORKER_COPY_SOURCE');
  });

  it('keeps system-audio recording out of global settings', () => {
    const source = fs.readFileSync(interfaceTogglesPath, 'utf8');

    expect(source).not.toContain('isSystemAudioRecordingEnabled');
    expect(source).not.toContain('settingsSystemAudioRecordingLabel');
  });

  it('keeps the service worker precache focused on the app shell instead of eager heavy feature payloads', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');

    expect(config).toMatch(/globIgnores:\s*\[[\s\S]*pyodide/i);
    expect(config).toContain("'**/bundle-stats.html'");
    expect(config).toContain("'**/assets/markdownPdf-*.js'");
    expect(config).toContain("'**/assets/markdown-vendor-*.js'");
    expect(config).toContain("'**/assets/math-vendor-*'");
    expect(config).toContain("'**/assets/genai-vendor-*.js'");
    expect(config).toContain("'**/assets/highlight-vendor-*.js'");
    expect(config).toContain("'**/assets/pdf-viewer-vendor-*'");
    expect(config).toContain("'**/assets/graphviz-vendor-*.js'");
    expect(config).toContain("'**/assets/HistorySidebar-*.js'");
    expect(config).toContain("'**/assets/MermaidBlock-*.js'");
    expect(config).toContain("'**/assets/*Diagram*.js'");
    expect(config).toContain("'**/assets/KaTeX_*'");
    expect(config).toContain("'**/fonts/NotoSansCJKsc-VF.ttf.part-*'");
  });

  it('provides an opt-in bundle analyzer without changing normal production builds', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.['build:analyze']).toBe('vite build --mode analyze');
    expect(packageJson.devDependencies).toHaveProperty('rollup-plugin-visualizer');
    expect(config).toContain("mode === 'analyze'");
    expect(config).toContain("import('rollup-plugin-visualizer')");
    expect(config).toContain("filename: 'dist/bundle-stats.html'");
  });

  it('keeps the assistant avatar sized for its compact message chrome', () => {
    const avatar = fs.readFileSync(assistantAvatarPath);
    const pngWidth = avatar.readUInt32BE(16);
    const pngHeight = avatar.readUInt32BE(20);

    expect(fs.statSync(assistantAvatarPath).size).toBeLessThan(24 * 1024);
    expect(pngWidth).toBeLessThanOrEqual(160);
    expect(pngHeight).toBeLessThanOrEqual(160);
  });

  it('does not duplicate PWA icon precache entries through includeAssets', () => {
    const config = fs.readFileSync(viteConfigPath, 'utf8');

    expect(config).not.toMatch(/includeAssets:\s*\[[\s\S]*pwa-(?:192|512|512-maskable)\.png/);
  });

  it('keeps Markdown PDF export off the html2canvas/html2pdf screenshot path', () => {
    const source = fs.readFileSync(markdownPdfExportPath, 'utf8');

    expect(source).toContain("from 'jspdf'");
    expect(source).not.toContain('html2canvas');
    expect(source).not.toContain('html2pdf');
  });

  it('keeps Markdown PDF font, image, and renderer responsibilities split', () => {
    const markdownPdfSource = fs.readFileSync(markdownPdfExportPath, 'utf8');
    const rendererSource = fs.readFileSync(markdownPdfRendererPath, 'utf8');

    expect(fs.existsSync(markdownPdfFontsPath)).toBe(true);
    expect(fs.existsSync(markdownPdfImagesPath)).toBe(true);
    expect(fs.existsSync(markdownPdfRendererPath)).toBe(true);
    expect(markdownPdfSource).toContain("from './markdownPdfRenderer'");
    expect(markdownPdfSource).not.toContain('class MarkdownPdfRenderer');
    expect(markdownPdfSource).not.toContain('loadCjkFontBase64');
    expect(markdownPdfSource).not.toContain('fetchImageAsDataUrl');
    expect(rendererSource).toContain("from './markdownPdfFonts'");
    expect(rendererSource).toContain("from './markdownPdfImages'");
  });

  it('keeps create-file PDF export code out of the initial chat input bundle', () => {
    const chatInputModalsSource = fs.readFileSync(chatInputModalsPath, 'utf8');
    const useCreateFileEditorSource = fs.readFileSync(useCreateFileEditorPath, 'utf8');

    expect(chatInputModalsSource).not.toContain('import { CreateTextFileEditor }');
    expect(chatInputModalsSource).toContain("import('@/components/modals/create-file/CreateTextFileEditor')");
    expect(useCreateFileEditorSource).not.toContain("from '@/utils/export/markdownPdf'");
    expect(useCreateFileEditorSource).toContain("import('@/utils/export/markdownPdf')");
  });

  it('keeps optional chat input modals out of the initial chat input bundle', () => {
    const chatInputModalsSource = fs.readFileSync(chatInputModalsPath, 'utf8');
    const chatInputFileModalsSource = fs.readFileSync(chatInputFileModalsPath, 'utf8');

    expect(chatInputModalsSource).not.toContain("from '@/components/modals/AudioRecorder'");
    expect(chatInputModalsSource).not.toContain("from '@/components/modals/HelpModal'");
    expect(chatInputModalsSource).not.toContain("from '@/components/modals/TextEditorModal'");
    expect(chatInputModalsSource).toContain("import('@/components/modals/AudioRecorder')");
    expect(chatInputModalsSource).toContain("import('@/components/modals/HelpModal')");
    expect(chatInputModalsSource).toContain("import('@/components/modals/TextEditorModal')");

    expect(chatInputFileModalsSource).not.toContain("from '@/components/modals/FileConfigModal'");
    expect(chatInputFileModalsSource).toContain("import('@/components/modals/FileConfigModal')");
  });

  it('keeps HTML-to-Markdown conversion out of the initial chat and message interaction bundles', () => {
    const clipboardDataSource = fs.readFileSync(clipboardDataPath, 'utf8');
    const useChatInputClipboardSource = fs.readFileSync(useChatInputClipboardPath, 'utf8');
    const useSelectionPositionSource = fs.readFileSync(useSelectionPositionPath, 'utf8');
    const tableBlockSource = fs.readFileSync(tableBlockPath, 'utf8');
    const useCreateFileEditorSource = fs.readFileSync(useCreateFileEditorPath, 'utf8');

    expect(clipboardDataSource).not.toContain("from '@/utils/htmlToMarkdown'");
    expect(useChatInputClipboardSource).not.toContain("from '@/utils/htmlToMarkdown'");
    expect(useSelectionPositionSource).not.toContain("from '@/utils/htmlToMarkdown'");
    expect(tableBlockSource).not.toContain("from '@/utils/htmlToMarkdown'");
    expect(useCreateFileEditorSource).not.toContain("from '@/utils/htmlToMarkdown'");

    expect(clipboardDataSource).toContain("import('@/utils/htmlToMarkdown')");
    expect(useSelectionPositionSource).toContain("import('@/utils/htmlToMarkdown')");
    expect(tableBlockSource).toContain("import('@/utils/htmlToMarkdown')");
    expect(useCreateFileEditorSource).toContain("import('@/utils/htmlToMarkdown')");
  });

  it('keeps ZIP and folder import builders out of the initial file upload bundles', () => {
    const importContextLoadersSource = fs.readFileSync(importContextLoadersPath, 'utf8');
    const useFileDragDropSource = fs.readFileSync(useFileDragDropPath, 'utf8');
    const useFilePreProcessingSource = fs.readFileSync(useFilePreProcessingPath, 'utf8');
    const useFilePreProcessingEffectsSource = fs.readFileSync(useFilePreProcessingEffectsPath, 'utf8');

    expect(fs.existsSync(importContextLoadersPath)).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/folderImportUtils.ts'))).toBe(false);
    expect(importContextLoadersSource).not.toMatch(
      /import\s+(?!type)[\s\S]*from '\.\/import-context\/importContextBuilder'/,
    );
    expect(useFileDragDropSource).not.toContain("from '@/utils/import-context/importContextBuilder'");
    expect(useFileDragDropSource).not.toContain("from '@/utils/import-context/droppedItems'");
    expect(useFilePreProcessingSource).not.toContain("from '@/utils/folderImportUtils'");
    expect(useFilePreProcessingEffectsSource).not.toContain("from '@/utils/folderImportUtils'");
    expect(useFilePreProcessingSource).not.toContain("import('@/utils/folderImportUtils')");
    expect(useFilePreProcessingEffectsSource).not.toContain("import('@/utils/folderImportUtils')");

    expect(importContextLoadersSource).toContain("import('./importContextBuilder')");
    expect(useFileDragDropSource).toContain("import('@/utils/import-context/droppedItems')");
    expect(useFileDragDropSource).toContain("import('@/utils/import-context/importContextBuilder')");
    expect(useFilePreProcessingSource).toContain("import('@/utils/import-context/loaders')");
    expect(useFilePreProcessingEffectsSource).toContain("import('@/utils/import-context/loaders')");
  });
});

describe('Runtime loading boundaries', () => {
  it('keeps feature-only translations out of the root i18n startup path', () => {
    const i18nContextSource = fs.readFileSync(i18nContextPath, 'utf8');
    const translationsSource = fs.readFileSync(i18nTranslationsPath, 'utf8');
    const appModalsSource = fs.readFileSync(path.join(projectRoot, 'src/components/modals/AppModals.tsx'), 'utf8');

    expect(i18nContextSource).not.toContain("from '@/i18n/translations'");
    expect(i18nContextSource).toContain("from '@/i18n/coreTranslations'");

    expect(translationsSource).not.toContain("from './translations/logViewer'");
    expect(translationsSource).not.toContain("from './translations/scenarios'");
    expect(translationsSource).not.toContain("from './translations/settings/");

    expect(fs.existsSync(i18nFeatureTranslationsPath)).toBe(true);
    expect(appModalsSource).toContain('ensureFeatureTranslations');
    expect(appModalsSource).toContain("ensureFeatureTranslations('settings')");
    expect(appModalsSource).toContain("ensureFeatureTranslations('logViewer')");
    expect(appModalsSource).toContain("ensureFeatureTranslations('scenarios')");
  });

  it('loads both base markdown and math markdown renderers lazily', () => {
    const lazyMarkdownSource = fs.readFileSync(lazyMarkdownRendererPath, 'utf8');

    expect(fs.existsSync(basicMarkdownRendererPath)).toBe(true);
    expect(fs.existsSync(mathMarkdownRendererPath)).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/message/BaseMarkdownRendererEntry.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/message/MarkdownRenderer.tsx'))).toBe(false);
    expect(lazyMarkdownSource).toContain("import('./BasicMarkdownRenderer')");
    expect(lazyMarkdownSource).toContain("import('./MathMarkdownRenderer')");
    expect(lazyMarkdownSource).not.toContain("import('./BaseMarkdownRendererEntry')");
    expect(lazyMarkdownSource).not.toContain("import('./MarkdownRenderer')");
  });

  it('moves KaTeX and PDF viewer CSS ownership out of the global app entry', () => {
    const indexSource = fs.readFileSync(indexEntryPath, 'utf8');
    const markdownRendererSource = fs.readFileSync(mathMarkdownRendererPath, 'utf8');

    expect(indexSource).not.toContain("import 'katex/dist/katex.min.css'");
    expect(indexSource).not.toContain("import 'react-pdf/dist/Page/AnnotationLayer.css'");
    expect(indexSource).not.toContain("import 'react-pdf/dist/Page/TextLayer.css'");
    expect(markdownRendererSource).toContain("import 'katex/dist/katex.min.css'");
  });

  it('removes static pyodide service imports from the main chat path', () => {
    const useChatSource = fs.readFileSync(useChatPath, 'utf8');
    const standardChatStrategySource = fs.readFileSync(standardChatStrategyPath, 'utf8');
    const standardChatApiCallSource = fs.readFileSync(standardChatApiCallPath, 'utf8');
    const usePyodideSource = fs.readFileSync(usePyodidePath, 'utf8');

    expect(fs.existsSync(pyodideLoaderPath)).toBe(true);
    expect(useChatSource).not.toContain("from '@/features/local-python/pyodideService'");
    expect(standardChatStrategySource).not.toContain("from '@/features/local-python/pyodideService'");
    expect(standardChatApiCallSource).not.toContain("from '@/features/local-python/pyodideService'");
    expect(usePyodideSource).not.toContain("from '@/features/local-python/pyodideService'");
    expect(useChatSource).toContain("from '@/features/local-python/loadPyodideService'");
    expect(standardChatApiCallSource).toContain("from '@/features/local-python/loadPyodideService'");
    expect(usePyodideSource).toContain("from './loadPyodideService'");
  });

  it('keeps runtime tool declarations free of direct @google/genai imports', () => {
    const standardClientFunctionsSource = fs.readFileSync(standardClientFunctionsPath, 'utf8');
    const liveClientFunctionsSource = fs.readFileSync(liveClientFunctionsPath, 'utf8');

    expect(standardClientFunctionsSource).not.toContain('@google/genai');
    expect(liveClientFunctionsSource).not.toContain('@google/genai');
  });

  it('keeps @google/genai out of runtime modules that only need schema literals', () => {
    const audioApiSource = fs.readFileSync(audioApiPath, 'utf8');
    const localPythonToolSource = fs.readFileSync(localPythonClientFunctionToolPath, 'utf8');

    expect(audioApiSource).not.toMatch(/import\s+\{\s*ThinkingLevel/);
    expect(localPythonToolSource).not.toMatch(/import\s+\{\s*Type/);
    expectTypeImportFrom(audioApiSource, '@google/genai', ['GenerateContentResponse', 'Part', 'UsageMetadata']);
    expectTypeImportFrom(localPythonToolSource, '@google/genai', ['FunctionDeclaration', 'Type']);
  });

  it('keeps TTS voice options on a single static import path to avoid mixed-import build warnings', () => {
    const ttsVoiceSelectorSource = fs.readFileSync(ttsVoiceSelectorPath, 'utf8');

    expect(ttsVoiceSelectorSource).toContain("from '@/constants/voiceOptions'");
    expect(ttsVoiceSelectorSource).not.toContain("import('@/constants/voiceOptions')");
  });
});
