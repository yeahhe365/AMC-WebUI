import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const repository = process.cwd();
const requireFromRepo = createRequire(`${repository}/package.json`);
const requireFromVite = createRequire(requireFromRepo.resolve('vite'));
const lexer = await import(requireFromVite.resolve('es-module-lexer'));
await lexer.init;
const dist = path.resolve(process.argv[2] || path.join(repository, 'dist'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
if (!entry) throw new Error('Missing startup entry in index.html.');
// Vite's base may be /app/ or a complete CDN URL. Match the emitted path
// beneath dist, requiring a unique file rather than accepting a zero-byte scan.
function resolveEntryFile(url) {
  const segments = decodeURIComponent(new URL(url, 'https://build.invalid/').pathname).split('/').filter(Boolean);
  const candidates = new Set();
  for (let start = 0; start < segments.length; start += 1) {
    const file = path.resolve(dist, ...segments.slice(start));
    if (file.startsWith(`${dist}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile())
      candidates.add(file);
  }
  if (candidates.size !== 1) throw new Error(`Missing or ambiguous startup asset: ${url}`);
  return [...candidates][0];
}
const visited = new Set();
function walk(file, seen = visited) {
  file = path.normalize(file);
  if (seen.has(file)) return;
  if (!fs.existsSync(file) || !file.startsWith(`${dist}${path.sep}`)) throw new Error(`Missing startup asset: ${file}`);
  seen.add(file);
  const [imports] = lexer.parse(fs.readFileSync(file, 'utf8'));
  for (const item of imports)
    if (item.d === -1 && item.n?.startsWith('.')) {
      walk(path.resolve(path.dirname(file), item.n), seen);
    }
}
walk(resolveEntryFile(entry));
const chunks = [...visited]
  .map((file) => {
    const bytes = fs.readFileSync(file);
    return { file: path.relative(dist, file), bytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length };
  })
  .sort((a, b) => b.bytes - a.bytes);
function listFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(file) : [{ file: path.relative(dist, file), bytes: fs.statSync(file).size }];
  });
}
const files = listFiles(dist);
// The shell immediately renders this lazy component. Its closure must survive
// image cache churn even though it is outside the entry's static JS budget.
const offlineRequiredFiles = new Set(visited);
for (const asset of files) {
  if (/^assets\/HistorySidebar-.*\.js$/.test(asset.file)) walk(path.join(dist, asset.file), offlineRequiredFiles);
}
const serviceWorker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
const precacheUrls = [...serviceWorker.matchAll(/(?:\burl|["']url["'])\s*:\s*["']([^"']+)["']/g)].map(
  (match) => match[1],
);
for (const file of offlineRequiredFiles) {
  const asset = path.relative(dist, file).split(path.sep).join('/');
  if (!precacheUrls.some((url) => url === asset || url.endsWith(`/${asset}`))) {
    throw new Error(`Startup asset missing from offline precache: ${asset}`);
  }
}
console.log(
  JSON.stringify(
    {
      entry,
      offlineRequiredFiles: offlineRequiredFiles.size,
      staticImportClosure: {
        files: chunks.length,
        bytes: chunks.reduce((n, x) => n + x.bytes, 0),
        gzipBytes: chunks.reduce((n, x) => n + x.gzipBytes, 0),
        chunks,
      },
      distribution: {
        files: files.length,
        bytes: files.reduce((n, x) => n + x.bytes, 0),
        cjkFontBytes: files
          .filter((x) => x.file.startsWith('fonts/') && /\.ttf(?:\.part-\d+)?$/.test(x.file))
          .reduce((n, x) => n + x.bytes, 0),
        pyodideBytes: files.filter((x) => x.file.startsWith('pyodide/')).reduce((n, x) => n + x.bytes, 0),
      },
    },
    null,
    2,
  ),
);

// Gate actual static imports, including chunks omitted from modulepreload.
const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
if (total > 2_600_000 || chunks.some((chunk) => /genai-vendor-/.test(chunk.file))) {
  console.error('Startup budget exceeded: expected <=2.6 MB and no eager GenAI SDK.');
  process.exitCode = 1;
}
