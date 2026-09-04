import { type UploadedFile } from '@/types';

/**
 * Encodes an SVG string as a base64 `data:image/svg+xml` URL.
 *
 * Shared by the diagram blocks (Graphviz / Mermaid) when building the preview
 * `UploadedFile` handed to `DiagramWrapper` for the image viewer / side panel.
 */
export const svgToDataUrl = (svgString: string): string =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;

interface SvgToUploadedFileOptions {
  /** Identifier for the constructed file (also used as the mermaid render id). */
  id: string;
  /** Display name, e.g. `graphviz-diagram.svg`. */
  name: string;
  /**
   * Overrides the reported byte size. Defaults to the length of `svgString`.
   * MermaidBlock passes its pre-sanitization render output here to preserve
   * the historical size semantics (sanitized SVG drives the data URL, raw
   * render output drives the size).
   */
  size?: number;
}

/**
 * Builds the preview `UploadedFile` for a rendered diagram SVG.
 */
export const svgToUploadedFile = (svgString: string, { id, name, size }: SvgToUploadedFileOptions): UploadedFile => ({
  id,
  name,
  type: 'image/svg+xml',
  size: size ?? svgString.length,
  dataUrl: svgToDataUrl(svgString),
  uploadState: 'active',
});
