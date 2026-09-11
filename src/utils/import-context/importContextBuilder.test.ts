import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import { buildImportContextFile, generateZipContext } from './importContextBuilder';

const { extractDocxTextMock } = vi.hoisted(() => ({
  extractDocxTextMock: vi.fn(),
}));

vi.mock('@/utils/docxPreview', () => ({
  extractDocxText: extractDocxTextMock,
  isDocxFile: (file: { name: string; type: string }) =>
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx'),
}));

const EXACT_SAMPLE_OUTPUT = `This file is a merged representation of the current codebase, prepared by Structure Insight.

================================================================
File Summary
================================================================

Purpose:
--------
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

File Format:
------------
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A separator line (================)
  b. The file path (File: path/to/file)
  c. Another separator line
  d. The full contents of the file
  e. A blank line

Usage Guidelines:
-----------------
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

Notes:
------
- Some files may have been excluded based on detected ignore files and Structure Insight's export settings
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching default ignore patterns are excluded

================================================================
Directory Structure
================================================================
assets/
  logo.png
src/
  app.ts
README.md

================================================================
Files
================================================================

================
File: README.md
================
# Demo

================
File: src/app.ts
================
export const value = 1;




================================================================
End of Codebase
================================================================
`;

const setRelativePath = (file: File, relativePath: string) => {
  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: relativePath,
  });

  return file;
};

describe('buildImportContextFile', () => {
  it('matches the Structure Insight plain TXT layout for a folder import', async () => {
    const readme = setRelativePath(new File(['# Demo\n'], 'README.md', { type: 'text/markdown' }), 'demo/README.md');
    const appFile = setRelativePath(
      new File(['export const value = 1;\n'], 'app.ts', { type: 'text/plain' }),
      'demo/src/app.ts',
    );
    const logo = setRelativePath(new File(['png'], 'logo.png', { type: 'image/png' }), 'demo/assets/logo.png');

    const contextFile = await buildImportContextFile([readme, appFile, logo]);

    expect(await contextFile.text()).toBe(EXACT_SAMPLE_OUTPUT);
  });

  it('keeps nested zip files in the directory structure without expanding them', async () => {
    const appFile = setRelativePath(
      new File(['export const value = 1;\n'], 'app.ts', { type: 'text/plain' }),
      'demo/src/app.ts',
    );
    const nestedZip = setRelativePath(
      new File(['fake zip'], 'docs.zip', { type: 'application/zip' }),
      'demo/downloads/docs.zip',
    );

    const contextFile = await buildImportContextFile([appFile, nestedZip]);
    const output = await contextFile.text();

    expect(output).toContain('downloads/');
    expect(output).toContain('  docs.zip');
    expect(output).not.toContain('File: downloads/docs.zip');
  });

  it('includes empty directories when requested', async () => {
    const appFile = setRelativePath(
      new File(['export const value = 1;\n'], 'app.ts', { type: 'text/plain' }),
      'demo/src/app.ts',
    );

    const contextFile = await buildImportContextFile([appFile], {
      emptyDirectoryPaths: ['demo/empty'],
      includeEmptyDirectories: true,
    });

    const output = await contextFile.text();
    expect(output).toContain('empty/');
  });

  it('extracts text from Word documents inside folder imports', async () => {
    extractDocxTextMock.mockResolvedValue({
      text: 'Quarterly notes from a folder',
      messages: [],
    });
    const docxFile = setRelativePath(
      new File(['fake docx'], 'notes.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'demo/docs/notes.docx',
    );

    const contextFile = await buildImportContextFile([docxFile]);
    const output = await contextFile.text();

    expect(output).toContain('File: docs/notes.docx');
    expect(output).toContain('Quarterly notes from a folder');
  });
});

describe('generateZipContext', () => {
  it('expands top-level zip files before building the TXT output', async () => {
    const zip = new JSZip();
    zip.file('src/app.ts', 'export const zipped = true;\n');
    zip.file('README.md', '# Zipped Demo\n');

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'demo.zip', { type: 'application/zip' });

    const contextFile = await generateZipContext(zipFile);
    const output = await contextFile.text();

    expect(output).toContain('File: README.md');
    expect(output).toContain('File: src/app.ts');
    expect(output).toContain('export const zipped = true;');
  });

  it('filters out Zip Slip traversal entries from zip imports', async () => {
    const zip = new JSZip();
    zip.file('src/safe.ts', 'export const safe = true;\n');

    // Simulate an unsafe entry directly in JSZip files dictionary
    const fakeUnsafeEntry = {
      name: '../evil.sh',
      dir: false,
      date: new Date(),
      async: vi.fn().mockResolvedValue(new Blob(['rm -rf /'])),
    };
    // @ts-expect-error test injection
    zip.files['../evil.sh'] = fakeUnsafeEntry;

    const loadAsyncSpy = vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(zip);

    const zipFile = new File(['fake'], 'demo.zip', { type: 'application/zip' });
    const contextFile = await generateZipContext(zipFile);
    const output = await contextFile.text();

    loadAsyncSpy.mockRestore();

    expect(output).toContain('File: src/safe.ts');
    expect(output).not.toContain('evil.sh');
  });

  it('pre-filters ignored directories like node_modules without extracting them', async () => {
    const zip = new JSZip();
    zip.file('src/index.ts', 'export const index = true;\n');
    zip.file('node_modules/package/index.js', 'console.log("ignored");');

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'repo.zip', { type: 'application/zip' });

    const contextFile = await generateZipContext(zipFile);
    const output = await contextFile.text();

    expect(output).toContain('File: src/index.ts');
    expect(output).not.toContain('node_modules');
  });

  it('enforces zip safety limits when specified', async () => {
    const zip = new JSZip();
    zip.file('f1.txt', '1');
    zip.file('f2.txt', '2');
    zip.file('f3.txt', '3');

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([zipBlob], 'small.zip', { type: 'application/zip' });

    await expect(
      generateZipContext(zipFile, {
        zipSafetyLimits: { maxEntries: 2 },
      }),
    ).rejects.toThrow('exceeding the maximum safe limit');
  });
});
