import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { preparePyodidePackages } from '../vite/pyodideAssets';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

it('copies a locked package and its dependencies into a reusable integrity-checked cache', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'amc-python-assets-'));
  directories.push(dir);
  const digest = (data: string) => createHash('sha256').update(data).digest('hex');
  const manifest = {
    info: { version: '0.27.7' },
    packages: {
      numpy: { file_name: 'numpy.whl', depends: ['openblas'], sha256: digest('numpy') },
      openblas: { file_name: 'openblas.zip', depends: [], sha256: digest('openblas') },
    },
  };
  const fetchImpl = vi.fn(
    async (url: string | URL) => new Response(String(url).endsWith('numpy.whl') ? 'numpy' : 'openblas'),
  );
  const args = { manifest, packages: ['numpy'], cacheDirectory: dir, fetchImpl: fetchImpl as typeof fetch };
  await preparePyodidePackages(args);
  expect(await readFile(path.join(dir, 'numpy.whl'), 'utf8')).toBe('numpy');
  expect(await readFile(path.join(dir, 'openblas.zip'), 'utf8')).toBe('openblas');
  await preparePyodidePackages(args);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  await writeFile(path.join(dir, 'numpy.whl'), 'corrupted');
  await preparePyodidePackages(args);
  expect(await readFile(path.join(dir, 'numpy.whl'), 'utf8')).toBe('numpy');
});

it('rejects a package whose response does not match the installed runtime lockfile', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'amc-python-assets-'));
  directories.push(dir);
  await expect(
    preparePyodidePackages({
      manifest: {
        info: { version: '0.27.7' },
        packages: {
          numpy: { file_name: 'numpy.whl', depends: [], sha256: '0'.repeat(64) },
        },
      },
      packages: ['numpy'],
      cacheDirectory: dir,
      fetchImpl: (async () => new Response('wrong package')) as typeof fetch,
    }),
  ).rejects.toThrow(/integrity/i);
});
