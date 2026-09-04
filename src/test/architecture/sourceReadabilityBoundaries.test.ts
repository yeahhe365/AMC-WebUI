import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { listProjectSourceFiles, listProjectSourceFilesExcept, projectRoot, readProjectFile } from './projectFiles';

const SEND_CONTROLS_OBVIOUS_COMMENT_PATTERNS = [
  '{/* Cancel Edit Button',
  '{/* Main Action Button',
  '{/* Ripples */}',
  '{/* Icons stack',
];

const SESSION_LOADING_NARRATION_COMMENTS = [
  'Set Active Messages and ID',
  'Ensure metadata list contains this session',
  'Update metadata if needed',
  'Restore files from draft',
  'Fetch metadata only for the list',
  'Determine Active Session ID',
  'Set List State',
  'MEMORY OPTIMIZATION',
  'Fallback: New Chat',
  'Pass the top session',
];

const VAGUE_BYTE_BUFFER_LOCALS = ['const l =', 'const len =', 'const dv =', 'let p ='];

const UNCLEAR_AUDIO_WORKER_FRAGMENTS = [
  'function(e)',
  'const s =',
  'mp3encoder',
  'mp3buf',
  'catch (err)',
  'sampleBlockSize = 1152; ',
];

const VAGUE_AUDIO_STREAM_LOCALS = ['const ctx =', 'const dest =', 'const micSource =', 'const sysSource ='];

const LOG_VIEWER_OBVIOUS_JSX_COMMENTS = ['{/* Header */}', '{/* Tabs */}', '{/* Content */}'];

const HELP_MODAL_OBVIOUS_JSX_COMMENTS = [
  '{/* Header */}',
  '{/* Search Bar */}',
  '{/* Content */}',
  '{/* Icon */}',
  '{/* Text Info */}',
];

const AUDIO_RECORDER_OBVIOUS_JSX_COMMENTS = [
  '{/* Header */}',
  '{/* Content Body */}',
  '{/* State: Idle / Initializing */}',
  '{/* State: Recording */}',
  '{/* State: Review */}',
  '{/* Controls */}',
];

const TOKEN_COUNT_MODAL_OBVIOUS_JSX_COMMENTS = ['{/* Header */}', '{/* Model Selection */}', '{/* Error Display */}'];
const AMBIGUOUS_CATCH_NAME_PATTERN = /\bcatch \((?:e|err)\)/;
const thisTestFile = 'src/test/architecture/sourceReadabilityBoundaries.test.ts';

