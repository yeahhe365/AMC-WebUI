import { logService } from '@/services/logService';
import { sanitizeCssColorFunctionsForPngExport } from './cssColorSanitizer';
import { isDarkThemeId } from '@/utils/themeMode';
import { createStaticPreviewSnapshotContainer } from '@/utils/html-preview/previewDocument';

const DEFAULT_EXPORT_WIDTH = '800px';

// SECURITY: values interpolated into the export snapshot's innerHTML / inline styles
// must be sanitized so a malicious theme CSS variable or body class name cannot break
// out of the style attribute or inject markup. Allow only CSS-color-ish tokens
// (hex, rgb/rgba/oklch/hsl, var(), named colors) and CSS-class-name characters.
const CSS_COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|rgb\([^()]*\)|rgba\([^()]*\)|hsl\([^()]*\)|hsla\([^()]*\)|oklch\([^()]*\)|transparent|currentColor|[a-z]+)$/i;
const CSS_CLASS_PATTERN = /^[a-zA-Z0-9 _-]*$/;
const THEME_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const sanitizeExportCssColor = (value: string): string => {
  const trimmed = value.trim();
  return CSS_COLOR_PATTERN.test(trimmed) ? trimmed : 'transparent';
};

const sanitizeExportClassNames = (value: string): string => {
  const trimmed = value.trim();
  return CSS_CLASS_PATTERN.test(trimmed) ? trimmed : '';
};

const sanitizeExportThemeId = (value: string): string => {
  const trimmed = value.trim();
  return THEME_ID_PATTERN.test(trimmed) ? trimmed : '';
};

const isExportableStylesheetContentType = (contentType: string): boolean =>
  contentType.includes('text/css') || contentType.includes('application/octet-stream');

/**
 * Gathers all style and link tags from the current document's head to be inlined.
 * @returns A promise that resolves to a string of HTML style and link tags.
 */
export const gatherPageStyles = async (): Promise<string> => {
  const stylePromises = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]')).map(
    async (element) => {
      if (element.tagName === 'STYLE') {
        return `<style>${sanitizeCssColorFunctionsForPngExport(element.innerHTML)}</style>`;
      }
      if (element.tagName === 'LINK' && (element as HTMLLinkElement).rel === 'stylesheet') {
        const href = (element as HTMLLinkElement).href;

        try {
          const response = await fetch(href);
          if (!response.ok) throw new Error(response.statusText);

          const contentType = response.headers.get('content-type');
          if (contentType && !isExportableStylesheetContentType(contentType)) {
            logService.warn(`Skipping stylesheet ${href} due to invalid MIME: ${contentType}`);
            return '';
          }

          const stylesheetCss = await response.text();
          return `<style>${sanitizeCssColorFunctionsForPngExport(stylesheetCss)}</style>`;
        } catch (stylesheetError) {
          logService.warn('Could not fetch stylesheet for export.', { href, error: stylesheetError });
          return '';
        }
      }
      return '';
    },
  );

  return (await Promise.all(stylePromises)).join('\n');
};

/**
 * Embeds images in a cloned DOM element by converting their sources to Base64 data URIs.
 * This allows the HTML to be self-contained (offline-capable).
 * @param clone The cloned HTMLElement to process.
 */
const embedImagesInClone = async (clone: HTMLElement): Promise<void> => {
  const images = Array.from(clone.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      try {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;

        const response = await fetch(img.src);
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise<void>((resolve) => {
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              img.src = reader.result;
              img.removeAttribute('srcset');
              img.removeAttribute('loading');
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(blob);
        });
      } catch (embedError) {
        logService.warn('Failed to embed image for export:', embedError);
      }
    }),
  );
};

/**
 * Replaces sandboxed Live Artifact iframes with same-origin static snapshots.
 *
 * `cloneNode(true)` copies the `<iframe>` tag but not its rendered document, and
 * html2canvas cannot render cross-origin/sandboxed iframe content — so the
 * artifact would export as a blank box. Instead, we read the inert source HTML
 * stashed on the frame by `ArtifactFrame` and rebuild it as a same-origin
 * container via `createStaticPreviewSnapshotContainer`, preserving the measured
 * viewport height so the exported layout matches the on-screen bubble.
 */
