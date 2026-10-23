import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

interface PyodideManifest {
  info: { version: string };
  packages: Record<string, { file_name: string; depends: string[]; sha256: string }>;
}

/** The npm runtime omits wheels. Cache selected packages by the runtime's own
 * integrity manifest so a fresh checkout ships the same scientific runtime. */
export async function preparePyodidePackages({
  manifest,
  packages,
  cacheDirectory,
  fetchImpl = fetch,
}: {
  manifest: PyodideManifest;
  packages: string[];
  cacheDirectory: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const selected = new Set<string>();
  const visit = (name: string) => {
    if (selected.has(name)) return;
    const record = manifest.packages[name];
    if (!record) throw new Error(`Missing Pyodide package: ${name}`);
    selected.add(name);
    record.depends.forEach(visit);
  };
  packages.forEach(visit);
  await mkdir(cacheDirectory, { recursive: true });
  const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const prepare = async (name: string) => {
    const record = manifest.packages[name];
    if (path.basename(record.file_name) !== record.file_name) throw new Error('Invalid Pyodide asset path.');
    const target = path.join(cacheDirectory, record.file_name);
    const existing = await readFile(target).catch(() => null);
    if (existing && sha(existing) === record.sha256) return;
    const url = `https://cdn.jsdelivr.net/pyodide/v${manifest.info.version}/full/${record.file_name}`;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Pyodide package download failed (${response.status}): ${name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha(bytes) !== record.sha256) throw new Error(`Pyodide package integrity check failed: ${name}`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  };
  const names = [...selected];
  for (let offset = 0; offset < names.length; offset += 4)
    await Promise.all(names.slice(offset, offset + 4).map(prepare));
}

export async function prepareDefaultPyodidePackages(): Promise<string> {
  const manifest = JSON.parse(await readFile('node_modules/pyodide/pyodide-lock.json', 'utf8')) as PyodideManifest;
  const cacheDirectory = path.resolve('node_modules/.cache/amc-pyodide', manifest.info.version);
  await preparePyodidePackages({
    manifest,
    cacheDirectory,
    packages: ['micropip', 'numpy', 'pandas', 'matplotlib', 'scipy', 'scikit-learn', 'sympy'],
  });
  return cacheDirectory;
}
