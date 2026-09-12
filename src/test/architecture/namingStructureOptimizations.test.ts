import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { countLines, listProjectSourceFilesExcept, projectRoot, readProjectFile } from './projectFiles';

const thisTestFile = 'src/test/architecture/namingStructureOptimizations.test.ts';

describe('naming and structure optimization guardrails', () => {
  it('keeps the custom Select component on an explicit prop contract', () => {
    const selectSource = readProjectFile('src/components/shared/Select.tsx');

    expect(selectSource).toContain('interface SelectProps {');
    expect(selectSource).not.toContain('SelectHTMLAttributes<HTMLSelectElement>');
    expect(selectSource).not.toContain('React.ButtonHTMLAttributes<HTMLButtonElement>');
    expect(selectSource).not.toContain('as unknown as Omit');
    expect(selectSource).not.toContain('{...buttonProps}');
  });

  it('keeps create-file editor state and constants with the create-file modal', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/components/modals/create-file/useCreateFileEditor.ts'))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/modals/create-file/createFileExtensionOptions.ts')),
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/modals/create-file/supportedFileExtensions.ts'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/modals/create-file/createFileEditorConstants.ts')),
    ).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/hooks/useCreateFileEditor.ts'))).toBe(false);
    expect(readProjectFile('src/components/modals/create-file/createFileExtensionOptions.ts')).toContain(
      'CREATE_FILE_EXTENSION_OPTIONS',
    );

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/hooks/useCreateFileEditor');
      expect(source, relativePath).not.toContain('SUPPORTED_EXTENSIONS');
    }
  });

  it('names log viewer color class maps after their visual role', () => {
    const consoleTabSource = readProjectFile('src/components/log-viewer/ConsoleTab.tsx');
    const logRowSource = readProjectFile('src/components/log-viewer/LogRow.tsx');

    expect(fs.existsSync(path.join(projectRoot, 'src/components/log-viewer/logColorClasses.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/log-viewer/constants.ts'))).toBe(false);
    expect(consoleTabSource).toContain("from './logColorClasses'");
    expect(logRowSource).toContain("from './logColorClasses'");
  });

  it('reuses the exported model capabilities contract instead of duplicating the shape', () => {
    const modelCapabilitiesSource = readProjectFile('src/utils/model/modelCapabilities.ts');
    const chatInputContextTypesSource = readProjectFile('src/components/chat/input/chatInputContextTypes.ts');
    const chatInputAvailabilitySource = readProjectFile('src/utils/chat-input/chatInputAvailability.ts');

    expect(modelCapabilitiesSource).toContain('export interface ModelCapabilities');
    expect(modelCapabilitiesSource).toContain('isImageGenerationModel');
    expect(modelCapabilitiesSource).not.toContain('isImagenModel');
    expect(modelCapabilitiesSource).not.toContain('isRealImagenModel');
    expect(modelCapabilitiesSource).not.toContain('isImageModel =');
    expect(chatInputContextTypesSource).toContain(
      "import type { ModelCapabilities } from '@/utils/model/modelCapabilities'",
    );
    expect(chatInputContextTypesSource).toContain('isImageGenerationModel: boolean;');
    expect(chatInputContextTypesSource).not.toContain('isRealImagenModel');
    expect(chatInputContextTypesSource).not.toContain('isImageModel: boolean;');
    expect(chatInputContextTypesSource).not.toContain('interface ChatInputCapabilities');
    expect(chatInputAvailabilitySource).toContain(
      "import type { ModelCapabilities } from '@/utils/model/modelCapabilities'",
    );
    expect(chatInputAvailabilitySource).not.toContain('interface ChatInputCapabilities');
  });

  it('splits TTS and image edit sender strategies by media type', () => {
    const useMessageSenderSource = readProjectFile('src/features/message-sender/useMessageSender.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/ttsStrategy.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/imageEditStrategy.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/imageGenerationStrategy.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/ttsImagenStrategy.ts'))).toBe(false);
    expect(useMessageSenderSource).toContain("from './ttsStrategy'");
    expect(useMessageSenderSource).toContain("from './imageEditStrategy'");
    expect(useMessageSenderSource).not.toContain('imageGenerationStrategy');
    expect(useMessageSenderSource).not.toContain('ttsImagenStrategy');
    expect(useMessageSenderSource).not.toContain('sendTtsImagenMessage');
  });

  it('names message sender shared contracts after their feature boundary', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/messageSenderTypes.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/features/message-sender/types.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/features/message-sender/types');
      if (relativePath.startsWith('src/features/message-sender/')) {
        expect(source, relativePath).not.toContain("from './importContextTypes'");
      }
    }
  });

  it('names composer auxiliary action buttons after their role', () => {
    const chatInputActionsSource = readProjectFile('src/components/chat/input/ChatInputActions.tsx');

    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/chat/input/actions/ComposerAuxiliaryButtons.tsx')),
    ).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/actions/UtilityControls.tsx'))).toBe(false);
    expect(chatInputActionsSource).toContain("from './actions/ComposerAuxiliaryButtons'");
    expect(chatInputActionsSource).not.toContain("from './actions/UtilityControls'");
  });

  it('names audio compression tuning values instead of leaving inline thresholds', () => {
    const audioCompressionSource = readProjectFile('src/features/audio/audioCompression.ts');

    for (const constantName of [
      'MIN_COMPRESSIBLE_AUDIO_BYTES',
      'MIN_COMPRESSIBLE_DURATION_SECONDS',
      'LOW_BITRATE_AUDIO_BPS',
      'MP3_TARGET_SAMPLE_RATE',
      'MP3_TARGET_KBPS',
    ]) {
      expect(audioCompressionSource).toContain(constantName);
    }

    expect(audioCompressionSource).not.toContain('50 * 1024');
    expect(audioCompressionSource).not.toContain('audioBuffer.duration < 1.5');
    expect(audioCompressionSource).not.toContain('bitrate < 80000');
    expect(audioCompressionSource).not.toContain('const targetSampleRate = 16000');
    expect(audioCompressionSource).not.toContain('kbps: 64');
  });

  it('names API key selection helpers after their key-rotation role', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/utils/apiKeySelection.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/apiUtils.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/apiUtils');
      expect(source, relativePath).not.toContain('./apiUtils');
    }
  });

  it('names chat input clipboard parsing after its composer paste role', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/utils/chat-input/clipboardData.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/clipboardUtils.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/clipboardUtils');
      expect(source, relativePath).not.toContain('processClipboardData');
    }
  });

  it('names single-purpose primitives after their responsibility', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/utils/durationFormat.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/file/fileTypeClassification.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/keyboardShortcuts.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/screenCapture.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/icons/iconPrimitives.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/dateHelpers.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/fileTypeUtils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/shortcutUtils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/mediaUtils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/icons/iconUtils.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/dateHelpers');
      expect(source, relativePath).not.toContain('@/utils/fileTypeUtils');
      expect(source, relativePath).not.toContain('@/utils/shortcutUtils');
      expect(source, relativePath).not.toContain('@/utils/mediaUtils');
      expect(source, relativePath).not.toContain('@/components/icons/iconUtils');
    }
  });

  it('uses shared unique ids for newly created scenarios', () => {
    const scenarioManagerSource = readProjectFile('src/hooks/scenarios/useScenarioManager.ts');

    expect(scenarioManagerSource).toContain('id: generateUniqueId()');
    expect(scenarioManagerSource).not.toContain('Date.now().toString()');
  });

  it('keeps upload API internals behind the configured API client boundary', () => {
    const apiClientSource = readProjectFile('src/services/api/apiClient.ts');
    const fileApiSource = readProjectFile('src/services/api/fileApi.ts');

    expect(apiClientSource).toContain('uploadApiClient');
    expect(fileApiSource).toContain('uploadApiClient');
    expect(fileApiSource).not.toContain('apiClient: InternalGeminiApiClient');
    expect(fileApiSource).not.toContain('as unknown as { apiClient');
  });

  it('keeps the app view model on an explicit interface contract', () => {
    const useAppSource = readProjectFile('src/hooks/app/useApp.ts');

    expect(useAppSource).toContain('export interface AppViewModel');
    expect(useAppSource).toContain('export const useApp = (): AppViewModel');
    expect(useAppSource).not.toContain('export type AppViewModel = ReturnType<typeof useApp>');
  });

  it('keeps third-party API settings isolated in dedicated provider section', () => {
    const apiConfigSource = readProjectFile('src/components/settings/sections/ApiConfigSection.tsx');
    const providerSettingsSource = readProjectFile(
      'src/components/settings/sections/providers/ProviderSettingsSection.tsx',
    );
    const providerDetailSource = readProjectFile('src/components/settings/sections/providers/ProviderDetail.tsx');
    const endpointPreviewSource = readProjectFile(
      'src/components/settings/sections/providers/ProviderEndpointPreview.tsx',
    );
    const listSource = readProjectFile('src/components/settings/sections/providers/ProviderList.tsx');

    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/settings/sections/providers/ProviderSettingsSection.tsx')),
    ).toBe(true);
    expect(providerSettingsSource).toContain('ProviderList');
    expect(providerSettingsSource).toContain('ProviderDetail');
    // The third-party configuration surface lives only under sections/providers.
    // api-config/ holds the Gemini API tab shared primitives, and no longer a
    // parallel third-party editor (that unmounted branch was removed; see the
    // 'keeps one third-party connection UI' case below).
    expect(apiConfigSource).not.toContain('buildOpenAICompatibleChatCompletionsUrl');
    expect(apiConfigSource).not.toContain('getOpenAICompatibleBaseUrlWarning');
    expect(apiConfigSource).not.toContain('DEFAULT_OPENAI_COMPATIBLE_BASE_URL');
    expect(apiConfigSource).not.toContain('settingsOpenAICompatibleRequestUrlPreview');
    expect(providerDetailSource).toContain("from './ProviderEndpointPreview'");
    expect(endpointPreviewSource).toContain('buildOpenAICompatibleChatCompletionsUrl');
    expect(endpointPreviewSource).toContain('buildAnthropicMessagesUrl');
    expect(endpointPreviewSource).toContain('buildOpenAIResponsesUrl');
    expect(providerSettingsSource).toContain('handleAddTemplate');
    expect(listSource).toContain('onReorder');
    expect(countLines(endpointPreviewSource)).toBeLessThan(140);
  });

  it('keeps one third-party connection UI reachable from the app entry', () => {
    // Regression guard: the repository previously carried two parallel
    // third-party configuration surfaces (sections/api-config/ThirdParty* and
    // sections/providers/*). Only sections/providers is wired into
    // SettingsContent, so the api-config copies were dead code that could not
    // be reached by an import path from src/index.tsx. Keep them deleted.
    const apiConfigDir = path.join(projectRoot, 'src/components/settings/sections/api-config');
    const apiConfigFiles = fs.readdirSync(apiConfigDir);

    expect(apiConfigFiles).not.toContain('ThirdPartyApiSettingsPanel.tsx');
    expect(apiConfigFiles).not.toContain('ThirdPartyConnectionEditor.tsx');
    expect(apiConfigFiles).not.toContain('ThirdPartyAddConnectionDialog.tsx');
    expect(apiConfigFiles).not.toContain('OpenAICompatibleModelListEditor.tsx');

    const settingsContentSource = readProjectFile('src/components/settings/SettingsContent.tsx');
    expect(settingsContentSource).toContain("from './sections/providers/ProviderSettingsSection'");
    expect(settingsContentSource).not.toContain('ThirdPartyApiSettingsPanel');

    // Any leftover reference to the removed components anywhere in src/ would
    // reintroduce the second surface. This guard file itself names them, so it
    // is excluded by path.
    const offenders: string[] = [];
    const guardFile = path.join(projectRoot, 'src/test/architecture/namingStructureOptimizations.test.ts');
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || full === guardFile) continue;
        const content = fs.readFileSync(full, 'utf8');
        for (const removed of [
          'ThirdPartyApiSettingsPanel',
          'ThirdPartyConnectionEditor',
          'ThirdPartyAddConnectionDialog',
          'OpenAICompatibleModelListEditor',
          'openaiCompatibleModelListState',
          'useOpenAICompatibleModelRowHandlers',
        ]) {
          if (content.includes(removed)) {
            offenders.push(`${path.relative(projectRoot, full)} → ${removed}`);
          }
        }
      }
    };
    walk(path.join(projectRoot, 'src'));

    expect(offenders).toEqual([]);
  });

  it('keeps user message collapse state outside the markdown renderer component', () => {
    const messageListSource = readProjectFile('src/components/chat/message-list/MessageList.tsx');
    const messageTextSource = readProjectFile('src/components/message/content/MessageText.tsx');
    const collapseSource = readProjectFile('src/components/message/content/userMessageCollapse.ts');
    const hookSource = readProjectFile('src/components/chat/message-list/hooks/useExpandedUserMessages.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/components/message/content/userMessageCollapse.ts'))).toBe(true);
    expect(
      fs.existsSync(path.join(projectRoot, 'src/components/chat/message-list/hooks/useExpandedUserMessages.ts')),
    ).toBe(true);
    expect(messageListSource).toContain("from './hooks/useExpandedUserMessages'");
    expect(messageListSource).toContain('const userMessageCollapse = useExpandedUserMessages(activeSessionId);');
    expect(messageTextSource).toContain("from './userMessageCollapse'");
    expect(messageTextSource).toContain('userMessageCollapse?: UserMessageCollapseController;');
    expect(messageTextSource).not.toContain('useState<Set');
    expect(messageTextSource).not.toContain('localExpandedUserMessageKeys');
    expect(messageTextSource).not.toContain('expandedUserMessageKeys?:');
    expect(messageTextSource).not.toContain('onToggleUserMessageExpanded?:');
    expect(collapseSource).toContain('export interface UserMessageCollapseController');
    expect(collapseSource).toContain('USER_MESSAGE_COLLAPSE_LINE_THRESHOLD');
    expect(collapseSource).toContain('shouldCollapseUserMessageContent');
    expect(hookSource).toContain('export const useExpandedUserMessages');
  });
});
