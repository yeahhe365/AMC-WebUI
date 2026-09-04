export const HTML_PREVIEW_MESSAGE_CHANNEL = 'amc-webui-html-preview';
export const HTML_PREVIEW_STREAM_RENDER_EVENT = 'stream-render';
export const HTML_PREVIEW_CLEAR_SELECTION_EVENT = 'clear-selection';
export const HTML_PREVIEW_COPY_EVENT = 'copy';
export const HTML_PREVIEW_DIAGNOSTIC_EVENT = 'diagnostic';

/**
 * Live Artifacts graphviz bridge. The sandboxed iframe cannot run viz.js
 * (WASM + opaque origin), so a `data-amc-graphviz` node asks the parent page to
 * lay out the DOT and replies with sanitized SVG:
 *
 *   iframe → parent: { channel, event: graphviz-render-request, payload: { id, dot } }
 *   parent → iframe: { channel, event: graphviz-render-response, payload: { id, ok, svg } | { id, ok:false, error } }
 */
export const HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT = 'graphviz-render-request';
export const HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT = 'graphviz-render-response';
