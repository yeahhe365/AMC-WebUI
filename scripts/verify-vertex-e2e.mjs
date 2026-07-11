#!/usr/bin/env node
/**
 * Vertex backend end-to-end smoke test against a real GCP project.
 *
 * Required env:
 *   GCP_PROJECT_ID            project hosting the api server's Vertex usage
 *   GCS_BUCKET                bucket the api server is writing to
 *   GOOGLE_APPLICATION_CREDENTIALS  SA JSON path (script reads GCS directly to verify)
 *
 * Optional env:
 *   API_BASE_URL              default http://localhost:8080 (Docker web service)
 *   GCS_OBJECT_PREFIX         default amc-files/ (must match the api server)
 *   VERTEX_TEXT_MODEL         default gemini-2.5-flash
 *   VERTEX_IMAGE_MODEL        default imagen-4.0-generate-001
 *   SKIP_IMAGEN=1             skip the Imagen step (saves credits)
 *   NO_CLEANUP=1              leave the uploaded GCS object behind for inspection
 *
 * Usage:
 *   docker compose up -d
 *   node scripts/verify-vertex-e2e.mjs
 */
import { Storage } from '@google-cloud/storage';
import { crc32, deflateSync } from 'node:zlib';

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const GCP_PROJECT_ID = required('GCP_PROJECT_ID');
const GCS_BUCKET = required('GCS_BUCKET');
const GCS_OBJECT_PREFIX = (process.env.GCS_OBJECT_PREFIX ?? 'amc-files/').replace(/^\/+/, '');
const TEXT_MODEL = process.env.VERTEX_TEXT_MODEL ?? 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL ?? 'imagen-4.0-generate-001';
const SKIP_IMAGEN = process.env.SKIP_IMAGEN === '1';
const NO_CLEANUP = process.env.NO_CLEANUP === '1';

function buildPngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crcValue = crc32(Buffer.concat([typeBytes, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBytes, data, crcBuf]);
}