describe('source readability boundaries', () => {
  it('names caught errors after their local failure context', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);
    const offenders = sourceFiles.filter((relativePath) =>
      AMBIGUOUS_CATCH_NAME_PATTERN.test(readProjectFile(relativePath)),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps chat input context type contracts out of the context runtime module', () => {
    const contextSource = readProjectFile('src/components/chat/input/ChatInputContext.tsx');
    const contextTypesSource = readProjectFile('src/components/chat/input/chatInputContextTypes.ts');

    expect(contextSource).toContain("from './chatInputContextTypes'");
    expect(contextSource).not.toContain('interface ChatInputRuntimeState');
    expect(contextSource).not.toContain('interface ChatInputState');
    expect(contextSource).not.toContain('interface ChatInputHandlers');
    expect(contextTypesSource).toContain('export interface ChatInputContextValue');
    expect(contextTypesSource).toContain('export interface ChatInputActionsContextValue');
    expect(contextSource.length).toBeLessThan(3500);
  });

  it('models language badge entries directly instead of through an identity helper', () => {
    const source = readProjectFile('src/components/message/code/LanguageIcon.tsx');

    expect(source).toContain('satisfies LanguageBadgeEntry[]');
    expect(source).not.toContain('const languageBadge =');
    expect(source).not.toContain('languageBadge({');
  });

  it('keeps architecture guard tests on the shared filesystem helpers', () => {
    const utilitySource = readProjectFile('src/test/architecture/projectFiles.ts');
    const architectureTests = listProjectSourceFiles('src/test/architecture').filter(
      (relativePath) =>
        relativePath.endsWith('.test.ts') &&
        relativePath !== 'src/test/architecture/sourceReadabilityBoundaries.test.ts',
    );
    const localHelperOffenders = architectureTests.filter((relativePath) => {
      const source = readProjectFile(relativePath);
      return (
        source.includes("const projectRoot = path.resolve(__dirname, '../../..');") ||
        source.includes('const readProjectFile =')
      );
    });

    expect(fs.existsSync(path.join(projectRoot, 'src/test/architecture/architectureTestUtils.ts'))).toBe(false);
    expect(utilitySource).toContain('.sort(');
    expect(localHelperOffenders).toEqual([]);
  });

  it('keeps UI comments from narrating obvious markup sections', () => {
    const appEntrySource = readProjectFile('src/index.tsx');
    const sendControlsSource = readProjectFile('src/components/chat/input/actions/SendControls.tsx');
    const codeBlockSource = readProjectFile('src/components/message/blocks/CodeBlock.tsx');
    const consoleTabSource = readProjectFile('src/components/log-viewer/ConsoleTab.tsx');
    const modelPickerSource = readProjectFile('src/components/shared/ModelPicker.tsx');
    const groupItemSource = readProjectFile('src/components/sidebar/GroupItem.tsx');
    const pdfMainContentSource = readProjectFile('src/components/shared/file-preview/pdf-viewer/PdfMainContent.tsx');
    const preloadedMessagesModalSource = readProjectFile('src/components/scenarios/PreloadedMessagesModal.tsx');
    const dataManagementSectionSource = readProjectFile('src/components/settings/sections/DataManagementSection.tsx');

    expect(appEntrySource).not.toContain('Import Global Styles');

    for (const phrase of SEND_CONTROLS_OBVIOUS_COMMENT_PATTERNS) {
      expect(sendControlsSource).not.toContain(phrase);
    }

    expect(codeBlockSource).not.toContain('Extract raw code for execution');
    expect(codeBlockSource).not.toContain('Execution Props');
    expect(codeBlockSource).not.toContain('Execution Console');
    expect(consoleTabSource).not.toContain('{/* List */}');
    expect(consoleTabSource).not.toContain('{/* Load More Trigger */}');
    expect(modelPickerSource).not.toContain('Render props for the trigger button');
    expect(groupItemSource).not.toContain('Define a type for the props that are passed down to SessionItem');
    expect(pdfMainContentSource).not.toContain('PDF Content');
    expect(pdfMainContentSource).not.toContain('Loading Indicator');
    expect(pdfMainContentSource).not.toContain('Error Indicator');
    expect(preloadedMessagesModalSource).not.toContain('Modal Header');
    expect(preloadedMessagesModalSource).not.toContain('Feedback Toast');
    expect(preloadedMessagesModalSource).not.toContain('Content Area');
    expect(dataManagementSectionSource).not.toContain('DANGER ZONE');
  });

  it('does not pass literal fallbacks for translation keys that already exist', () => {
    const sendControlsSource = readProjectFile('src/components/chat/input/actions/SendControls.tsx');

    expect(sendControlsSource).not.toContain("t('sendMessageFastSuffix',");
  });

  it('names shared error boundary contracts after the component', () => {
    const errorBoundarySource = readProjectFile('src/components/shared/ErrorBoundary.tsx');

    expect(errorBoundarySource).toContain('interface ErrorBoundaryProps');
    expect(errorBoundarySource).toContain('interface ErrorBoundaryState');
    expect(errorBoundarySource).not.toContain('interface Props');
    expect(errorBoundarySource).not.toContain('interface State');
  });

  it('keeps session loading comments focused on why instead of narrating steps', () => {
    const sessionLoaderSource = readProjectFile('src/hooks/chat/history/useSessionLoader.ts');

    for (const phrase of SESSION_LOADING_NARRATION_COMMENTS) {
      expect(sessionLoaderSource).not.toContain(phrase);
    }
  });

  it('keeps byte-buffer code readable through descriptive locals', () => {
    const byteBufferSources = [
      'src/features/audio/audioProcessing.ts',
      'src/utils/file/fileEncoding.ts',
      'src/hooks/chat-input/useChatInputGlobalEffects.ts',
      'src/components/modals/create-file/useCreateFileEditor.ts',
    ];

    for (const relativePath of byteBufferSources) {
      const source = readProjectFile(relativePath);
      for (const vagueLocalName of VAGUE_BYTE_BUFFER_LOCALS) {
        expect(source, relativePath).not.toContain(vagueLocalName);
      }
    }

    const audioProcessingSource = readProjectFile('src/features/audio/audioProcessing.ts');
    expect(audioProcessingSource).toContain('sampleCount');
    expect(audioProcessingSource).toContain('wavView');
    expect(audioProcessingSource).toContain('writeOffset');
  });

  it('keeps inline worker code readable despite living inside strings', () => {
    const audioCompressionWorkerCode = readProjectFile('src/features/audio/audioCompressionWorkerCode.ts');
    const audioCompressionSource = readProjectFile('src/features/audio/audioCompression.ts');

    expect(audioCompressionSource).not.toContain('createAudioCompressionWorkerCode');
    expect(audioCompressionSource).not.toContain('createWorker?:');
    expect(audioCompressionSource).not.toContain('createObjectUrl?:');
    expect(audioCompressionSource).not.toContain('revokeObjectUrl?:');
    expect(audioCompressionSource).not.toContain('createWorker ??');
    expect(audioCompressionSource).not.toContain('worker.onmessage = (e)');
    for (const unclearFragment of UNCLEAR_AUDIO_WORKER_FRAGMENTS) {
      expect(audioCompressionWorkerCode).not.toContain(unclearFragment);
    }

    expect(audioCompressionWorkerCode).toContain('function(event)');
    expect(audioCompressionWorkerCode).toContain('clampedSample');
    expect(audioCompressionWorkerCode).toContain('mp3Encoder');
    expect(audioCompressionWorkerCode).toContain('encodedChunk');
  });

  it('names audio stream composition locals after their runtime role', () => {
    const audioAnalyserSource = readProjectFile('src/features/audio/useAudioAnalyser.ts');

    for (const vagueLocalName of VAGUE_AUDIO_STREAM_LOCALS) {
      expect(audioAnalyserSource).not.toContain(vagueLocalName);
    }

    expect(audioAnalyserSource).toContain('const audioContext =');
    expect(audioAnalyserSource).toContain('const sessionAnalyser =');
  });

  it('keeps compact UI helpers readable through domain names', () => {
    const durationFormatSource = readProjectFile('src/utils/durationFormat.ts');
    const contextUrlsSource = readProjectFile('src/components/message/grounded-response/ContextUrls.tsx');
    const sendControlsSource = readProjectFile('src/components/chat/input/actions/SendControls.tsx');

    expect(durationFormatSource).not.toContain('const m =');
    expect(durationFormatSource).not.toContain('const s =');
    expect(durationFormatSource).toContain('const minutes =');
    expect(durationFormatSource).toContain('const remainingSeconds =');

    expect(contextUrlsSource).not.toContain('const s = status?.toUpperCase()');
    expect(contextUrlsSource).not.toContain('(item, i) =>');
    expect(contextUrlsSource).toContain('const normalizedStatus =');
    expect(contextUrlsSource).toContain('(item, itemIndex) =>');

    expect(sendControlsSource).not.toContain('const x = e.clientX');
    expect(sendControlsSource).not.toContain('const y = e.clientY');
  });

  it('keeps JSX comments from restating obvious component sections', () => {
    const headerModelSelectorSource = readProjectFile('src/components/header/HeaderModelSelector.tsx');
    const logViewerSource = readProjectFile('src/components/log-viewer/LogViewer.tsx');
    const consoleTabSource = readProjectFile('src/components/log-viewer/ConsoleTab.tsx');
    const helpModalSource = readProjectFile('src/components/modals/HelpModal.tsx');
    const audioRecorderSource = readProjectFile('src/components/modals/AudioRecorder.tsx');
    const tokenCountModalSource = readProjectFile('src/components/modals/TokenCountModal.tsx');
    const filePreviewHeaderSource = readProjectFile('src/components/shared/file-preview/FilePreviewHeader.tsx');
    const imageViewerSource = readProjectFile('src/components/shared/file-preview/ImageViewer.tsx');
    const apiConnectionTesterSource = readProjectFile(
      'src/components/settings/sections/api-config/ApiConnectionTester.tsx',
    );
    const themeLanguageSelectorSource = readProjectFile(
      'src/components/settings/sections/appearance/ThemeLanguageSelector.tsx',
    );
    const graphvizBlockSource = readProjectFile('src/components/message/blocks/GraphvizBlock.tsx');

    expect(headerModelSelectorSource).not.toContain('Thinking Level Toggle');
    expect(consoleTabSource).not.toContain('{/* Toolbar */}');

    for (const phrase of LOG_VIEWER_OBVIOUS_JSX_COMMENTS) {
      expect(logViewerSource).not.toContain(phrase);
    }

    for (const phrase of HELP_MODAL_OBVIOUS_JSX_COMMENTS) {
      expect(helpModalSource).not.toContain(phrase);
    }

    for (const phrase of AUDIO_RECORDER_OBVIOUS_JSX_COMMENTS) {
      expect(audioRecorderSource).not.toContain(phrase);
    }

    for (const phrase of TOKEN_COUNT_MODAL_OBVIOUS_JSX_COMMENTS) {
      expect(tokenCountModalSource).not.toContain(phrase);
    }

    expect(filePreviewHeaderSource).not.toContain('{/* Top Actions */}');
    expect(imageViewerSource).not.toContain('{/* Bottom Controls */}');
    expect(apiConnectionTesterSource).not.toContain('Optional Model Selector for Testing');
    expect(apiConnectionTesterSource).not.toContain('{/* Test Results */}');
    expect(apiConnectionTesterSource).toContain('CheckCircle2');
    expect(apiConnectionTesterSource).not.toContain('<svg');
    expect(themeLanguageSelectorSource).not.toContain('{/* Theme Selector */}');
    expect(themeLanguageSelectorSource).not.toContain('{/* Language Selector */}');
    expect(graphvizBlockSource).not.toContain('修复关键点');
  });

  it('keeps remaining JSX comments focused on behavior or layout constraints', () => {
    const allowedJsxComments = new Set([
      'Stop propagation to prevent toggling when clicking actions',
      'Syntax Highlight Layer',
      'Input Layer',
      'Shadow Textarea for Height Calculation',
      'Insert BBox and Guide Buttons after "Smart Board" (organize action) if available',
      'Wrap toolbar in z-indexed container to ensure dropdowns render above status banner',
      'Use chunkIndex+1 to match the [N] citation markers in the text body.',
      // Layout / design constraints (not section narration)
      'Mobile-only close row; desktop close lives in the content pane.',
      'Search container aligned with main header baseline',
      'Search collapses the tab list into a desktop-only match-count status.',
      'Danger severity escalates by consequence: reset < delete chats < wipe all data.',
      // Selection ask panel (selection-ask dock / resize hit zones)
      '常显品牌色条：贴边收起后把手要有足够的视觉存在感，避免找不到面板',
      '把手仅作视觉指示，命中区在面板外侧热区；内缩 4px 防圆角裁剪',
      '热区是面板兄弟节点、跨边框（外 6 内 1）：放面板内会盖住右缘滚动条',
    ]);
    const jsxCommentPattern = /\{\/\*\s*([^*]+?)\s*\*\/\}/g;
    const unexpectedComments = listProjectSourceFiles('src')
      .filter((relativePath) => relativePath.endsWith('.tsx'))
      .filter((relativePath) => !relativePath.includes('.test.'))
      .flatMap((relativePath) =>
        [...readProjectFile(relativePath).matchAll(jsxCommentPattern)]
          .map((match) => match[1].trim())
          .filter((comment) => !allowedJsxComments.has(comment))
          .map((comment) => `${relativePath}: ${comment}`),
      );

    expect(unexpectedComments).toEqual([]);
  });

  it('names live media and canvas contexts after the resource they wrap', () => {
    const liveAudioSource = readProjectFile('src/hooks/live-api/useLiveAudio.ts');
    const liveVideoSource = readProjectFile('src/hooks/live-api/useLiveVideo.ts');
    const audioVisualizerSource = readProjectFile('src/components/audio/AudioVisualizer.tsx');
    const imageExportSource = readProjectFile('src/utils/export/image.ts');
    const backgroundKeepAliveSource = readProjectFile('src/hooks/core/useBackgroundKeepAlive.ts');
    const completionFeedbackSource = readProjectFile('src/utils/browserCompletionFeedback.ts');

    expect(liveAudioSource).not.toContain('const ctx = audioContextRef.current');
    expect(liveAudioSource).not.toContain('sourcesRef.current.forEach((s)');
    expect(liveAudioSource).toContain('const audioContext = audioContextRef.current');
    expect(liveAudioSource).toContain('sourcesRef.current.forEach((source)');

    for (const source of [liveVideoSource, audioVisualizerSource, imageExportSource]) {
      expect(source).not.toContain('const ctx = canvas.getContext');
      expect(source).toContain('const canvasContext = canvas.getContext');
    }

    expect(audioVisualizerSource).not.toContain('let x = (width');
    expect(audioVisualizerSource).toContain('let barX =');
    expect(imageExportSource).not.toContain('Draw at 1:1 of the scaled image');
    expect(backgroundKeepAliveSource).not.toContain('audioCtxRef');
    expect(backgroundKeepAliveSource).not.toContain('const ctx = new AudioContextClass');
    expect(backgroundKeepAliveSource).not.toContain('const osc =');
    expect(backgroundKeepAliveSource).toContain('const audioContextRef =');
    expect(backgroundKeepAliveSource).toContain('const oscillator =');
    expect(completionFeedbackSource).not.toContain('const ctx = getAudioContext');
    expect(completionFeedbackSource).toContain('const audioContext = getAudioContext');
  });
});