const replaceLiveArtifactIframes = async (
  clone: HTMLElement,
  targetDocument: Document,
  themeId?: string,
): Promise<void> => {
  const artifactFrames = Array.from(clone.querySelectorAll('[data-live-artifact-frame="true"]'));
  for (const frame of artifactFrames) {
    const html = frame.getAttribute('data-artifact-source') ?? '';
    if (!html.trim()) continue;

    const viewport = frame.querySelector<HTMLElement>('[data-live-artifact-viewport="true"]');
    const measuredHeight = viewport?.style.height ?? null;

    const { container } = await createStaticPreviewSnapshotContainer(html, targetDocument, { themeId });

    // The snapshot container is positioned off-screen by default; reset it so it
    // flows inline within the exported transcript instead of being hidden.
    Object.assign(container.style, {
      position: 'static',
      transform: 'none',
      left: 'auto',
      top: 'auto',
      width: '100%',
      maxWidth: '100%',
      pointerEvents: 'auto',
      zIndex: 'auto',
    });
    if (measuredHeight) {
      container.style.height = measuredHeight;
    }

    frame.replaceWith(container);
  }
};

/**
 * Creates an isolated DOM container for exporting, injecting current styles and theme.
 */
export const createSnapshotContainer = async (
  themeId: string,
  width: string = DEFAULT_EXPORT_WIDTH,
): Promise<{ container: HTMLElement; innerContent: HTMLElement; remove: () => void; rootBgColor: string }> => {
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0px';
  tempContainer.style.width = width;
  tempContainer.style.padding = '0';
  tempContainer.style.zIndex = '-1';
  tempContainer.style.boxSizing = 'border-box';

  const allStyles = await gatherPageStyles();
  const bodyClasses = sanitizeExportClassNames(document.body.className);

  let rootBgColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-bg-primary').trim();
  if (!rootBgColor) {
    rootBgColor = isDarkThemeId(themeId) ? '#09090b' : '#FFFFFF';
  }
  const safeBgColor = sanitizeExportCssColor(rootBgColor);
  const safeThemeId = sanitizeExportThemeId(themeId);

  tempContainer.innerHTML = `
        ${allStyles}
        <div class="theme-${safeThemeId} ${bodyClasses} is-exporting-png" style="background-color: ${safeBgColor}; color: var(--theme-text-primary); min-height: 100vh;">
            <div style="background-color: ${safeBgColor}; padding: 0;">
                <div class="exported-chat-container" style="width: 100%; max-width: 100%; margin: 0 auto;">
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(tempContainer);

  const innerContent = tempContainer.querySelector('.exported-chat-container') as HTMLElement;
  const captureTarget = tempContainer.querySelector<HTMLElement>(':scope > div');

  if (!innerContent || !captureTarget) {
    document.body.removeChild(tempContainer);
    throw new Error('Failed to create snapshot container structure');
  }

  return {
    container: captureTarget,
    innerContent,
    remove: () => {
      if (document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
    },
    rootBgColor: safeBgColor,
  };
};

/**
 * Creates a standard header DOM element for exported images.
 */
export const createExportDOMHeader = (title: string, metaLeft: string, metaRight: string): HTMLElement => {
  const headerDiv = document.createElement('div');
  headerDiv.style.padding = '2rem 2rem 1rem 2rem';
  headerDiv.style.borderBottom = '1px solid var(--theme-border-secondary)';
  headerDiv.style.marginBottom = '1rem';

  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '1.5rem';
  titleEl.style.fontWeight = 'bold';
  titleEl.style.color = 'var(--theme-text-primary)';
  titleEl.style.marginBottom = '0.5rem';
  titleEl.textContent = title;

  const metaDiv = document.createElement('div');
  metaDiv.style.fontSize = '0.875rem';
  metaDiv.style.color = 'var(--theme-text-tertiary)';
  metaDiv.style.display = 'flex';
  metaDiv.style.gap = '1rem';

  const leftSpan = document.createElement('span');
  leftSpan.textContent = metaLeft;
  const separatorSpan = document.createElement('span');
  separatorSpan.textContent = '•';
  const rightSpan = document.createElement('span');
  rightSpan.textContent = metaRight;

  headerDiv.appendChild(titleEl);
  metaDiv.appendChild(leftSpan);
  metaDiv.appendChild(separatorSpan);
  metaDiv.appendChild(rightSpan);
  headerDiv.appendChild(metaDiv);

  return headerDiv;
};

/**
 * Clones, cleans, and prepares a DOM element for export (HTML or PNG).
 * Handles removing interactive elements, expanding content, embedding images,
 * and normalizing layout artifacts from virtualization.
 *
 * @param sourceElement The live DOM element to prepare for export.
 * @param options.expandDetails Whether to expand collapsible sections (true for PNG).
 * @param options.forPng Whether this is a PNG export path (triggers iframe replacement).
 * @param options.themeId Theme id used to hydrate chart snapshots with matching colors.
 */
export const prepareElementForExport = async (
  sourceElement: HTMLElement,
  options: { expandDetails?: boolean; forPng?: boolean; themeId?: string } = {},
): Promise<HTMLElement> => {
  const { expandDetails = true, forPng = false, themeId } = options;

  const clone = sourceElement.cloneNode(true) as HTMLElement;

  // Normalize virtualization offsets before snapshotting.
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  clone.style.maxHeight = 'none';

  const potentialLists = Array.from(clone.children) as HTMLElement[];
  potentialLists.forEach((child) => {
    if (child.style.paddingTop) child.style.paddingTop = '0px';
    if (child.style.marginTop) child.style.marginTop = '0px';
    if (child.style.transform) child.style.transform = 'none';
    if (child.style.position === 'absolute') child.style.position = 'static';
  });

  const selectorsToRemove = [
    'button',
    '.message-actions',
    '.sticky',
    'input',
    'textarea',
    '.code-block-utility-button',
    '[role="tooltip"]',
    '.loading-dots-container',
  ];
  clone.querySelectorAll(selectorsToRemove.join(',')).forEach((element) => element.remove());

  clone.querySelectorAll('[data-message-id]').forEach((element) => {
    (element as HTMLElement).style.animation = 'none';
    (element as HTMLElement).style.opacity = '1';
    (element as HTMLElement).style.transform = 'none';
  });

  if (expandDetails) {
    clone.querySelectorAll('.message-thoughts-block').forEach((element) => element.remove());

    clone.querySelectorAll('.code-block-expand-overlay').forEach((element) => element.remove());

    clone.querySelectorAll('pre').forEach((element) => {
      (element as HTMLElement).style.maxHeight = 'none';
      (element as HTMLElement).style.height = 'auto';
      (element as HTMLElement).style.overflow = 'visible';
    });

    clone.querySelectorAll('details').forEach((element) => element.setAttribute('open', 'true'));
  } else {
    clone.querySelectorAll('details').forEach((element) => element.removeAttribute('open'));

    clone.querySelectorAll('.thought-process-accordion').forEach((accordion) => {
      const parent = accordion.parentElement;
      if (!parent) return;

      const header = parent.firstElementChild as HTMLElement;
      if (!header || header === accordion) return;

      const details = document.createElement('details');
      details.className = parent.className;

      const summary = document.createElement('summary');
      summary.className = header.className;
      summary.style.cursor = 'pointer';
      summary.style.listStyle = 'none';

      const style = document.createElement('style');
      style.textContent = 'summary::-webkit-details-marker { display: none; }';
      summary.appendChild(style);

      while (header.firstChild) {
        summary.appendChild(header.firstChild);
      }

      const svg = summary.querySelector('svg');
      if (svg && svg.classList.contains('transition-transform')) {
        svg.classList.remove('rotate-180');
        svg.classList.add('group-open:rotate-180');
      }

      const inner = accordion.querySelector('.thought-process-inner') || accordion;
      const contentWrapper = document.createElement('div');
      contentWrapper.className = inner.className;

      while (inner.firstChild) {
        contentWrapper.appendChild(inner.firstChild);
      }

      details.appendChild(summary);
      details.appendChild(contentWrapper);

      parent.replaceWith(details);
    });
  }

  // Replace sandboxed artifact iframes with same-origin static snapshots for PNG export.
  // HTML export preserves the iframe srcdoc so the artifact remains runnable when reopened.
  if (forPng) {
    await replaceLiveArtifactIframes(clone, sourceElement.ownerDocument, themeId);
  }

  // Embed blob and remote images before the clone leaves the live document.
  await embedImagesInClone(clone);

  return clone;
};
