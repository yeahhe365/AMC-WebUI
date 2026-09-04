/**
 * @vitest-environment node
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from './languageRegistry';
import { ensureAllFeatureTranslations, getTranslator, translations } from './translations';

const projectRoot = path.resolve(__dirname, '../..');

const readProjectFile = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('translation coverage for protected UI surfaces', () => {
  it('uses real Chinese copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('zh');

    expect(t('fillInput')).toBe('插入');
    expect(t('queuedSubmissionAction')).toBe('编辑');
    expect(t('settingsFinishModelListEdit')).toBe('完成编辑');
    expect(t('attachMenuCreateText')).toBe('创建文本文件');
    expect(t('tokensUnit')).toBe('Token');
    expect(t('metricsTtft')).toBe('首字延迟');
    expect(t('createTextPdfError')).toBe('生成 PDF 失败。');
    expect(t('screenCaptureUnsupported')).toBe('当前浏览器不支持屏幕捕获。');
    expect(t('exportImageTooLarge')).toBe('导出失败：图片尺寸过大，浏览器无法处理。请尝试导出为 HTML 或文本。');
    expect(t('folderProcessing')).toBe('正在处理文件夹…');
    expect(t('settingsNotificationsUnsupported')).toBe('当前浏览器不支持桌面通知。');
    expect(t('addByUrlInvalid')).toBe('YouTube 链接无效。');
    expect(t('selectedFileReadTextFailed')).toBe('读取文本文件内容失败。');
    expect(t('settingsImportErrorWithMessage').replace('{message}', 'X')).toBe('导入失败：X');
    expect(t('appDefaultModelsLoadError')).toBe('加载默认模型失败。');
    expect(t('pdfLoadFailed')).toBe('PDF 加载失败。');
    expect(t('pdfLoadFailedWithMessage').replace('{message}', 'X')).toBe('PDF 加载失败：X');
    expect(t('diagramExportFailed')).toBe('导出图表失败。');
    expect(t('translateFailed')).toBe('翻译失败。');
    expect(t('translateFailedWithMessage').replace('{message}', 'X')).toBe('翻译失败：X');
    expect(t('tokenCountErrorWithMessage').replace('{message}', 'X')).toBe('计算 Token 失败：X');
    expect(t('exportMessageContentMissing')).toBe('找不到消息内容。请确认该消息当前可见。');
    expect(t('thinkingRawProcess')).toBe('原始推理过程');
    expect(t('chatInputTextareaAria')).toBe('聊天消息输入框');
    expect(t('settingsTopKTooltip')).toBe('限制采样范围为概率最高的 K 个 Token。Gemma 4 建议设为 64，设为 0 可禁用。');
    expect(t('settingsMediaResolutionLiveTooltip')).toBe('控制 Live API 的视频/音频分辨率。');
    expect(t('thinkingProcess')).toBe('推理过程');
    expect(t('fileProcessingZip').replace('{filename}', 'demo.zip')).toBe('正在处理 demo.zip…');
    expect(t('uploadCancelledByUser')).toBe('用户已取消上传。');
    expect(t('voiceInputFailedWithMessage').replace('{message}', 'X')).toBe('语音输入失败：X');
    expect(t('fileProcessingBackendFailedWithMessage').replace('{message}', 'X')).toBe('后端处理失败：X');
    expect(t('uploadApiProcessingFailedWithMessage').replace('{message}', 'X')).toBe('文件 API 处理失败：X');
    expect(t('fileIdAdderProcessingFailedWithMessage').replace('{message}', 'X')).toBe('文件 API 处理失败：X');
    expect(t('diagramGraphvizTitle')).toBe('Graphviz 图表');
    expect(t('diagramMermaidTitle')).toBe('Mermaid 图表');
    expect(t('scenariosTitleRequired')).toBe('场景标题不能为空。');
    expect(t('historyCopySuffix')).toBe('副本');
    expect(t('historyCopyTitle').replace('{title}', 'A')).toBe('A（副本）');
    expect(t('scenariosCopyTitle').replace('{title}', 'A')).toBe('A（副本）');
    expect(t('scenariosMessageCount').replace('{count}', '2')).toBe('2 条消息');
    expect(t('assistantAvatarAlt')).toBe('助手头像');
    expect(t('messageSenderErrorWithPrefix').replace('{prefix}', '错误').replace('{message}', 'X')).toBe('错误：X');
    expect(t('messageSenderApiKeyNotConfigured')).toBe('未在设置中配置 API 密钥。');
    expect(t('messageSenderEmptyReply')).toBe('模型结束了这一轮，但没有给出可见回复。请重试。');
    expect(t('messageSenderEmptyReplyWithThoughts')).toBe(
      '模型结束了这一轮，但没有给出可见回复（只有思考过程）。可以重试，或调低思考等级后再试。',
    );
    expect(t('messageSenderTtsErrorPrefix')).toBe('语音生成错误');
    expect(t('messageSenderImageEditErrorPrefix')).toBe('图像编辑错误');
    expect(t('messageSenderAudioReadyTitle')).toBe('音频已生成');
    expect(t('messageSenderImageEditResultPrefix').replace('{index}', '2')).toBe('图片 2：');
    expect(t('messageSenderImageEditPartialNote').replace('{count}', '1').replace('{reason}', '原因。')).toBe(
      '*[提示：4 张图片中仅 1 张生成成功。原因。]*',
    );
    expect(t('settingsImportInvalidFileFormat').replace('{expectedType}', 'A').replace('{foundType}', 'B')).toBe(
      '文件格式无效。应为 A，实际为 B。',
    );
    expect(t('exportMessageDialogTitle')).toBe('导出消息');
  });

  it('uses real Japanese copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('ja');

    expect(t('fillInput')).toBe('挿入');
    expect(t('cancel')).toBe('キャンセル');
    expect(t('save')).toBe('保存');
    expect(t('delete')).toBe('削除');
    expect(t('newChat')).toBe('新しいチャット');
    expect(t('search')).toBe('検索');
    expect(t('copy')).toBe('コピー');
    expect(t('download')).toBe('ダウンロード');
    expect(t('loading')).toBe('読み込み中…');
    expect(t('close')).toBe('閉じる');
    expect(t('expand')).toBe('展開');
    expect(t('refresh')).toBe('更新');
    expect(t('pipEnter')).toBe('ピクチャーインピクチャーに入る');
    expect(t('pipExit')).toBe('ピクチャーインピクチャーを終了');
    expect(t('settingsTitle')).toBe('設定');
    expect(t('settingsTheme')).toBe('テーマ');
    expect(t('settingsLanguage')).toBe('言語');
    expect(t('settingsLanguageJa')).toBe('日本語');
    expect(t('mediaResolutionLow')).toBe('低（高速）');
    expect(t('pwaUpdateLater')).toBe('後で');
    expect(t('historyTitle')).toBe('履歴');
    expect(t('settingsDefaultModel')).toBe('プライマリチャットモデル');
    expect(t('safetyTitle')).toBe('安全性設定');
    expect(t('shortcutsNewChat')).toBe('新規チャットを開始');
    expect(t('back')).toBe('戻る');
    expect(t('unknown')).toBe('不明');
  });

  it('uses real Korean copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('ko');

    expect(t('cancel')).toBe('취소');
    expect(t('save')).toBe('저장');
    expect(t('delete')).toBe('삭제');
    expect(t('newChat')).toBe('새 채팅');
    expect(t('search')).toBe('검색');
    expect(t('copy')).toBe('복사');
    expect(t('download')).toBe('다운로드');
    expect(t('settingsTitle')).toBe('설정');
    expect(t('settingsTheme')).toBe('테마');
    expect(t('settingsLanguage')).toBe('언어');
    expect(t('settingsLanguageKo')).toBe('한국어');
    expect(t('historyTitle')).toBe('기록');
    expect(t('back')).toBe('뒤로');
  });

  it('uses real Spanish copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('es');

    expect(t('cancel')).toBe('Cancelar');
    expect(t('save')).toBe('Guardar');
    expect(t('delete')).toBe('Eliminar');
    expect(t('newChat')).toBe('Nuevo chat');
    expect(t('search')).toBe('Buscar');
    expect(t('copy')).toBe('Copiar');
    expect(t('download')).toBe('Descargar');
    expect(t('settingsTitle')).toBe('Ajustes');
    expect(t('settingsTheme')).toBe('Tema');
    expect(t('settingsLanguage')).toBe('Idioma');
    expect(t('settingsLanguageEs')).toBe('Español');
    expect(t('historyTitle')).toBe('Historial');
    expect(t('back')).toBe('Atrás');
  });

  it('uses real French copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('fr');

    expect(t('cancel')).toBe('Annuler');
    expect(t('save')).toBe('Enregistrer');
    expect(t('delete')).toBe('Supprimer');
    expect(t('newChat')).toBe('Nouvelle discussion');
    expect(t('search')).toBe('Rechercher');
    expect(t('copy')).toBe('Copier');
    expect(t('download')).toBe('Télécharger');
    expect(t('settingsTitle')).toBe('Paramètres');
    expect(t('settingsTheme')).toBe('Thème');
    expect(t('settingsLanguage')).toBe('Langue');
    expect(t('settingsLanguageFr')).toBe('Français');
    expect(t('historyTitle')).toBe('Historique');
    expect(t('back')).toBe('Retour');
  });

  it('uses real German copy for protected translation keys', async () => {
    await ensureAllFeatureTranslations();
    const t = getTranslator('de');

    expect(t('cancel')).toBe('Abbrechen');
    expect(t('save')).toBe('Speichern');
    expect(t('delete')).toBe('Löschen');
    expect(t('newChat')).toBe('Neuer Chat');
    expect(t('search')).toBe('Suchen');
    expect(t('copy')).toBe('Kopieren');
    expect(t('download')).toBe('Herunterladen');
    expect(t('settingsTitle')).toBe('Einstellungen');
    expect(t('settingsTheme')).toBe('Design');
    expect(t('settingsLanguage')).toBe('Sprache');
    expect(t('settingsLanguageDe')).toBe('Deutsch');
    expect(t('historyTitle')).toBe('Verlauf');
    expect(t('back')).toBe('Zurück');
  });

  it('keeps Chinese UI copy on full-width punctuation where applicable', async () => {
    await ensureAllFeatureTranslations();
    const offenders = Object.entries(translations).flatMap(([key, value]) => {
      const zh = value.zh;
      if (!zh) return [];

      const issues = [
        zh.includes('...') ? 'ASCII ellipsis' : '',
        /[\u4e00-\u9fff]:/.test(zh) ? 'ASCII colon after Chinese text' : '',
        /[()]/.test(zh) && /[\u4e00-\u9fff]/.test(zh) ? 'ASCII parentheses in Chinese text' : '',
      ].filter(Boolean);

      return issues.map((issue) => `${key}: ${issue} -> ${zh}`);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps Japanese UI copy on full-width punctuation where applicable', async () => {
    await ensureAllFeatureTranslations();
    const offenders = Object.entries(translations).flatMap(([key, value]) => {
      const ja = (value as { ja?: string }).ja;
      if (!ja) return [];

      const issues = [
        ja.includes('...') ? 'ASCII ellipsis' : '',
        /[\u3040-\u30ff\u4e00-\u9fff]:/.test(ja) ? 'ASCII colon after Japanese text' : '',
        /[()]/.test(ja) && /[\u3040-\u30ff\u4e00-\u9fff]/.test(ja) ? 'ASCII parentheses in Japanese text' : '',
      ].filter(Boolean);

      return issues.map((issue) => `${key}: ${issue} -> ${ja}`);
    });

    expect(offenders).toEqual([]);
  });

  it('does not leave protected surfaces with banned hardcoded English copy', () => {
    const protectedStrings: Array<{ file: string; snippets: string[] }> = [
      {
        file: 'src/components/pwa/PwaUpdateBanner.tsx',
        snippets: [
          'A newer version of the app is ready.',
          'Refresh to update the installed shell and latest assets.',
          "'Later'",
          "'Refresh'",
        ],
      },
      {
        file: 'src/components/log-viewer/LogViewer.tsx',
        snippets: [
          "'System Logs'",
          "'Console'",
          "'Usage'",
          "'Overview'",
          "'Tokens'",
          "'API Keys'",
          "'Clear Logs'",
          'Are you sure you want to clear all logs and usage statistics from the database?',
        ],
      },
      {
        file: 'src/components/log-viewer/ConsoleTab.tsx',
        snippets: [
          "'Search logs...'",
          "'All Categories'",
          "'Export JSON'",
          "'No logs found'",
          "'Load older logs'",
          "'Clear'",
        ],
      },
      {
        file: 'src/components/log-viewer/TokenUsageTab.tsx',
        snippets: [
          "'Token Usage Statistics'",
          "'No token usage recorded yet.'",
          "'Input Tokens'",
          "'Output Tokens'",
          "'Total Tokens'",
        ],
      },
      {
        file: 'src/components/log-viewer/ApiUsageTab.tsx',
        snippets: ["'API Key Usage Statistics'", "'Active'", "'requests'"],
      },
      {
        file: 'src/components/message/buttons/export/ExportModal.tsx',
        snippets: ['Close export dialog', 'Processing message content...', 'Export Message', 'Exporting {type}...'],
      },
      {
        file: 'src/components/message/buttons/export/ExportOptions.tsx',
        snippets: [
          'Visual snapshot',
          'Web page format',
          'Plain text',
          'Raw data',
          'PNG Image',
          'HTML File',
          'TXT File',
          'JSON File',
        ],
      },
      {
        file: 'src/components/chat/input/toolbar/AddFileByIdInput.tsx',
        snippets: ['Enter a valid Gemini API File URI', 'files/888...'],
      },
      {
        file: 'src/components/chat/input/toolbar/QuadImageToggle.tsx',
        snippets: ['4 Images'],
      },
      {
        file: 'src/components/message/grounded-response/ContextUrls.tsx',
        snippets: ['Context URLs', 'Status:'],
      },
      {
        file: 'src/components/message/blocks/parts/DiagramWrapper.tsx',
        snippets: ['Hide Source', 'Show Source', 'Open in Side Panel', 'Zoom Diagram', 'Download as JPG', 'Copy Code'],
      },
      {
        file: 'src/components/scenarios/editor/ScenarioMessageList.tsx',
        snippets: ['No messages yet.', 'Add messages below to script the conversation flow.', 'Press Enter to save'],
      },
      {
        file: 'src/components/scenarios/editor/ScenarioMessageInput.tsx',
        snippets: ['Add Message As', '> User<', '> Model<'],
      },
      {
        file: 'src/components/scenarios/editor/ScenarioSystemPrompt.tsx',
        snippets: ["'Expand'", 'Define the persona, style, and rules for the AI.'],
      },
      {
        file: 'src/components/scenarios/ScenarioList.tsx',
        snippets: ['No scenarios found.', 'Clear search query'],
      },
      {
        file: 'src/components/shared/file-preview/FilePreviewHeader.tsx',
        snippets: [
          "'Filename'",
          "'Save Changes'",
          "'Edit File'",
          "'Copy Content'",
          "'Download SVG'",
          "'Download File'",
          "'Cancel Edit'",
          'Failed to copy to clipboard. Your browser might not support this feature or require permissions.',
        ],
      },
      {
        file: 'src/components/shared/file-preview/TextFileViewer.tsx',
        snippets: ['Failed to load file content.', 'Loading content...'],
      },
      {
        file: 'src/components/shared/file-preview/ImageViewer.tsx',
        snippets: ["'Zoom Out'", "'Zoom In'", "'Reset View'"],
      },
      {
        file: 'src/components/shared/file-preview/pdf-viewer/PdfToolbar.tsx',
        snippets: ["'Toggle Thumbnails'", "'Previous Page'", "'Next Page'", "'Page number'", "'Rotate'"],
      },
      {
        file: 'src/components/shared/file-preview/pdf-viewer/PdfMainContent.tsx',
        snippets: ['Loading PDF...'],
      },
      {
        file: 'src/components/modals/FilePreviewModal.tsx',
        snippets: [
          "'Previous'",
          "'Next'",
          'Loading Word preview...',
          'Unable to preview this Word document.',
          'Loading PDF viewer...',
          "'YouTube video player'",
          'Invalid YouTube URL',
          'Preview not available for this file type.',
        ],
      },
      {
        file: 'src/components/modals/html-preview/HtmlPreviewHeader.tsx',
        snippets: [
          '"HTML Preview"',
          '"Unrestricted demo"',
          '"Live Artifact"',
          '"Zoom Out"',
          '"Zoom In"',
          '"Reload"',
          '"Download source HTML"',
          '"Screenshot"',
          '"Exit Fullscreen"',
          '"Fullscreen"',
          '"Close"',
        ],
      },
      {
        file: 'src/components/modals/html-preview/HtmlPreviewContent.tsx',
        snippets: ['"HTML Content Preview"'],
      },
      {
        file: 'src/components/message/blocks/ArtifactFrame.tsx',
        snippets: ['Open larger preview'],
      },
      {
        file: 'src/components/header/Header.tsx',
        snippets: ["'Exit Picture-in-Picture'", "'Enter Picture-in-Picture'"],
      },
      {
        file: 'src/components/header/HeaderModelSelector.tsx',
        snippets: [
          "'Toggle reasoning mode'",
          "'Toggle thinking level'",
          "'Reasoning: Minimal (Fast Mode)'",
          "'Reasoning: High'",
          "'Thinking: High (Pro Mode)'",
        ],
      },
      {
        file: 'src/components/modals/HelpModal.tsx',
        snippets: ['"Search commands..."', '"Click to copy"', 'No commands found matching', 'Tip: Type'],
      },
      {
        file: 'src/components/modals/AudioRecorder.tsx',
        snippets: [
          'Voice Recorder',
          'Preview Recording',
          'Ready to record',
          'Accessing microphone...',
          'Record microphone',
          'Mic input only',
          'Record system audio',
          'System audio + mic',
          'Browser permission is required for system audio.',
          'Total Duration',
          '>Recording<',
          'Failed to save recording.',
        ],
      },
      {
        file: 'src/components/audio/RecorderControls.tsx',
        snippets: ['Start Recording', 'Stop Recording', '>Discard<', 'Saving...', 'Save Recording'],
      },
      {
        file: 'src/components/chat/input/QueuedSubmissionCard.tsx',
        snippets: ['Edit queued message', 'Remove queued message'],
      },
      {
        file: 'src/components/chat/input/actions/LiveControls.tsx',
        snippets: [
          'Start Camera',
          'Start Screen Share',
          'Stop Live Video',
          'Mute Microphone',
          'Unmute Microphone',
          'Start Live Session',
          'End Live Session',
        ],
      },
      {
        file: 'src/components/chat/input/SlashCommandMenu.tsx',
        snippets: ['>Commands<', '↑↓ to navigate', 'Tab to select'],
      },
      {
        file: 'src/components/scenarios/PreloadedMessagesModal.tsx',
        snippets: ['System Preset (Read Only)', "'Editor'"],
      },
      {
        file: 'src/components/message/content/MessageFooter.tsx',
        snippets: ['Generating suggestions...'],
      },
      {
        file: 'src/components/chat/message-list/text-selection/AudioPlayerView.tsx',
        snippets: ['Generating Audio...', 'Drag to move'],
      },
      {
        file: 'src/components/chat/input/ChatInputToolbar.tsx',
        snippets: ["TTS Director's Notes", '>Context<'],
      },
      {
        file: 'src/components/modals/create-file/CreateFileHeader.tsx',
        snippets: ['Download PDF', 'Switch to Edit', 'Switch to Preview'],
      },
      {
        file: 'src/components/modals/create-file/CreateFileBody.tsx',
        snippets: ['File content', 'Drop image to insert', '*Start typing...*', 'Generated with AMC WebUI'],
      },
      {
        file: 'src/components/modals/create-file/CreateFileFooter.tsx',
        snippets: ['aria-label="Filename"', 'aria-label="File Extension"'],
      },
      {
        file: 'src/components/message/blocks/CodeBlock.tsx',
        snippets: [
          'Show more',
          'Show less',
          'Collapse code block',
          'Local Python Output',
          'Reset View',
          'Close Console',
          'alt="Plot"',
        ],
      },
      {
        file: 'src/components/message/blocks/LiveArtifactInteractionFrame.tsx',
        snippets: ['This field is required.', "'Continue'"],
      },
      {
        file: 'src/components/message/code/InlineCode.tsx',
        snippets: ['Click to copy', 'Copied!'],
      },
      {
        file: 'src/components/chat/message-list/text-selection/StandardActionsView.tsx',
        snippets: ['Read Aloud (TTS)'],
      },
      {
        file: 'src/components/modals/create-file/useCreateFileEditor.ts',
        snippets: ['Error generating PDF.'],
      },
      {
        file: 'src/hooks/ui/useHtmlPreviewModal.ts',
        snippets: ['Sorry, the screenshot could not be captured. Please check the console for errors.'],
      },
      {
        file: 'src/utils/screenCapture.ts',
        snippets: ['Your browser does not support screen capture.', 'Could not start screen capture:'],
      },
      {
        file: 'src/utils/export/image.ts',
        snippets: [
          'Export failed: The image is too large for the browser to handle. Please try exporting as HTML or Text.',
          'Export failed:',
        ],
      },
      {
        file: 'src/components/settings/sections/appearance/InterfaceToggles.tsx',
        snippets: [
          'Desktop notifications are not supported by your browser.',
          'Notifications are blocked by your browser. Please enable them in your browser settings to use this feature.',
        ],
      },
      {
        file: 'src/hooks/chat-input/useFilePreProcessingEffects.ts',
        snippets: ['Failed to capture screenshot.', 'Processing folder...', 'Failed to process folder structure.'],
      },
      {
        file: 'src/components/message/buttons/export/useMessageExport.ts',
        snippets: ['Exported Message', 'Message Export', "language: 'en'", 'USER', 'ASSISTANT', 'N/A'],
      },
      {
        file: 'src/hooks/chat-input/useChatInputClipboard.ts',
        snippets: ['Invalid YouTube URL provided.'],
      },
      {
        file: 'src/hooks/chat-input/useChatInputFileUi.ts',
        snippets: ['Failed to read text file content.'],
      },
      {
        file: 'src/hooks/data-management/useDataImport.ts',
        snippets: [' Error: '],
      },
      {
        file: 'src/hooks/core/useModels.ts',
        snippets: ['Failed to load default models'],
      },
      {
        file: 'src/hooks/token-count/useTokenCountLogic.ts',
        snippets: ['Failed to calculate tokens'],
      },
      {
        file: 'src/hooks/ui/usePdfViewer.ts',
        snippets: ['Failed to load PDF.'],
      },
      {
        file: 'src/components/message/blocks/GraphvizBlock.tsx',
        snippets: ['Failed to render Graphviz diagram.', 'Failed to export diagram.'],
      },
      {
        file: 'src/components/message/blocks/MermaidBlock.tsx',
        snippets: ['Failed to render Mermaid diagram.', 'Failed to export diagram as JPG.'],
      },
      {
        file: 'src/hooks/chat-input/useChatInputTranslation.ts',
        snippets: ['Translation failed.'],
      },
      {
        file: 'src/components/message/buttons/export/useMessageExport.ts',
        snippets: ['Could not find message content in DOM. Please ensure the message is visible.'],
      },
      {
        file: 'src/features/message-sender/useApiErrorHandler.ts',
        snippets: ['An unknown error occurred.', 'API key is not configured in settings.'],
      },
      {
        file: 'src/features/message-sender/ttsStrategy.ts',
        snippets: ['TTS Error', 'Audio Ready'],
      },
      {
        file: 'src/features/message-sender/imageEditStrategy.ts',
        snippets: [
          'Image Edit Error',
          'No image was generated for this request.',
          'Request failed. Error:',
          'Some images may have been blocked',
          'Some image requests may have failed.',
          '[Error: Image generation failed',
        ],
      },
      {
        file: 'src/utils/chat/reasoning.ts',
        snippets: ['Raw Thinking Process'],
      },
      {
        file: 'src/hooks/data-management/useDataImport.ts',
        snippets: [
          'Invalid file format. Expected type:',
          'History data is missing or not an array.',
          'Scenarios data is missing or not an array.',
        ],
      },
      {
        file: 'src/components/sidebar/useHistorySidebarLogic.ts',
        snippets: ["'Today'", "'Yesterday'", "'Previous 7 Days'", "'Previous 30 Days'"],
      },
      {
        file: 'src/components/sidebar/SessionItemMenu.tsx',
        snippets: ['Export Chat'],
      },
      {
        file: 'src/components/sidebar/SidebarActions.tsx',
        snippets: ['Create new group', 'New Group'],
      },
      {
        file: 'src/components/scenarios/editor/ScenarioEditorHeader.tsx',
        snippets: ['Scenario Title', '> Back<'],
      },
      {
        file: 'src/components/scenarios/ScenarioItem.tsx',
        snippets: ["'View'", 'No preview available', '>Prompt<'],
      },
      {
        file: 'src/hooks/scenarios/useScenarioManager.ts',
        snippets: ['Scenario deleted.'],
      },
      {
        file: 'src/hooks/chat/history/useGroupActions.ts',
        snippets: ['Untitled'],
      },
      {
        file: 'src/components/chat/input/actions/ComposerMoreMenu.tsx',
        snippets: ['More input actions'],
      },
      {
        file: 'src/components/chat/input/area/ChatQuoteDisplay.tsx',
        snippets: ['Remove quote'],
      },
      {
        file: 'src/components/modals/token-count/TokenCountFooter.tsx',
        snippets: ['Estimated Cost', '>tokens<', 'Ready to calculate', 'Clear All'],
      },
      {
        file: 'src/components/chat/input/area/ChatTextArea.tsx',
        snippets: ['aria-label="Chat message input"'],
      },
      {
        file: 'src/hooks/chat/actions/useModelSelection.ts',
        snippets: ['textarea[aria-label="Chat message input"]'],
      },
      {
        file: 'src/hooks/chat/history/useSessionLoader.ts',
        snippets: ['textarea[aria-label="Chat message input"]'],
      },
      {
        file: 'src/hooks/chat/message/useMessageActions.ts',
        snippets: ['textarea[aria-label="Chat message input"]'],
      },
      {
        file: 'src/hooks/app/useAppPromptModes.ts',
        snippets: ['textarea[aria-label="Chat message input"]'],
      },
      {
        file: 'src/hooks/core/useAppEvents.ts',
        snippets: ["getAttribute('aria-label') === 'Chat message input'"],
      },
      {
        file: 'src/components/modals/file-config/FileConfigHeader.tsx',
        snippets: ["|| 'File Configuration'"],
      },
      {
        file: 'src/components/modals/file-config/ResolutionConfig.tsx',
        snippets: [
          "|| 'Token Resolution'",
          "|| 'Resolution'",
          'Specific resolution for this file. Overrides global settings.',
        ],
      },
      {
        file: 'src/components/settings/sections/GenerationSection.tsx',
        snippets: [
          'Limits sampling to the K most probable tokens. Gemma 4 recommends 64. Set to 0 to disable.',
          'Controls video/audio resolution for Live API.',
        ],
      },
      {
        file: 'src/components/message/content/thoughts/ThinkingHeader.tsx',
        snippets: ['Thought Process'],
      },
      {
        file: 'src/hooks/live-api/useLiveConnection.ts',
        snippets: [
          "setTranslationError('liveStatusConnectionLostRetryFailed', 'Connection lost. Please try again.')",
          "setTranslationError('liveStatusReconnectingAttempt', 'Connection lost. Reconnecting... ({attempt}/{maxRetries})'",
          "setTranslationError('liveStatusRefreshing', 'Refreshing live session...')",
          "setTranslationError('liveStatusConnectionError', 'Connection error')",
          "setTranslationError('liveStatusMissingApiKey', 'Live API requires a browser API key.')",
          "setTranslationError('liveStatusFailedToStart', 'Failed to start session')",
        ],
      },
      {
        file: 'src/hooks/file-upload/useFilePreProcessing.ts',
        snippets: [
          '`Processing ${file.name}...`',
          '`Extracting text from ${file.name}...`',
          '`Compressing ${file.name}...`',
        ],
      },
      {
        file: 'src/hooks/file-upload/useFileDragDrop.ts',
        snippets: ['Processing dropped files...'],
      },
      {
        file: 'src/hooks/file-upload/useFilePolling.ts',
        snippets: ['File processing timed out.', 'Backend processing failed.'],
      },
      {
        file: 'src/utils/file-upload/uploadFileItem.ts',
        snippets: [
          'Unsupported file type:',
          'API key was not available for file upload.',
          'Starting...',
          'File API processing failed',
          'Upload failed:',
          'Upload cancelled by user.',
        ],
      },
      {
        file: 'src/hooks/file-upload/useFileUploader.ts',
        snippets: ["'Upload cancelled.'"],
      },
      {
        file: 'src/hooks/core/useRecorder.ts',
        snippets: ['Could not start recording. Please check permissions.'],
      },
      {
        file: 'src/hooks/chat-input/useVoiceInput.ts',
        snippets: ['Voice input failed:'],
      },
      {
        file: 'src/hooks/chat/actions/useAudioActions.ts',
        snippets: ['An unknown error occurred.', 'setAppFileError(`Transcription failed:'],
      },
      {
        file: 'src/hooks/ui/useHtmlPreviewModal.ts',
        snippets: ["let title = 'HTML Preview'"],
      },
      {
        file: 'src/hooks/ui/useCodeBlock.ts',
        snippets: ["let displayTitle = 'HTML Preview'"],
      },
      {
        file: 'src/components/message/blocks/GraphvizBlock.tsx',
        snippets: ['Graphviz Diagram', 'Toggle Layout (Current:'],
      },
      {
        file: 'src/components/message/blocks/MermaidBlock.tsx',
        snippets: ['Mermaid Diagram'],
      },
      {
        file: 'src/hooks/scenarios/useScenarioManager.ts',
        snippets: ['Scenario title cannot be empty.', ' (Copy)'],
      },
      {
        file: 'src/hooks/chat/history/useSessionActions.ts',
        snippets: [' (Copy)'],
      },
      {
        file: 'src/components/message/MessageActions.tsx',
        snippets: ['alt="Assistant avatar"'],
      },
      {
        file: 'src/components/shared/AudioPlayer.tsx',
        snippets: ['"Pause"', '"Play"', '"Playback Speed"', '"Download Audio"'],
      },
      {
        file: 'src/features/message-sender/useChatStreamHandler.ts',
        snippets: ['The model returned no reply (only reasoning was produced).', '模型没有返回任何回答'],
      },
      {
        file: 'src/features/message-sender/useMessageSender.ts',
        snippets: [
          '"Wait for files to finish processing."',
          '"This image model supports image attachments only."',
          '"Imagen models support text prompts only."',
          '"This model does not support file attachments."',
          "'No model selected.'",
          '"API Key Error"',
        ],
      },
      {
        file: 'src/hooks/file-upload/useFileIdAdder.ts',
        snippets: ["'File API processing failed'", "'File not found.'", "'API key not configured.'", "'Fetch error'"],
      },
    ];

    protectedStrings.forEach(({ file, snippets }) => {
      const source = readProjectFile(file);

      snippets.forEach((snippet) => {
        expect(source).not.toContain(snippet);
      });
    });
  });

  it('every key has every supported language', async () => {
    await ensureAllFeatureTranslations();
    const missing = Object.entries(translations).flatMap(([key, value]) =>
      SUPPORTED_LANGUAGES.filter((lang) => !(value as Record<string, string>)[lang]).map((lang) => `${key}:${lang}`),
    );
    expect(missing).toEqual([]);
  });

  it('does not miss any language for any key', async () => {
    await ensureAllFeatureTranslations();
    const missing = Object.entries(translations).flatMap(([key, value]) =>
      SUPPORTED_LANGUAGES.filter((lang) => !(value as Record<string, string>)[lang]).map((lang) => `${key}:${lang}`),
    );
    expect(missing).toEqual([]);
  });

  it('defines translations for every t() key used in source files', async () => {
    await ensureAllFeatureTranslations();
    const sourceFiles = ['src/components', 'src/features', 'src/hooks', 'src/utils'];

    const collectFiles = (dir: string): string[] =>
      fs.readdirSync(path.join(projectRoot, dir), { withFileTypes: true }).flatMap((entry) => {
        const relativePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(relativePath);
        }
        if (!relativePath.endsWith('.ts') && !relativePath.endsWith('.tsx')) {
          return [];
        }
        if (relativePath.includes('.test.') || relativePath.includes('__tests__')) {
          return [];
        }
        return [relativePath];
      });

    const usedKeys = new Set<string>();
    const keyPattern = /\bt\('([^']+)'/g;

    sourceFiles.flatMap(collectFiles).forEach((file) => {
      const source = readProjectFile(file);
      let match: RegExpExecArray | null;

      while ((match = keyPattern.exec(source)) !== null) {
        usedKeys.add(match[1]);
      }
    });

    usedKeys.forEach((key) => {
      expect(translations).toHaveProperty(key);
    });
  });
});
