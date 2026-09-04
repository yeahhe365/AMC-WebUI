import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  countLines,
  listProjectSourceFiles,
  listProjectSourceFilesExcept,
  projectRoot,
  readProjectFile,
} from './projectFiles';

const thisTestFile = 'src/test/architecture/projectStructureBoundaries.test.ts';

const extractConstNumber = (source: string, constName: string): number | null => {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
};

const listEmptyDirectories = (relativeDir: string): string[] => {
  const absoluteDir = path.join(projectRoot, relativeDir);
  const entries = fs
    .readdirSync(absoluteDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const nestedEmptyDirs = entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => listEmptyDirectories(path.join(relativeDir, entry.name)));

  return entries.length === 0 ? [relativeDir] : nestedEmptyDirs;
};

describe('project structure boundaries', () => {
  it('keeps legacy preference hydration inside effect boundaries', () => {
    const settingsLogicSource = readProjectFile('src/hooks/settings/useSettingsLogic.ts');
    const modelsHookSource = readProjectFile('src/hooks/core/useModels.ts');

    expect(settingsLogicSource).toMatch(
      /useEffect\(\(\) => \{\s*useSettingsUiStore\.getState\(\)\.hydrateLegacySettingsUiPreferences\(\);\s*\}, \[\]\);/,
    );
    expect(modelsHookSource).toMatch(
      /useEffect\(\(\) => \{\s*useModelPreferencesStore\.getState\(\)\.hydrateLegacyModelPreferences\(\);\s*\}, \[\]\);/,
    );
  });

  it('exports settings tab types from the settings UI store boundary', () => {
    const settingsLogicSource = readProjectFile('src/hooks/settings/useSettingsLogic.ts');
    const settingsSidebarSource = readProjectFile('src/components/settings/SettingsSidebar.tsx');
    const settingsContentSource = readProjectFile('src/components/settings/SettingsContent.tsx');

    expect(settingsLogicSource).not.toContain('export type { SettingsTab, SettingsTabDescriptor };');
    expect(settingsSidebarSource).toContain("from '@/stores/settingsUiStore'");
    expect(settingsSidebarSource).not.toContain("from '@/hooks/settings/useSettingsLogic'");
    expect(settingsContentSource).toContain("from '@/stores/settingsUiStore'");
    expect(settingsContentSource).not.toContain("from '@/hooks/settings/useSettingsLogic'");
  });

  it('keeps domain hooks out of the ambiguous hooks/features directory', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/hooks/features'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/hooks/features/');
    }
  });

  it('keeps root hooks limited to cross-domain primitives', () => {
    const relocatedDomainHooks = [
      'src/hooks/useHistorySidebarLogic.ts',
      'src/hooks/useLiveApi.ts',
      'src/hooks/useMessageExport.ts',
      'src/hooks/usePreloadedScenarios.ts',
      'src/hooks/useSlashCommands.ts',
      'src/hooks/useVoiceInput.ts',
    ];
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    for (const relativePath of relocatedDomainHooks) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(false);
    }

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toMatch(
        /@\/hooks\/use(?:HistorySidebarLogic|LiveApi|MessageExport|PreloadedScenarios|SlashCommands|VoiceInput)/,
      );
    }
  });

  it('uses the icons directory index instead of a CustomIcons compatibility barrel', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/components/icons/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/icons/CustomIcons.tsx'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/components/icons/CustomIcons');
      expect(source, relativePath).not.toContain('./CustomIcons');
    }
  });

  it('keeps general app icons separate from code language icons', () => {
    const generalIconsSource = readProjectFile('src/components/icons/groups/GeneralIcons.tsx');
    const languageIconsSource = readProjectFile('src/components/icons/groups/LanguageIcons.tsx');
    const iconsIndexSource = readProjectFile('src/components/icons/index.ts');

    expect(generalIconsSource).not.toContain('LanguageMark');
    expect(generalIconsSource).not.toContain('IconPython');
    expect(languageIconsSource).toContain('IconPython');
    expect(iconsIndexSource).toContain("export * from './groups/LanguageIcons';");
  });

  it('keeps architecture guard files focused and permanently named', () => {
    const architectureFiles = listProjectSourceFiles('src/test/architecture').filter((relativePath) =>
      relativePath.endsWith('.test.ts'),
    );
    const temporaryNamePattern = /(?:^|[-_.])(?:cleanup|review)(?:[-_.]|$)/i;
    const temporaryNames = architectureFiles.filter((relativePath) =>
      temporaryNamePattern.test(path.basename(relativePath)),
    );
    const oversizedFiles = architectureFiles
      .map((relativePath) => ({
        relativePath,
        lines: countLines(readProjectFile(relativePath)),
      }))
      .filter(({ lines }) => lines > 500);

    expect(temporaryNames).toEqual([]);
    expect(oversizedFiles).toEqual([]);
  });

  it('keeps broad component regression suites split into focused files', () => {
    const oversizedComponentTestFiles = [
      'src/components/chat/input/ChatInput.test.tsx',
      'src/components/message/BasicMarkdownRenderer.test.tsx',
    ]
      .map((relativePath) => ({ relativePath, lines: countLines(readProjectFile(relativePath)) }))
      .filter(({ lines }) => lines > 1000);

    expect(oversizedComponentTestFiles).toEqual([]);
  });

  it('keeps source directories from lingering after files move away', () => {
    expect(listEmptyDirectories('src')).toEqual([]);
  });

  it('keeps directory naming on the consolidated domain layout', () => {
    const expectedPaths = [
      'src/components/chat/message-list/MessageList.tsx',
      'src/components/audio/AudioVisualizer.tsx',
      'src/components/log-viewer/useUsageStats.ts',
      'src/components/settings/sections/TabCycleModelsCard.tsx',
      'src/hooks/chat/message/useMessageActions.ts',
      'src/hooks/data-management/ChatExportRenderer.tsx',
      'src/utils/model/modelCapabilities.ts',
      'src/utils/file/fileTypeClassification.ts',
      'src/utils/live-artifacts/liveArtifactFollowup.ts',
      'src/test/layout/fixtures.tsx',
    ];
    const removedPaths = [
      'src/components/chat/MessageList.tsx',
      'src/components/recorder',
      'src/features/chat-export',
      'src/hooks/log-viewer',
      'src/hooks/chat/messages',
      'src/components/settings/sections/models',
      'src/test/chat-area',
      'src/utils/modelCapabilities.ts',
      'src/utils/fileTypeClassification.ts',
      'src/utils/liveArtifactFollowup.ts',
    ];

    for (const relativePath of expectedPaths) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }
    for (const relativePath of removedPaths) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it('keeps OpenAI-compatible file names and imports on the same lower-camel spelling', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);
    const discouragedOpenAiSpelling = `open${'AI'}`;
    const openAiFilenameOffenders = sourceFiles.filter((relativePath) =>
      path.basename(relativePath).includes(discouragedOpenAiSpelling),
    );
    const openAiSpellingOffenders = sourceFiles.filter((relativePath) =>
      readProjectFile(relativePath).includes(discouragedOpenAiSpelling),
    );

    expect(openAiFilenameOffenders).toEqual([]);
    expect(openAiSpellingOffenders).toEqual([]);
  });

  it('keeps prompt runtime helpers with the prompt feature code', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/features/prompts/promptRegistry.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/constants/promptHelpers.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/constants/promptHelpers');
      expect(source, relativePath).not.toContain('./promptHelpers');
    }
  });

  it('keeps IndexedDB migration comments complete across schema versions', () => {
    const dbSchemaSource = readProjectFile('src/services/db/dbSchema.ts');

    expect(dbSchemaSource).toContain('export const DB_VERSION = 5;');
    for (const version of [1, 2, 3, 4, 5]) expect(dbSchemaSource).toContain(`Version ${version}:`);
  });

  it('keeps E2E IndexedDB seed versions aligned with the production schema', () => {
    const productionVersion = extractConstNumber(readProjectFile('src/services/db/dbSchema.ts'), 'DB_VERSION');
    const sidebarVersion = extractConstNumber(readProjectFile('e2e/sidebar-interactions.spec.ts'), 'DB_VERSION');
    const harnessSource = readProjectFile('e2e/helpers/appHarness.ts');

    expect(sidebarVersion).toBe(productionVersion);
    // The harness consumes the production schema module instead of keeping a
    // parallel hardcoded copy of the database constants.
    expect(harnessSource).toContain("from '@/services/db/dbSchema'");
    expect(harnessSource).not.toContain("'AllModelChatDB'");
    expect(harnessSource).not.toMatch(/const\s+DB_(?:NAME|VERSION)\s*=/);
  });

  it('keeps Live API hook names on the same Api casing as the rest of the codebase', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);
    const discouragedLiveApiSpellings = [`Live${'API'}`, `live${'API'}`, `useLive${'API'}`];
    const liveApiFilenameOffenders = sourceFiles.filter((relativePath) =>
      discouragedLiveApiSpellings.some((spelling) => path.basename(relativePath).includes(spelling)),
    );
    const liveApiSourceOffenders = sourceFiles.filter((relativePath) => {
      const source = readProjectFile(relativePath);
      return discouragedLiveApiSpellings.some((spelling) => source.includes(spelling));
    });

    expect(liveApiFilenameOffenders).toEqual([]);
    expect(liveApiSourceOffenders).toEqual([]);
  });

  it('names Gemini 3 required-thinking model constants by their actual role', () => {
    const modelConfigurationSource = readProjectFile('src/constants/modelConfiguration.ts');
    const modelCapabilitiesSource = readProjectFile('src/utils/model/modelCapabilities.ts');

    expect(modelConfigurationSource).toContain('export const REQUIRED_THINKING_MODEL_IDS');
    expect(modelConfigurationSource).not.toContain('GEMINI_3_RO_MODELS');
    expect(modelConfigurationSource).not.toContain('MODELS_MANDATORY_THINKING');
    expect(modelCapabilitiesSource).toContain('REQUIRED_THINKING_MODEL_IDS');
    expect(modelCapabilitiesSource).not.toContain('GEMINI_3_RO_MODELS');
  });

  it('keeps ChatInputContext on an explicit public context contract', () => {
    const source = readProjectFile('src/components/chat/input/ChatInputContext.tsx');
    const typeSource = readProjectFile('src/components/chat/input/chatInputContextTypes.ts');

    expect(source).not.toContain("from '@/hooks/chat-input/useChatInput'");
    expect(source).not.toContain('ReturnType<typeof useChatInput>');
    expect(source).not.toContain('extends ChatInputLogic');
    expect(typeSource).toContain('interface ChatInputContextValue');
  });

  it('keeps model icon rendering on component filename casing', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/components/shared/ModelIcon.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/shared/modelIcons.tsx'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('components/shared/modelIcons');
      expect(source, relativePath).not.toContain('./modelIcons');
    }
  });

  it('keeps file card UI metadata with shared file preview components', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/components/shared/file-preview/fileCardMeta.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/fileCardUtils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/fileCardUtils.test.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/fileCardUtils');
      expect(source, relativePath).not.toContain('./fileCardUtils');
    }
  });

  it('keeps UI hook filenames on the same Ui acronym casing as other local acronyms', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);
    const coreHookFileNames = fs.readdirSync(path.join(projectRoot, 'src/hooks/core'));
    const rootHookFileNames = fs.readdirSync(path.join(projectRoot, 'src/hooks'));
    const messageListHookFileNames = fs.readdirSync(path.join(projectRoot, 'src/components/chat/message-list/hooks'));

    expect(coreHookFileNames).not.toContain('useAppUI.ts');
    expect(rootHookFileNames).not.toContain('useMessageListUI.ts');
    expect(rootHookFileNames).not.toContain('useMessageListUi.ts');
    expect(messageListHookFileNames).not.toContain('useMessageListUI.ts');
    expect(coreHookFileNames).toContain('useAppUi.ts');
    expect(messageListHookFileNames).toContain('useMessageListUi.ts');

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('useAppUI');
      expect(source, relativePath).not.toContain('useMessageListUI');
    }
  });

  it('keeps local third-party declarations specific enough to avoid explicit any', () => {
    const turndownGfmDeclaration = readProjectFile('src/types/turndown-plugin-gfm.d.ts');

    expect(turndownGfmDeclaration).toContain('TurndownService');
    expect(turndownGfmDeclaration).not.toMatch(/\bany\b/);
  });

  it('keeps migrated pure helper modules in utils without hooks compatibility wrappers', () => {
    const migratedHelperModules = [
      ['src/hooks/chat-input/chatInputAvailability.ts', 'src/utils/chat-input/chatInputAvailability.ts'],
      ['src/hooks/chat-input/chatInputStateMachine.ts', 'src/utils/chat-input/chatInputStateMachine.ts'],
      ['src/hooks/chat-input/chatInputUtils.ts', 'src/utils/chat-input/chatInputContent.ts'],
      ['src/hooks/chat-input/pendingSubmissionUtils.ts', 'src/utils/chat-input/pendingSubmission.ts'],
      ['src/hooks/chat-input/textFileToInput.ts', 'src/utils/chat-input/textFileToInput.ts'],
      ['src/hooks/file-upload/fileUploadPolicy.ts', 'src/utils/file-upload/fileUploadPolicy.ts'],
      ['src/hooks/file-upload/uploadFileItem.ts', 'src/utils/file-upload/uploadFileItem.ts'],
      ['src/hooks/file-upload/uploadQueue.ts', 'src/utils/file-upload/uploadQueue.ts'],
      ['src/hooks/live-api/liveClientFunctions.ts', 'src/utils/live-api/liveClientFunctions.ts'],
      ['src/hooks/live-api/liveErrorState.ts', 'src/utils/live-api/liveErrorState.ts'],
      ['src/hooks/text-selection/liveArtifactSelection.ts', 'src/utils/text-selection/liveArtifactSelection.ts'],
      ['src/hooks/text-selection/selectionClipboard.ts', 'src/utils/text-selection/selectionClipboard.ts'],
    ];
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    const colocatedTestModules = new Set([
      'src/utils/chat-input/chatInputStateMachine.ts',
      'src/utils/chat-input/chatInputContent.ts',
      'src/utils/chat-input/pendingSubmission.ts',
      'src/utils/chat-input/textFileToInput.ts',
      'src/utils/file-upload/fileUploadPolicy.ts',
      'src/utils/file-upload/uploadFileItem.ts',
      'src/utils/file-upload/uploadQueue.ts',
      'src/utils/live-api/liveClientFunctions.ts',
      'src/utils/live-api/liveErrorState.ts',
    ]);
    const removedGenericUtilityModules = [
      'src/utils/chat-input/chatInputUtils.ts',
      'src/utils/chat-input/pendingSubmissionUtils.ts',
    ];

    for (const removedPath of removedGenericUtilityModules) {
      expect(fs.existsSync(path.join(projectRoot, removedPath)), removedPath).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, removedPath.replace(/\.ts$/, '.test.ts'))), removedPath).toBe(false);
    }

    for (const [legacyPath, utilityPath] of migratedHelperModules) {
      expect(fs.existsSync(path.join(projectRoot, legacyPath)), legacyPath).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, utilityPath)), utilityPath).toBe(true);
      if (colocatedTestModules.has(utilityPath)) {
        expect(fs.existsSync(path.join(projectRoot, legacyPath.replace(/\.ts$/, '.test.ts'))), legacyPath).toBe(false);
        expect(fs.existsSync(path.join(projectRoot, utilityPath.replace(/\.ts$/, '.test.ts'))), utilityPath).toBe(true);
      }
    }

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      for (const [legacyPath] of migratedHelperModules) {
        const legacyImportPath = `@/${legacyPath.replace(/^src\//, '').replace(/\.ts$/, '')}`;
        expect(source, `${relativePath}:${legacyImportPath}`).not.toContain(legacyImportPath);
      }
      expect(source, relativePath).not.toContain('@/utils/chat-input/chatInputUtils');
      expect(source, relativePath).not.toContain('@/utils/chat-input/pendingSubmissionUtils');
      expect(source, relativePath).not.toContain('./chatInputUtils');
      expect(source, relativePath).not.toContain('./pendingSubmissionUtils');
    }
  });

  it('keeps file utilities split by responsibility instead of behind fileHelpers', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    for (const relativePath of [
      'src/utils/file/fileClipboard.ts',
      'src/utils/file/fileEncoding.ts',
      'src/utils/file/fileMime.ts',
      'src/utils/file/filePreviewUrls.ts',
      'src/utils/file/fileSize.ts',
    ]) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }

    expect(fs.existsSync(path.join(projectRoot, 'src/utils/fileHelpers.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/fileHelpers');
      expect(source, relativePath).not.toContain('./fileHelpers');
    }
  });

  it('keeps chat input layout helpers named as pure builders', () => {
    const chatInputAreaSource = readProjectFile('src/components/chat/input/ChatInputArea.tsx');
    const chatTextAreaSource = readProjectFile('src/components/chat/input/area/ChatTextArea.tsx');
    const chatInputProviderSource = readProjectFile('src/components/chat/input/ChatInputProvider.tsx');

    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/chatInputAreaLayout.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/useChatInputAreaLayout.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/chatInputTextAreaMetrics.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/chat/input/chatInputLayoutConstants.ts'))).toBe(false);
    expect(chatInputAreaSource).toContain("import { getChatInputAreaLayout } from './chatInputAreaLayout'");
    expect(chatInputAreaSource).not.toContain('useChatInputAreaLayout');
    expect(chatTextAreaSource).not.toContain('@/hooks/chat-input/useChatInputState');
    expect(chatInputProviderSource).not.toContain('@/hooks/chat-input/useChatInputState');
  });

  it('keeps the tiny ChatArea layout hook beside ChatArea instead of behind a one-file subdirectory', () => {
    const chatAreaSource = readProjectFile('src/components/layout/ChatArea.tsx');

    expect(fs.existsSync(path.join(projectRoot, 'src/components/layout/useChatArea.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components/layout/chat-area/useChatArea.ts'))).toBe(false);
    expect(chatAreaSource).toContain("from './useChatArea'");
    expect(chatAreaSource).not.toContain("from './chat-area/useChatArea'");
  });

  it('names markdown utility files by their concrete responsibilities', () => {
    const sourceFiles = listProjectSourceFilesExcept('src', thisTestFile);

    expect(fs.existsSync(path.join(projectRoot, 'src/utils/previewableMarkdown.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/markdownSegments.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/codeUtils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/utils/markdownUtils.ts'))).toBe(false);

    for (const relativePath of sourceFiles) {
      const source = readProjectFile(relativePath);
      expect(source, relativePath).not.toContain('@/utils/codeUtils');
      expect(source, relativePath).not.toContain('@/utils/markdownUtils');
      expect(source, relativePath).not.toContain('./codeUtils');
      expect(source, relativePath).not.toContain('./markdownUtils');
    }
  });
});
