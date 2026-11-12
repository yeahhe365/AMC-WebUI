import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { projectRoot, readProjectFile } from './projectFiles';

describe('project documentation structure', () => {
  it('keeps DOM selectors and event names in layout constants, not storage keys', () => {
    const storageKeys = readProjectFile('src/constants/storageKeys.ts');
    const layout = readProjectFile('src/constants/layout.ts');

    expect(storageKeys).not.toContain('CHAT_INPUT_TEXTAREA_SELECTOR');
    expect(layout).toContain('export const CHAT_INPUT_TEXTAREA_SELECTOR');
    expect(layout).toContain('export const FOCUS_HISTORY_SEARCH_EVENT');
    expect(fs.existsSync(path.join(projectRoot, 'src/constants/domSelectors.ts'))).toBe(false);
  });

  it('documents the current source structure in both READMEs', () => {
    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');

    for (const source of [zhReadme, enReadme]) {
      expect(source).toContain('src/features/');
      expect(source).toContain('src/i18n/');
      expect(source).toContain('src/pwa/');
      expect(source).toContain('src/schemas/');
      expect(source).toContain('src/test/');
      expect(source).toContain('local-python');
    }

    expect(zhReadme).not.toContain('Gemini / Pyodide / API / 日志等基础设施');
    expect(enReadme).not.toContain('Gemini, Pyodide, API, logging, and infrastructure services');
    expect(zhReadme).not.toContain('utils/                  # 导出、会话、IndexedDB');
    expect(enReadme).not.toContain('utils/                  # Export, session, IndexedDB');
  });

  it('distinguishes Docker runtime defaults from the static runtime-config template', () => {
    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');

    expect(zhReadme).toContain('Docker 默认值');
    expect(zhReadme).toContain('public/runtime-config.js 模板');
    expect(enReadme).toContain('Docker default');
    expect(enReadme).toContain('public/runtime-config.js template');
  });

  it('documents the combined frontend and API build step for Docker Compose', () => {
    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');

    expect(zhReadme).toContain('npm run build:docker');
    expect(enReadme).toContain('npm run build:docker');
  });

  it('serves module workers with a JavaScript MIME type in Docker', () => {
    const webServerSource = readProjectFile('docker/web-server.js');

    expect(webServerSource).toMatch(/['"]\.mjs['"]:\s*['"]application\/javascript/);
    expect(webServerSource).toMatch(/ext === ['"]\.mjs['"][\s\S]*no-cache/);
  });

  it('does not serve the SPA shell for missing hashed assets', () => {
    const webServerSource = readProjectFile('docker/web-server.js');

    expect(webServerSource).toMatch(/path\.extname\(pathname\)\s*!==\s*''/);
    expect(webServerSource).toMatch(/writeHead\(404\)/);
  });

  it('describes local Python package loading precisely', () => {
    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');

    // Only micropip is preloaded; every scientific package arrives on first import
    // (pyodideWorkerTemplate.ts: loadPackage(['micropip']) + loadPackagesFromImports).
    expect(zhReadme).toContain('内置 micropip');
    expect(zhReadme).toContain('按需自动加载');
    expect(zhReadme).toContain('按需安装 scipy、scikit-learn');
    expect(zhReadme).not.toContain('预加载 numpy、pandas、matplotlib');
    expect(zhReadme).not.toContain('预装 numpy、pandas、matplotlib、scipy、scikit-learn');

    expect(enReadme).toContain('Ships micropip');
    expect(enReadme).toContain('installed on demand when imported');
    expect(enReadme).toContain('installs scipy and scikit-learn on demand');
    expect(enReadme).not.toContain('Preloads numpy, pandas, and matplotlib');
    expect(enReadme).not.toContain(
      'Bundled scientific stack such as numpy, pandas, matplotlib, scipy, and scikit-learn',
    );
  });

  it('lists every offered model id in both READMEs', () => {
    // The README table is the user-facing promise of what the picker contains.
    // gemini-3.6-flash shipped in MODEL_REGISTRY while the table still omitted it,
    // so pin the two together: adding or removing a registry entry fails here until
    // the READMEs are updated (registry ids are string literals; ROBOTICS_MODEL is not).
    const registrySource = readProjectFile('src/constants/modelRegistry.ts');
    const offeredIds = [...registrySource.matchAll(/^\s+id: '([^']+)',$/gm)].map((match) => match[1]);
    expect(offeredIds.length).toBeGreaterThan(10);

    const zhReadme = readProjectFile('README.md');
    const enReadme = readProjectFile('README.en.md');
    const missingFromDocs = offeredIds.filter((id) => !zhReadme.includes(id) || !enReadme.includes(id));

    expect(missingFromDocs, 'README.md / README.en.md must document every registered model').toEqual([]);
  });
});
