import { describe, expect, it } from 'vitest';
import { readSourceFile } from './projectFiles';

describe('UI clarity regressions', () => {
  it('keeps popup menus free of zoom-based entry transforms', () => {
    const popupFiles = [
      'components/shared/Select.tsx',
      'components/chat/input/AttachmentMenu.tsx',
      'components/chat/input/ToolsMenu.tsx',
      'components/message/blocks/TableBlock.tsx',
      'components/message/code/InlineCode.tsx',
      'components/modals/HelpModal.tsx',
      'components/modals/AudioRecorder.tsx',
      'components/modals/create-file/CreateTextFileEditor.tsx',
      'components/modals/create-file/CreateFileBody.tsx',
      'components/message/content/thoughts/ThinkingActions.tsx',
      'components/settings/controls/model-selector/ModelListView.tsx',
    ];

    for (const relativePath of popupFiles) {
      const source = readSourceFile(relativePath);

      expect(source).not.toContain('zoom-in');
      expect(source).not.toContain('zoom-in-95');
    }
  });

  it('keeps tooltip and small floating controls off scale transforms', () => {
    const tooltipStyles = readSourceFile('styles/main.css');
    const selectedFileDisplay = readSourceFile('components/chat/input/files/SelectedFileDisplay.tsx');
    const sessionItem = readSourceFile('components/sidebar/SessionItem.tsx');
    const codeBlock = readSourceFile('components/message/blocks/CodeBlock.tsx');

    expect(tooltipStyles).not.toContain('translateX(-50%) scale(0.95)');
    expect(tooltipStyles).not.toContain('translateX(-50%) scale(1)');
    expect(selectedFileDisplay).not.toContain('scale-90 hover:scale-100');
    expect(sessionItem).not.toContain('scale-95 bg-[var(--theme-bg-tertiary)]');
    expect(codeBlock).not.toContain('group-hover/expand:scale-105');
  });

  it('avoids heavy backdrop blur on compact floating toolbars and affordances', () => {
    const files = [
      'components/shared/file-preview/FloatingToolbar.tsx',
      'components/chat/input/area/ChatSuggestions.tsx',
      'components/chat/input/files/SelectedFileDisplay.tsx',
      'components/pwa/PwaUpdateBanner.tsx',
      'components/message/blocks/CodeBlock.tsx',
      'components/message/blocks/TableBlock.tsx',
      'components/modals/HelpModal.tsx',
      'components/message/blocks/parts/DiagramWrapper.tsx',
      'components/scenarios/PreloadedMessagesModal.tsx',
      'components/message/blocks/parts/CodeHeader.tsx',
      'components/chat/overlays/DragDropOverlay.tsx',
      'components/scenarios/editor/ScenarioMessageInput.tsx',
      'components/chat/message-list/ScrollNavigation.tsx',
      'components/message/FileDisplay.tsx',
      'components/shared/file-preview/pdf-viewer/PdfSidebar.tsx',
      'components/shared/file-preview/pdf-viewer/PdfMainContent.tsx',
      'components/shared/file-preview/TextFileViewer.tsx',
      'components/modals/FilePreviewModal.tsx',
      'components/chat/input/LiveStatusBanner.tsx',
      'components/chat/input/QueuedSubmissionCard.tsx',
      'components/chat/message-list/text-selection/AudioPlayerView.tsx',
      'components/modals/MarkdownPreviewModal.tsx',
    ];

    for (const relativePath of files) {
      const source = readSourceFile(relativePath);

      expect(source).not.toContain('backdrop-blur-xl');
      expect(source).not.toContain('backdrop-blur-md');
      expect(source).not.toContain('backdrop-blur-sm');
    }
  });

  it('keeps diagram blocks visually aligned with code blocks', () => {
    const codeBlock = readSourceFile('components/message/blocks/CodeBlock.tsx');
    const codeHeader = readSourceFile('components/message/blocks/parts/CodeHeader.tsx');
    const diagramWrapper = readSourceFile('components/message/blocks/parts/DiagramWrapper.tsx');

    expect(codeBlock).toContain('border border-[var(--theme-border-primary)]');
    expect(codeBlock).toContain('bg-[var(--theme-bg-code-block)]');
    expect(codeHeader).toContain('bg-[var(--theme-bg-code-block-header)]');

    expect(diagramWrapper).toContain('border border-[var(--theme-border-primary)]');
    expect(diagramWrapper).toContain('bg-[var(--theme-bg-code-block)]');
    expect(diagramWrapper).toContain('bg-[var(--theme-bg-code-block-header)]');
    expect(diagramWrapper).not.toContain('border-[var(--theme-border-secondary)] border-b-0');
    expect(diagramWrapper).not.toContain('bg-[var(--theme-bg-tertiary)]/45');
  });

  it('insets only user message bubbles from the history sidebar', () => {
    const layout = readSourceFile('constants/layout.ts');
    const messageList = readSourceFile('components/chat/message-list/MessageList.tsx');
    const message = readSourceFile('components/message/Message.tsx');

    expect(layout).toContain("CHAT_USER_MESSAGE_INSET_CLASS = 'ml-12 sm:ml-16 md:ml-20'");
    expect(layout).not.toContain('CHAT_MESSAGE_LIST_GUTTER_CLASS');
    expect(messageList).toContain('px-1.5 sm:px-2 md:px-3');
    expect(messageList).not.toContain('CHAT_MESSAGE_LIST_GUTTER_CLASS');
    expect(message).toContain('CHAT_USER_MESSAGE_INSET_CLASS');
  });

  it('uses dynamic viewport height for the app root to avoid mobile browser chrome jumps', () => {
    const mainStyles = readSourceFile('styles/main.css');

    expect(mainStyles).toContain('height: 100dvh;');
    expect(mainStyles).toContain('@supports not (height: 100dvh)');
  });

  it('keeps virtualized code blocks from animating height changes while scrolling', () => {
    const codeBlock = readSourceFile('components/message/blocks/CodeBlock.tsx');

    expect(codeBlock).not.toContain("transition: 'max-height");
    expect(codeBlock).not.toContain('transition: max-height');
  });

  it('uses valid Tailwind focus-visible variants for keyboard focus rings', () => {
    const files = [
      'components/header/HeaderModelSelector.tsx',
      'components/sidebar/sidebarStyles.ts',
      'components/modals/FilePreviewModal.tsx',
    ];

    for (const relativePath of files) {
      expect(readSourceFile(relativePath)).not.toContain('focus:visible');
    }
  });

  it('keeps faux clickable controls on native buttons or explicit keyboard semantics', () => {
    const messageActions = readSourceFile('components/message/MessageActions.tsx');
    const toolsMenu = readSourceFile('components/chat/input/ToolsMenu.tsx');
    const toggleItem = readSourceFile('components/shared/ToggleItem.tsx');
    const apiConfigToggle = readSourceFile('components/settings/sections/api-config/ApiConfigToggle.tsx');

    expect(messageActions).not.toContain('group/avatar cursor-pointer" onClick=');
    expect(messageActions).toContain('<button');
    expect(toolsMenu).not.toContain('role="button"');
    expect(toolsMenu).toContain('<button');
    expect(toggleItem).toContain('onKeyDown');
    expect(apiConfigToggle).toContain('onKeyDown');
  });

  it('keeps remaining chrome surfaces off marketplace lift, rainbow icons, and hardcoded shells', () => {
    const exportOptions = readSourceFile('components/message/buttons/export/ExportOptions.tsx');
    const exportDialogShell = readSourceFile('components/message/buttons/export/ExportDialogShell.tsx');
    const exportModal = readSourceFile('components/message/buttons/export/ExportModal.tsx');
    const exportChatModal = readSourceFile('components/modals/ExportChatModal.tsx');
    const about = readSourceFile('components/settings/sections/AboutSection.tsx');
    const pwaBanner = readSourceFile('components/pwa/PwaUpdateBanner.tsx');
    const helpModal = readSourceFile('components/modals/HelpModal.tsx');
    const slashMenu = readSourceFile('components/chat/input/SlashCommandMenu.tsx');
    const apiUsage = readSourceFile('components/log-viewer/ApiUsageTab.tsx');
    const usageOverview = readSourceFile('components/log-viewer/UsageOverviewTab.tsx');
    const tokenUsage = readSourceFile('components/log-viewer/TokenUsageTab.tsx');
    const logViewer = readSourceFile('components/log-viewer/LogViewer.tsx');

    expect(exportOptions).not.toContain('hover:-translate-y');
    expect(exportOptions).not.toContain('lg:grid-cols-4');
    expect(exportOptions).not.toContain('text-green-500');
    expect(exportDialogShell).toContain('text-[var(--theme-text-primary)]');
    expect(exportDialogShell).not.toContain('text-[var(--theme-text-link)]');
    expect(exportDialogShell).toContain('max-w-sm');
    expect(exportDialogShell).not.toContain('max-w-lg');
    expect(exportModal).toContain('ExportDialogShell');
    expect(exportModal).not.toContain('text-[var(--theme-text-link)]');
    expect(exportChatModal).toContain('ExportDialogShell');
    expect(exportChatModal).not.toContain('text-[var(--theme-text-link)]');

    expect(about).not.toContain('hover:-translate-y');
    expect(about).not.toContain('#24292F');
    expect(about).not.toContain('bg-gradient-to-r');
    expect(about).not.toContain('animate-ping');

    expect(pwaBanner).not.toContain('bg-slate-950');
    expect(pwaBanner).not.toContain('bg-cyan-400');
    expect(pwaBanner).toContain('--theme-bg-primary');

    expect(helpModal).not.toContain('w-10 h-10');
    expect(helpModal).toContain('type="search"');
    expect(slashMenu).not.toContain('tracking-widest');
    expect(slashMenu).not.toContain('w-1 h-6');
    expect(slashMenu).not.toContain('shadow-2xl');

    expect(apiUsage).not.toContain('lg:grid-cols-3');
    expect(apiUsage).not.toContain('bg-green-900');
    expect(usageOverview).not.toContain('xl:grid-cols-6');
    expect(usageOverview).not.toContain('rounded-2xl');
    expect(tokenUsage).not.toContain('text-[var(--theme-text-link)]');
    expect(logViewer).not.toContain('h-[95vh]');
    expect(logViewer).toContain('sm:h-[85vh]');
    expect(logViewer).toContain('sm:max-h-[800px]');
  });

  it('keeps composer, token, live, and leftover chrome off rainbow palettes', () => {
    const liveControls = readSourceFile('components/chat/input/actions/LiveControls.tsx');
    const fileThumbnail = readSourceFile('components/chat/input/files/FileThumbnail.tsx');
    const toolsMenu = readSourceFile('components/chat/input/ToolsMenu.tsx');
    const tokenFooter = readSourceFile('components/modals/token-count/TokenCountFooter.tsx');
    const tokenModal = readSourceFile('components/modals/TokenCountModal.tsx');
    const audioRecorder = readSourceFile('components/modals/AudioRecorder.tsx');
    const liveBanner = readSourceFile('components/chat/input/LiveStatusBanner.tsx');
    const queuedCard = readSourceFile('components/chat/input/QueuedSubmissionCard.tsx');
    const audioPlayer = readSourceFile('components/chat/message-list/text-selection/AudioPlayerView.tsx');
    const safety = readSourceFile('components/settings/sections/SafetySection.tsx');
    const mediaResolution = readSourceFile('components/chat/input/toolbar/MediaResolutionSelector.tsx');
    const codeHeader = readSourceFile('components/message/blocks/parts/CodeHeader.tsx');
    const tableBlock = readSourceFile('components/message/blocks/TableBlock.tsx');
    const createFileHeader = readSourceFile('components/modals/create-file/CreateFileHeader.tsx');
    const settingsSidebar = readSourceFile('components/settings/SettingsSidebar.tsx');
    const htmlPreviewHeader = readSourceFile('components/modals/html-preview/HtmlPreviewHeader.tsx');
    const contextUrls = readSourceFile('components/message/grounded-response/ContextUrls.tsx');
    const searchSources = readSourceFile('components/message/grounded-response/SearchSources.tsx');
    const mapsWidget = readSourceFile('components/message/grounded-response/MapsWidget.tsx');
    const logColors = readSourceFile('components/log-viewer/logColorClasses.ts');
    const collapsedRecent = readSourceFile('components/sidebar/CollapsedRecentChatsButton.tsx');
    const markdownPreview = readSourceFile('components/modals/MarkdownPreviewModal.tsx');
    const filePreview = readSourceFile('components/modals/FilePreviewModal.tsx');
    const openaiModels = readSourceFile(
      'components/settings/sections/api-config/OpenAICompatibleCurrentModelsPanel.tsx',
    );
    const pdfMain = readSourceFile('components/shared/file-preview/pdf-viewer/PdfMainContent.tsx');

    expect(liveControls).not.toContain('text-purple-500');
    expect(liveControls).not.toContain('text-red-500');
    expect(liveControls).not.toContain('animate-pulse');
    expect(liveControls).toContain('theme-icon-settings');
    expect(liveControls).toContain('theme-text-danger');

    expect(fileThumbnail).not.toContain('purple-950');
    expect(fileThumbnail).not.toContain('cyan-950');
    expect(fileThumbnail).not.toContain('cyan-200');
    expect(fileThumbnail).toContain('theme-bg-code-block');

    expect(toolsMenu).not.toContain('bg-blue-500/10');
    expect(toolsMenu).not.toContain('group-hover:scale-75');
    expect(toolsMenu).not.toContain('group-hover:-rotate-90');
    expect(toolsMenu).toContain('theme-bg-accent');

    expect(tokenFooter).not.toContain('text-2xl');
    expect(tokenFooter).not.toContain('theme-text-link');
    expect(tokenFooter).toContain('SETTINGS_PRIMARY_ACTION_BUTTON_CLASS');
    expect(tokenModal).not.toContain('theme-text-link');

    expect(audioRecorder).not.toContain('amber-50');
    expect(audioRecorder).not.toContain('dark:amber');
    expect(audioRecorder).not.toContain('tracking-widest');
    expect(audioRecorder).not.toContain('theme-text-link');
    expect(audioRecorder).toContain('theme-text-warning');

    expect(liveBanner).not.toContain('bg-blue-500');
    expect(liveBanner).toContain('theme-bg-accent');

    expect(queuedCard).not.toContain('rgba(15,23,42');
    expect(queuedCard).toContain('COMPOSER_SHELL_RADIUS_CLASS');

    expect(audioPlayer).not.toContain('ring-white/10');
    expect(audioPlayer).toContain('shadow-premium');

    expect(safety).not.toContain('text-red-500');
    expect(safety).not.toContain('text-orange-500');
    expect(safety).not.toContain('text-green-500');
    expect(mediaResolution).not.toContain('text-blue-500');
    expect(mediaResolution).not.toContain('text-amber-500');
    expect(codeHeader).not.toContain('text-emerald-500');
    expect(tableBlock).not.toContain('text-blue-500');
    expect(createFileHeader).not.toContain('theme-text-link');
    expect(settingsSidebar).not.toContain('theme-text-link');
    expect(htmlPreviewHeader).not.toContain('orange-500');

    expect(contextUrls).not.toContain('text-green-500');
    expect(contextUrls).not.toContain('tracking-widest');
    expect(searchSources).not.toContain('tracking-widest');
    expect(mapsWidget).not.toContain('tracking-widest');
    expect(mapsWidget).not.toContain('rounded-2xl');

    expect(logColors).not.toContain('purple-900');
    expect(logColors).not.toContain('text-blue-400');
    expect(logColors).toContain('theme-text-danger');

    expect(collapsedRecent).not.toContain('rounded-2xl');
    expect(markdownPreview).not.toContain('rounded-2xl');
    expect(markdownPreview).not.toContain('hover:text-red-500');
    expect(filePreview).not.toContain('bg-white/15');
    expect(openaiModels).toContain('SETTINGS_SEARCH_INPUT_CLASS');
    expect(pdfMain).not.toContain('tracking-widest');
  });
});
