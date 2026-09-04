// Keep the served worker pinned to the same pdfjs-dist version bundled under react-pdf.
// pnpm isolates dependencies, so top-level pdfjs-dist is symlinked and preferred for both npm/pnpm.
export const PDF_WORKER_COPY_SOURCE = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
export const LAMEJS_WORKER_COPY_SOURCE = 'node_modules/lamejs/lame.min.js';
