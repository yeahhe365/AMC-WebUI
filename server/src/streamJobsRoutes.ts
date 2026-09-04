// Route prefixes for the stream-abort endpoint, kept in their own module so
// the createServer request router can reference them without importing the job
// store (which would pull the AbortController/listener internals into routing).
//
// UNIFIED_STREAM_ABORT_PREFIX is the provider-agnostic path: it terminates any
// job in the shared store regardless of which provider (Gemini, OpenAI-
// compatible, Anthropic) started it. STREAM_ABORT_PREFIX is the legacy
// Gemini-only alias, retained so existing browser clients that still call
// /api/gemini/stream-abort/:id keep working without a client change.
export const UNIFIED_STREAM_ABORT_PREFIX = '/api/stream-abort';
export const STREAM_ABORT_PREFIX = '/api/gemini/stream-abort';
