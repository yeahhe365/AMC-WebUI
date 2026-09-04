import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listProjectSourceFiles, projectRoot, readProjectFile } from './projectFiles';

const thisTestFile = 'src/test/architecture/testInfrastructure.test.ts';

describe('test infrastructure guardrails', () => {
  it('keeps targeted Vitest script filters pointed at existing test files', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as { scripts?: Record<string, string> };
    const codeExecutionScript = packageJson.scripts?.['test:code-execution'] ?? '';
    const targetedTestFiles = codeExecutionScript
      .split(/\s+/)
      .filter((token) => /^src\/.*\.test\.(ts|tsx)$/.test(token));

    expect(targetedTestFiles).toContain('src/utils/file-upload/fileUploadPolicy.test.ts');

    for (const relativePath of targetedTestFiles) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }
  });

  it('keeps React act environment configuration centralized in test setup', () => {
    const testFiles = listProjectSourceFiles('src').filter(
      (relativePath) => /\.(test|spec)\.(ts|tsx)$/.test(relativePath) && relativePath !== thisTestFile,
    );

    for (const relativePath of testFiles) {
      const source = readProjectFile(relativePath);

      expect(source, relativePath).not.toContain('IS_REACT_ACT_ENVIRONMENT');
    }

    expect(readProjectFile('src/test/setup.ts')).toContain('IS_REACT_ACT_ENVIRONMENT');
  });

  it('keeps shared test renderer cleanup out of individual test suites', () => {
    const explicitRendererLifecycleFiles = new Set([
      'src/components/modals/create-file/CreateTextFileEditor.preferences.test.tsx',
      'src/components/message/blocks/LazyDiagramLoading.test.tsx',
      'src/components/shared/file-preview/MarkdownFileViewer.test.tsx',
    ]);
    for (const relativePath of explicitRendererLifecycleFiles) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
    }

    const testFiles = listProjectSourceFiles('src').filter(
      (relativePath) => /\.(test|spec)\.(ts|tsx)$/.test(relativePath) && relativePath !== thisTestFile,
    );

    for (const relativePath of testFiles) {
      const source = readProjectFile(relativePath);

      expect(source, relativePath).not.toMatch(
        /afterEach\(\(\)\s*=>\s*{\s*act\(\(\)\s*=>\s*{\s*root\.unmount\(\);\s*}\);\s*}\);/s,
      );
      expect(source, relativePath).not.toMatch(
        /afterEach\(\(\)\s*=>\s*{\s*act\(\(\)\s*=>\s*{\s*root\.unmount\(\);\s*}\);\s*vi\.(?:clearAllMocks|restoreAllMocks)\(\);\s*}\);/s,
      );

      if (
        !explicitRendererLifecycleFiles.has(relativePath) &&
        relativePath !== 'src/components/layout/ChatArea.test.tsx'
      ) {
        expect(source, relativePath).not.toMatch(
          /afterEach\(\(\)\s*=>\s*{[\s\S]*?\b(?:root\??|mounted\.root)\.unmount\(\)/,
        );
      }
    }
  });

  it('keeps core infrastructure mocks on shared test doubles', () => {
    const testFiles = listProjectSourceFiles('src').filter(
      (relativePath) => /\.(test|spec)\.(ts|tsx)$/.test(relativePath) && relativePath !== thisTestFile,
    );

    for (const relativePath of testFiles) {
      const source = readProjectFile(relativePath);

      expect(source, relativePath).not.toMatch(/\b(?:logService|dbService):\s*{/);
      expect(source, relativePath).not.toMatch(/\buseI18n:\s*\(\)\s*=>/);

      if (!relativePath.startsWith('src/test/')) {
        expect(source, relativePath).not.toMatch(/\bcreate(?:MockLogService|MockDbService|I18nMock|RealI18nMock)\(\)/);
      }
      // The no-arg core mocks live once in the setup file; per-file copies are
      // only allowed when they parameterize the double (pass overrides).
      if (!relativePath.startsWith('src/test/')) {
        expect(source, relativePath).not.toContain('return createLogServiceMockModule();');
        expect(source, relativePath).not.toContain('return createDbServiceMockModule();');
      }
    }
  });

  it('keeps core mock modules behind module mock doubles outside the test-double suites', () => {
    const testFiles = listProjectSourceFiles('src').filter(
      (relativePath) =>
        /\.(test|spec)\.(ts|tsx)$/.test(relativePath) &&
        !relativePath.startsWith('src/test/') &&
        relativePath !== thisTestFile,
    );

    for (const relativePath of testFiles) {
      const source = readProjectFile(relativePath);

      expect(source, relativePath).not.toContain('serviceTestDoubles');
      expect(source, relativePath).not.toContain('i18nTestDoubles');
      expect(source, relativePath).not.toContain('@/test/doubles/services');
      expect(source, relativePath).not.toContain('@/test/doubles/i18n');
    }
  });

  it('keeps complex hook test inputs on typed shared factories', () => {
    const senderSource = readProjectFile('src/features/message-sender/useMessageSender.test.tsx');
    const standardChatSource = readProjectFile('src/features/message-sender/standardChatStrategy.test.tsx');
    const sessionLoaderSource = readProjectFile('src/hooks/chat/history/useSessionLoader.test.tsx');

    expect(senderSource).toContain('createMessageSenderProps');
    expect(senderSource).toContain('createUploadedFile');
    expect(senderSource).not.toContain('useMessageSender({');
    expect(senderSource).not.toContain('as any');

    expect(standardChatSource).toContain('createStandardChatProps');
    expect(standardChatSource).not.toContain('useStandardChat({');
    expect(standardChatSource).not.toContain('as any');

    expect(sessionLoaderSource).toContain('createSessionLoaderProps');
    expect(sessionLoaderSource).not.toContain('useSessionLoader({');
    expect(sessionLoaderSource).not.toContain('as any');
  });
});
