import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { projectRoot, readProjectFile } from './projectFiles';

describe('developer experience detail boundaries', () => {
  it('keeps app event orchestration split by runtime responsibility', () => {
    const appEventsSource = readProjectFile('src/hooks/core/useAppEvents.ts');
    const pwaLifecycleSource = readProjectFile('src/hooks/core/usePwaLifecycle.ts');
    const globalShortcutsSource = readProjectFile('src/hooks/core/useGlobalShortcuts.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/hooks/core/usePwaLifecycle.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/hooks/core/useGlobalShortcuts.ts'))).toBe(true);
    expect(appEventsSource).toContain("from './usePwaLifecycle'");
    expect(appEventsSource).toContain("from './useGlobalShortcuts'");
    expect(appEventsSource).not.toContain('loadRegisterSW');
    expect(appEventsSource).not.toContain('registerPwa');
    expect(appEventsSource).not.toContain('getPwaInstallState');
    expect(appEventsSource).not.toContain('isShortcutPressed');
    expect(appEventsSource).not.toContain('getTabCycleModelIds');
    expect(appEventsSource).not.toContain('FOCUS_HISTORY_SEARCH_EVENT');
    expect(appEventsSource.length).toBeLessThan(3500);

    expect(pwaLifecycleSource).toContain('registerPwa');
    expect(pwaLifecycleSource).toContain('getPwaInstallState');
    expect(globalShortcutsSource).toContain('isShortcutPressed');
    expect(globalShortcutsSource).toContain('getTabCycleModelIds');
  });

  it('keeps the Pyodide worker template readable despite being inline JavaScript', () => {
    const workerTemplateSource = readProjectFile('src/features/local-python/pyodideWorkerTemplate.ts');

    for (const unclearFragment of [
      'const len =',
      'const buf =',
      'img_str',
      'catch { /* ignore */ }',
      '// Pre-load common data packages for speed',
      '// Reset stdout/stderr capture',
      '// Execute User Code',
      '// Check for generated plots via matplotlib',
      '// Check for new files generated in the execution workspace',
      '// Cleanup',
    ]) {
      expect(workerTemplateSource).not.toContain(unclearFragment);
    }

    expect(workerTemplateSource).toContain('byteLength');
    expect(workerTemplateSource).toContain('ensureArrayBuffer');
    expect(workerTemplateSource).toContain('generatedOutputFiles');
    expect(workerTemplateSource).toContain("'WARMUP'");
  });

  it('keeps install commands consistent with the npmrc dependency policy', () => {
    const npmrc = readProjectFile('.npmrc');
    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');
    const contributing = readProjectFile('CONTRIBUTING.md');
    const workflow = readProjectFile('.github/workflows/ci.yml');

    expect(npmrc).toContain('legacy-peer-deps=true');
    expect(zhReadme).toContain('npm ci');
    expect(enReadme).toContain('npm ci');
    expect(contributing).toContain('npm ci');
    expect(zhReadme).not.toMatch(/^npm install$/m);
    expect(enReadme).not.toMatch(/^npm install$/m);
    expect(contributing).not.toContain('npm ci --legacy-peer-deps');
    expect(workflow).not.toContain('npm ci --legacy-peer-deps');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
  });
});