function buildSolidColorPng(size, [r, g, b]) {
  const rowBytes = Buffer.alloc(1 + size * 3);
  rowBytes[0] = 0;
  for (let x = 0; x < size; x++) {
    rowBytes[1 + x * 3] = r;
    rowBytes[2 + x * 3] = g;
    rowBytes[3 + x * 3] = b;
  }
  const raw = Buffer.alloc(rowBytes.length * size);
  for (let y = 0; y < size; y++) {
    rowBytes.copy(raw, y * rowBytes.length);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    buildPngChunk('IHDR', ihdr),
    buildPngChunk('IDAT', idat),
    buildPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function http(path, init = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const response = await fetch(url, init);
  return { response, url };
}

async function expectJsonOk({ response, url }, context) {
  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(`${context}: ${response.status} ${response.statusText}\nURL: ${url}\nBody: ${body.slice(0, 500)}`);
  }
  return await response.json();
}

async function checkHealth() {
  const result = await http('/health');
  const body = await expectJsonOk(result, 'GET /health');
  assert(body.status === 'ok', `/health did not return status=ok (got ${JSON.stringify(body)})`);
  console.log(`  ✓ /health → ok (uptime ${body.uptimeSeconds}s)`);
}

async function checkTextGenerate() {
  const result = await http(`/api/gemini/v1beta/models/${TEXT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ping' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 256 },
    }),
  });
  const body = await expectJsonOk(result, `generateContent ${TEXT_MODEL}`);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  assert(text.toLowerCase().includes('ping'), `text generate did not contain "ping": got ${JSON.stringify(text)}`);
  console.log(`  ✓ generateContent ${TEXT_MODEL} → "${text.trim().slice(0, 40)}"`);
}

async function checkFileUpload() {
  const pngBytes = buildSolidColorPng(32, [220, 30, 30]);
  const half = Math.floor(pngBytes.byteLength / 2);
  const chunk1 = pngBytes.subarray(0, half);
  const chunk2 = pngBytes.subarray(half);

  const initiate = await http('/api/gemini/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(pngBytes.byteLength),
      'x-goog-upload-header-content-type': 'image/png',
    },
    body: JSON.stringify({
      file: { displayName: 'e2e-red.png', mimeType: 'image/png', sizeBytes: String(pngBytes.byteLength) },
    }),
  });
  if (!initiate.response.ok) {
    const body = await initiate.response.text().catch(() => '');
    throw new Error(`initiate failed: ${initiate.response.status}\n${body}`);
  }
  const uploadUrl = initiate.response.headers.get('x-goog-upload-url');
  assert(uploadUrl, 'initiate did not return x-goog-upload-url');
  // Mimic the frontend's buildProxiedUploadUrl: the server returns the chunk path under the
  // upstream host, the frontend (or this script) routes it back through the /api/gemini proxy.
  const chunkPath = `/api/gemini${new URL(uploadUrl).pathname}`;
  console.log(`  ✓ initiate → ${chunkPath}`);

  const chunk1Res = await http(chunkPath, {
    method: 'POST',
    headers: { 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload' },
    body: chunk1,
  });
  assert(chunk1Res.response.status === 200, `chunk 1 status ${chunk1Res.response.status}`);
  assert(
    chunk1Res.response.headers.get('x-goog-upload-status') === 'active',
    'chunk 1 should be active, got ' + chunk1Res.response.headers.get('x-goog-upload-status'),
  );

  const chunk2Res = await http(chunkPath, {
    method: 'POST',
    headers: { 'x-goog-upload-offset': String(half), 'x-goog-upload-command': 'upload, finalize' },
    body: chunk2,
  });
  const finalBody = await expectJsonOk(chunk2Res, 'chunk finalize');
  const file = finalBody.file;
  assert(file?.name?.startsWith('files/'), `unexpected file.name: ${file?.name}`);
  assert(file?.state === 'ACTIVE', `unexpected state: ${file?.state}`);
  assert(file?.uri?.includes('/v1beta/files/'), `unexpected uri: ${file?.uri}`);

  const fileId = file.name.slice('files/'.length);
  console.log(`  ✓ resumable upload finalized → ${file.name} (${pngBytes.byteLength} bytes, 2 chunks)`);
  return { file, fileId };
}

async function checkGcsObjectExists(fileId, storage) {
  const objectPath = `${GCS_OBJECT_PREFIX}${fileId}`;
  const gcsFile = storage.bucket(GCS_BUCKET).file(objectPath);
  const [exists] = await gcsFile.exists();
  assert(exists, `GCS object gs://${GCS_BUCKET}/${objectPath} not found`);
  const [meta] = await gcsFile.getMetadata();
  assert(meta.contentType === 'image/png', `unexpected contentType: ${meta.contentType}`);
  console.log(`  ✓ gs://${GCS_BUCKET}/${objectPath} exists (${meta.size} bytes, ${meta.contentType})`);
}

async function checkFileMetadataRefresh(fileName) {
  const result = await http(`/api/gemini/v1beta/${fileName}`);
  const body = await expectJsonOk(result, `GET /v1beta/${fileName}`);
  assert(body.state === 'ACTIVE', `metadata state ${body.state}`);
  assert(body.name === fileName, `metadata name mismatch ${body.name}`);
  console.log(`  ✓ metadata refresh → ACTIVE, uri=${body.uri.slice(0, 60)}…`);
}

async function checkMultimodalGenerate(file) {
  const result = await http(`/api/gemini/v1beta/models/${TEXT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { mimeType: 'image/png', fileUri: file.uri } },
            { text: 'What single color dominates this image? Reply with one word.' },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 256 },
    }),
  });
  const body = await expectJsonOk(result, `multimodal generateContent`);
  const text =
    body.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('') ?? '';
  assert(text.length > 0, `multimodal response had no text: ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`  ✓ multimodal generateContent → "${text.trim().slice(0, 40)}"`);
  if (!text.toLowerCase().includes('red')) {
    console.warn(`  ! model did not say "red" (got "${text.trim()}") — image fetched but content may be misclassified`);
  }
}

async function checkImagen() {
  const result = await http(`/api/gemini/v1beta/models/${IMAGE_MODEL}:predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: 'a flat red square on white background' }],
      parameters: { sampleCount: 1 },
    }),
  });
  const body = await expectJsonOk(result, `Imagen ${IMAGE_MODEL}:predict`);
  const predictions = body.predictions ?? [];
  assert(predictions.length > 0, 'Imagen returned no predictions');
  const first = predictions[0];
  const imageBytes = first.bytesBase64Encoded ?? first.imageBytes ?? first.image?.bytesBase64Encoded;
  assert(typeof imageBytes === 'string' && imageBytes.length > 100, 'Imagen response missing base64 bytes');
  console.log(`  ✓ Imagen ${IMAGE_MODEL} → 1 image (${Math.round((imageBytes.length * 3) / 4)} bytes)`);
}

async function cleanupGcsObject(fileId, storage) {
  const objectPath = `${GCS_OBJECT_PREFIX}${fileId}`;
  await storage.bucket(GCS_BUCKET).file(objectPath).delete({ ignoreNotFound: true });
  console.log(`  ✓ deleted gs://${GCS_BUCKET}/${objectPath}`);
}

async function main() {
  console.log(`Vertex e2e smoke test`);
  console.log(`  api:     ${API_BASE_URL}`);
  console.log(`  project: ${GCP_PROJECT_ID}`);
  console.log(`  bucket:  gs://${GCS_BUCKET}/${GCS_OBJECT_PREFIX}`);
  console.log(`  models:  text=${TEXT_MODEL}, image=${IMAGE_MODEL}${SKIP_IMAGEN ? ' (skipped)' : ''}`);
  console.log();

  const storage = new Storage({ projectId: GCP_PROJECT_ID });

  console.log('[1/6] health');
  await checkHealth();

  console.log('[2/6] text generate');
  await checkTextGenerate();

  console.log('[3/6] file upload (resumable, 2 chunks)');
  const { file, fileId } = await checkFileUpload();

  try {
    console.log('[4/6] direct GCS object check');
    await checkGcsObjectExists(fileId, storage);

    console.log('[5/6] metadata refresh + multimodal generate');
    await checkFileMetadataRefresh(file.name);
    await checkMultimodalGenerate(file);

    if (!SKIP_IMAGEN) {
      console.log('[6/6] Imagen predict');
      await checkImagen();
    } else {
      console.log('[6/6] Imagen predict (skipped via SKIP_IMAGEN=1)');
    }
  } finally {
    if (!NO_CLEANUP) {
      console.log('cleanup');
      await cleanupGcsObject(fileId, storage).catch((error) => {
        console.warn(`  ! cleanup failed: ${error.message}`);
      });
    } else {
      console.log(`cleanup (skipped via NO_CLEANUP=1) — gs://${GCS_BUCKET}/${GCS_OBJECT_PREFIX}${fileId}`);
    }
  }

  console.log();
  console.log('All Vertex e2e checks passed.');
}

main().catch((error) => {
  console.error();
  console.error('Vertex e2e FAILED:');
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
