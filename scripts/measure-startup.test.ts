// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(base = '/subdir/') {
  const directory = await mkdtemp(path.join(tmpdir(), 'amc-startup-'));
  directories.push(directory);
  await mkdir(path.join(directory, 'assets'));
  await writeFile(path.join(directory, 'index.html'), `<script type="module" src="${base}assets/index-a.js"></script>`);
  await writeFile(path.join(directory, 'assets/index-a.js'), "import './shared-b.js'; import('./optional-c.js');");
  await writeFile(path.join(directory, 'assets/shared-b.js'), "console.log('required');");
  await writeFile(path.join(directory, 'assets/optional-c.js'), "console.log('optional');");
  await writeFile(path.join(directory, 'sw.js'), 'precache([{url:"assets/index-a.js"},{url:"assets/shared-b.js"}]);');
  return directory;
}

function measure(directory: string) {
  return spawnSync(process.execPath, ['scripts/measure-startup.mjs', directory], { encoding: 'utf8' });
}

it('measures actual static imports with a nested or absolute Vite base', async () => {
  for (const base of ['/subdir/', 'https://static.example/app/']) {
    const result = measure(await fixture(base));
    expect(result.status, result.stderr).toBe(0);
    const metrics = JSON.parse(result.stdout);
    expect(metrics.staticImportClosure.files).toBe(2);
    expect(metrics.staticImportClosure.chunks.map((chunk: { file: string }) => chunk.file).sort()).toEqual([
      'assets/index-a.js',
      'assets/shared-b.js',
    ]);
  }
});

it('fails closed if the entry or a statically imported chunk is missing', async () => {
  for (const file of ['index-a.js', 'shared-b.js']) {
    const directory = await fixture();
    await rm(path.join(directory, 'assets', file));
    const result = measure(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/missing.*startup|startup.*missing/i);
  }
});

it('rejects startup chunks omitted from the offline precache', async () => {
  const directory = await fixture('/');
  await writeFile(path.join(directory, 'sw.js'), 'precache([{url:"assets/index-a.js"}]);');
  const result = measure(directory);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/precache.*shared-b|shared-b.*precache/i);
});

it('requires the shell sidebar and its dependencies in the offline precache', async () => {
  const directory = await fixture('/');
  await writeFile(path.join(directory, 'assets/HistorySidebar-a.js'), "import './sidebar-vendor.js';");
  await writeFile(path.join(directory, 'assets/sidebar-vendor.js'), "console.log('sidebar');");
  const result = measure(directory);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/precache.*HistorySidebar|HistorySidebar.*precache/i);
  await writeFile(
    path.join(directory, 'sw.js'),
    'precache([{url:"assets/index-a.js"},{url:"assets/shared-b.js"},{url:"assets/HistorySidebar-a.js"}]);',
  );
  const missingDependency = measure(directory);
  expect(missingDependency.status).not.toBe(0);
  expect(missingDependency.stderr).toMatch(/precache.*sidebar-vendor|sidebar-vendor.*precache/i);
});
