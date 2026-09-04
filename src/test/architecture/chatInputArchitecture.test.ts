import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { projectRoot, readProjectFile } from './projectFiles';

describe('chat input architecture guardrails', () => {
  it('avoids writing input text twice in the chat input change handler', () => {
    const source = readProjectFile('src/hooks/chat-input/useChatInput.ts');

    expect(source).not.toMatch(
      /slashCommandState\.handleInputChange\(event\.target\.value\);\s*setInputText\(event\.target\.value\);/s,
    );
  });

  it('keeps chat input orchestration delegated to focused hooks', () => {
    const source = readProjectFile('src/hooks/chat-input/useChatInput.ts');
    const submissionSource = readProjectFile('src/hooks/chat-input/useChatInputSubmission.ts');
    const chatInputProviderSource = readProjectFile('src/components/chat/input/ChatInputProvider.tsx');
    const chatTextAreaSource = readProjectFile('src/components/chat/input/area/ChatTextArea.tsx');
    const chatAreaSource = readProjectFile('src/components/layout/useChatArea.ts');

    expect(source).toContain('useChatInputCore');
    expect(source).toContain('useChatInputFile');
    expect(source).toContain('useChatInputSubmission');
    expect(submissionSource).toContain('useLiveModeHandler');
    expect(source).toContain('useChatInputClipboard');
    expect(source).toContain('useChatInputKeyboard');
    expect(source).not.toContain('isComposingRef.current =');
    expect(source.length).toBeLessThan(11000);
    expect(chatInputProviderSource).toContain("from '@/hooks/chat-input/useChatInput'");
    expect(chatInputProviderSource).toContain("from './chatInputTextAreaMetrics'");
    expect(chatTextAreaSource).toContain("from '@/components/chat/input/chatInputTextAreaMetrics'");
    expect(chatAreaSource).toContain("from '@/hooks/chat-input/useChatInputHeight'");
  });

  it('keeps composer state subscribed at the consumer instead of relaying it through ChatArea context', () => {
    const chatAreaSource = readProjectFile('src/components/layout/ChatArea.tsx');
    const chatInputCoreSource = readProjectFile('src/hooks/chat-input/useChatInputCore.ts');
    const runtimeContextSource = readProjectFile('src/components/layout/chat-runtime/ChatRuntimeContext.tsx');

    expect(fs.existsSync(path.join(projectRoot, 'src/contexts/ChatAreaContext.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/layout/chat-area/ChatAreaContext.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/layout/chat-area/ChatAreaProps.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/ChatInputViewContext.tsx'))).toBe(false);
    expect(chatAreaSource).not.toContain('ChatAreaProvider');
    expect(chatAreaSource).not.toContain('providerValue');
    expect(readProjectFile('src/components/chat/input/ChatInput.tsx')).not.toContain('ChatInputViewProvider');
    expect(chatInputCoreSource).toContain("from '@/stores/chatStore'");
    expect(chatInputCoreSource).toContain("from '@/stores/settingsStore'");
    expect(chatInputCoreSource).toContain('useChatInputRuntime');
    expect(runtimeContextSource).toContain('ChatInputRuntimeContext');
  });

  it('passes chat input tool state through the input context while keeping registry-based tool menus', () => {
    const chatTypesSource = readProjectFile('src/types/chat.ts');
    const chatInputActionsSource = readProjectFile('src/components/chat/input/ChatInputActions.tsx');
    const toolsMenuSource = readProjectFile('src/components/chat/input/ToolsMenu.tsx');
    const slashCommandsSource = readProjectFile('src/hooks/chat-input/useSlashCommands.ts');
    const mainContentViewModelSource = readProjectFile('src/components/layout/useMainContentViewModel.ts');
    const chatAreaSource = readProjectFile('src/components/layout/ChatArea.tsx');
    const chatInputCoreSource = readProjectFile('src/hooks/chat-input/useChatInputCore.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/contexts/ChatAreaContext.tsx'))).toBe(false);
    expect(chatAreaSource).not.toContain('toolStates:');
    expect(chatAreaSource).not.toContain('useChatInputToolStates');
    expect(mainContentViewModelSource).not.toContain('toolStates: {');
    expect(chatInputCoreSource).toContain('useChatInputToolStates');
    expect(chatTypesSource).not.toContain('toolStates: ChatToolToggleStates;');
    expect(chatInputActionsSource).toContain('toolStates');
    expect(toolsMenuSource).toContain('getChatToolsForSurface');
    // Slash commands share the same registry AND the same availability gates
    // (model capabilities + provider routing) as the tools menu.
    expect(slashCommandsSource).toContain('getChatToolsForSurface');

    for (const source of [chatTypesSource, toolsMenuSource]) {
      expect(source).not.toContain('isGoogleSearchEnabled: boolean;');
      expect(source).not.toContain('onToggleGoogleSearch: () => void;');
      expect(source).not.toContain('isCodeExecutionEnabled: boolean;');
      expect(source).not.toContain('onToggleCodeExecution: () => void;');
      expect(source).not.toContain('isUrlContextEnabled: boolean;');
      expect(source).not.toContain('onToggleUrlContext: () => void;');
      expect(source).not.toContain('isDeepSearchEnabled: boolean;');
      expect(source).not.toContain('onToggleDeepSearch: () => void;');
    }
  });

  it('keeps chat input shared state in context instead of repeating leaf subscriptions', () => {
    const chatTypesSource = readProjectFile('src/types/chat.ts');
    const chatInputSource = readProjectFile('src/components/chat/input/ChatInput.tsx');
    const chatInputAreaSource = readProjectFile('src/components/chat/input/ChatInputArea.tsx');
    const chatInputToolbarSource = readProjectFile('src/components/chat/input/ChatInputToolbar.tsx');
    const chatInputActionsSource = readProjectFile('src/components/chat/input/ChatInputActions.tsx');
    const chatInputProviderSource = readProjectFile('src/components/chat/input/ChatInputProvider.tsx');

    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/ChatInputViewModel.ts'))).toBe(false);
    expect(chatTypesSource).not.toContain('ChatInputToolbarProps');
    expect(chatTypesSource).not.toContain('ChatInputActionsProps');
    expect(chatInputSource).not.toContain('toolbarProps');
    expect(chatInputSource).not.toContain('actionsProps');
    expect(chatInputSource).not.toContain('areaProps');
    expect(chatInputSource).not.toContain('ChatInputViewModel');
    expect(chatInputAreaSource).not.toContain('view })');
    expect(chatInputAreaSource).not.toContain('view.');

    expect(chatInputProviderSource).toContain('toolStates: logic.chatInput.toolStates');
    expect(chatInputProviderSource).toContain('currentChatSettings: logic.chatInput.currentChatSettings');
    expect(chatInputProviderSource).toContain('capabilities: logic.capabilities');

    for (const [relativePath, source] of [
      ['src/components/chat/input/ChatInputToolbar.tsx', chatInputToolbarSource],
      ['src/components/chat/input/ChatInputActions.tsx', chatInputActionsSource],
    ] as const) {
      expect(source, relativePath).not.toContain("from '../../../stores/settingsStore'");
      expect(source, relativePath).not.toContain("from '../../../hooks/chat/useChatState'");
      expect(source, relativePath).not.toContain("from '../../../hooks/chat-input/useChatInputToolStates'");
      expect(source, relativePath).not.toContain('getCachedModelCapabilities');
      expect(source, relativePath).not.toContain('useChatInputRuntime');
    }
  });

  it('shares composer auxiliary action descriptors between inline controls and overflow menu', () => {
    const chatInputActionsSource = readProjectFile('src/components/chat/input/ChatInputActions.tsx');
    const composerAuxiliaryButtonsSource = readProjectFile(
      'src/components/chat/input/actions/ComposerAuxiliaryButtons.tsx',
    );
    const composerMoreMenuSource = readProjectFile('src/components/chat/input/actions/ComposerMoreMenu.tsx');

    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/chat/input/actions/useComposerAuxiliaryActions.tsx')),
    ).toBe(true);
    expect(chatInputActionsSource).toContain('useComposerAuxiliaryActions');

    for (const [relativePath, source] of [
      ['src/components/chat/input/actions/ComposerAuxiliaryButtons.tsx', composerAuxiliaryButtonsSource],
      ['src/components/chat/input/actions/ComposerMoreMenu.tsx', composerMoreMenuSource],
    ] as const) {
      expect(source, relativePath).not.toContain("from '../../../../stores/settingsStore'");
      expect(source, relativePath).not.toContain("from '../../../../stores/chatStore'");
      expect(source, relativePath).not.toContain('showInputTranslationButton');
      expect(source, relativePath).not.toContain('showInputPasteButton');
      expect(source, relativePath).not.toContain('showInputClearButton');
    }
  });

  it('uses shared chat input context fixtures in leaf control tests', () => {
    const fixturePath = 'src/test/chat-input/contextFixtures.ts';

    expect(fs.existsSync(path.join(projectRoot, fixturePath))).toBe(true);
    const fixtureSource = readProjectFile(fixturePath);
    expect(fixtureSource).toContain('createChatInputActionsContextValue');
    expect(fixtureSource).toContain('createChatInputComposerStatusContextValue');

    for (const [relativePath, expectedImport] of [
      ['src/components/chat/input/AttachmentMenu.test.tsx', "from '@/test/chat-input/contextFixtures'"],
      ['src/components/chat/input/actions/SendControls.test.tsx', "from '@/test/chat-input/contextFixtures'"],
      ['src/components/chat/input/ChatInputActions.test.tsx', "from '@/test/chat-input/contextFixtures'"],
    ] as const) {
      const source = readProjectFile(relativePath);

      expect(source, relativePath).toContain(expectedImport);
      expect(source, relativePath).not.toContain('const actionsContextValue: ChatInputActionsContextValue =');
      expect(source, relativePath).not.toContain('const baseActionsContext: ChatInputActionsContextValue =');
      expect(source, relativePath).not.toContain('const createActionsContextValue =');
    }
  });

  it('keeps full composer behavior tests on the shared chat input harness', () => {
    const harnessPath = 'src/test/chat-input/harness.tsx';
    const chatInputTestSource = readProjectFile('src/components/chat/input/ChatInput.test.tsx');

    expect(fs.existsSync(path.join(projectRoot, harnessPath))).toBe(true);
    expect(chatInputTestSource).toContain("from '@/test/chat-input/harness'");
    expect(chatInputTestSource).not.toContain("vi.mock('./ChatInputArea'");
    expect(chatInputTestSource).not.toContain('const mockChatStoreState = vi.hoisted');
  });

  it('shares temporary processing file placeholders across upload flows', () => {
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/file-upload/fileUploadPolicy.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/hooks/file-upload/utils.ts'))).toBe(false);

    const helperSource = readProjectFile('src/utils/file-upload/fileUploadPolicy.ts');
    expect(helperSource).toContain('createProcessingPlaceholderFile');

    for (const relativePath of [
      'src/hooks/file-upload/useFilePreProcessing.ts',
      'src/hooks/chat-input/useFilePreProcessingEffects.ts',
      'src/hooks/file-upload/useFileDragDrop.ts',
      'src/hooks/file-upload/useFileIdAdder.ts',
      'src/utils/file-upload/uploadFileItem.ts',
    ] as const) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).toContain('createProcessingPlaceholderFile');
      expect(source, relativePath).not.toMatch(/isProcessing:\s*true,\s*\n\s*uploadState:/);
    }
  });

  it('keeps file upload orchestration inside the file-upload hook boundary', () => {
    const chatHookSource = readProjectFile('src/hooks/chat/useChat.ts');

    for (const relativePath of [
      'src/hooks/file-upload/useFileDragDrop.ts',
      'src/hooks/file-upload/useFileHandling.ts',
      'src/hooks/file-upload/useFilePolling.ts',
      'src/hooks/file-upload/useFilePolling.test.tsx',
      'src/hooks/file-upload/useFileUpload.ts',
      'src/hooks/file-upload/useFileUpload.test.tsx',
    ]) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }

    for (const relativePath of [
      'src/hooks/files/useFileDragDrop.ts',
      'src/hooks/files/useFileHandling.ts',
      'src/hooks/files/useFilePolling.ts',
      'src/hooks/files/useFilePolling.test.tsx',
      'src/hooks/files/useFileUpload.ts',
      'src/hooks/files/useFileUpload.test.tsx',
    ]) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(false);
    }

    expect(chatHookSource).toContain("from '@/hooks/file-upload/useFileHandling'");
    expect(chatHookSource).toContain("from '@/hooks/file-upload/useFileDragDrop'");
    expect(chatHookSource).not.toContain("from '@/hooks/files/");
  });

  it('shares chat tool toggle defaults across test fixtures', () => {
    const toolFixtureSource = readProjectFile('src/test/chat-tools/fixtures.ts');
    const chatAreaFixtureSource = readProjectFile('src/test/layout/fixtures.tsx');
    const chatInputFixtureSource = readProjectFile('src/test/chat-input/contextFixtures.ts');
    const toolsMenuTestSource = readProjectFile('src/components/chat/input/ToolsMenu.test.tsx');

    expect(toolFixtureSource).toContain('createChatToolToggleStates');
    expect(chatAreaFixtureSource).toContain("from '@/test/chat-tools/fixtures'");
    expect(chatInputFixtureSource).toContain("from '@/test/chat-tools/fixtures'");
    expect(toolsMenuTestSource).toContain("from '@/test/chat-tools/fixtures'");
    expect(chatAreaFixtureSource).not.toContain('const createToolStates');
    expect(chatInputFixtureSource).not.toContain('const createChatToolToggleStates');
    expect(toolsMenuTestSource).not.toContain('const createToolStates');
  });
});
