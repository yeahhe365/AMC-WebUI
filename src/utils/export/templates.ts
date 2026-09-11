import { escapeHtml } from '@/utils/escapeHtml';

export const generateExportHtmlTemplate = ({
  title,
  date,
  model,
  contentHtml,
  styles,
  themeId,
  language,
  rootBgColor,
  bodyClasses,
}: {
  title: string;
  date: string;
  model: string;
  contentHtml: string;
  styles: string;
  themeId: string;
  language: string;
  rootBgColor: string;
  bodyClasses: string;
}) => {
  const safeTitle = escapeHtml(title);
  const safeDate = escapeHtml(date);
  const safeModel = escapeHtml(model);
  const safeLanguage = escapeHtml(language);
  const safeThemeId = escapeHtml(themeId);
  const safeBodyClasses = escapeHtml(bodyClasses);
  // rootBgColor is interpolated into a CSS value inside a <style> block — escapeHtml
  // alone does not stop CSS breakout (no quotes to close), so validate it matches a
  // safe CSS color token; fall back to transparent otherwise.
  const safeRootBgColor =
    /^(#[0-9a-fA-F]{3,8}|rgb\([^()]*\)|rgba\([^()]*\)|hsl\([^()]*\)|hsla\([^()]*\)|oklch\([^()]*\)|transparent|currentColor|[a-z]+)$/i.test(
      rootBgColor.trim(),
    )
      ? rootBgColor.trim()
      : 'transparent';

  return `
        <!DOCTYPE html>
        <html lang="${safeLanguage}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat Export: ${safeTitle}</title>
            ${styles}
            <style>
                /* Reset & Layout */
                html, body { height: auto !important; overflow: auto !important; min-height: 100vh; }
                body {
                    background-color: ${safeRootBgColor};
                    padding: 2rem; 
                    box-sizing: border-box; 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: var(--theme-text-primary, #333);
                }
                
                /* Container */
                .exported-chat-container {
                    width: 100%;
                    max-width: 900px;
                    margin: 0 auto;
                    background-color: transparent;
                }

                /* Header Styles */
                .exported-chat-header { 
                    padding-bottom: 1.5rem; 
                    border-bottom: 1px solid var(--theme-border-secondary, #e5e7eb); 
                    margin-bottom: 2rem; 
                }
                .exported-chat-title { 
                    font-size: 1.75rem; 
                    font-weight: 700; 
                    color: var(--theme-text-primary, inherit); 
                    margin: 0 0 0.5rem 0; 
                    line-height: 1.2;
                }
                .exported-chat-meta { 
                    font-size: 0.875rem; 
                    color: var(--theme-text-tertiary, #6b7280); 
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                }

                /* UI Cleanup - Hide interactive elements */
                .message-actions, 
                .code-block-utility-button, 
                button, 
                .sticky,
                [role="tooltip"],
                input,
                textarea { 
                    display: none !important; 
                }

                /* Message Layout Fixes */
                [data-message-id] {
                    break-inside: avoid;
                    margin-bottom: 1.5rem;
                }
                [data-message-id]:last-child {
                    margin-bottom: 0;
                }
                
                /* Links */
                a { color: var(--theme-text-link, #2563eb); text-decoration: none; }
                a:hover { text-decoration: underline; }

                /* Tables */
                table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
                th, td { 
                    border: 1px solid var(--theme-border-secondary, #e5e5e5); 
                    padding: 0.5rem 0.75rem; 
                    text-align: left; 
                }
                th { background-color: var(--theme-bg-tertiary, #f3f4f6); font-weight: 600; }

                /* Code Blocks */
                pre { 
                    background-color: var(--theme-bg-code-block, #f3f4f6); 
                    border-radius: 0.5rem; 
                    padding: 1rem; 
                    overflow-x: auto; 
                }

                /* Graphviz and Interactive Diagrams */
                [data-amc-graphviz] {
                    overflow-x: auto !important;
                    max-width: 100% !important;
                    display: block !important;
                    cursor: zoom-in;
                    -webkit-overflow-scrolling: touch;
                }
                [data-amc-graphviz] svg {
                    max-width: none !important;
                    height: auto !important;
                    display: block;
                    margin: 0 auto;
                }
                [data-amc-graphviz]::-webkit-scrollbar {
                    height: 6px;
                }
                [data-amc-graphviz]::-webkit-scrollbar-track {
                    background: transparent;
                }
                [data-amc-graphviz]::-webkit-scrollbar-thumb {
                    background: var(--theme-scrollbar-thumb, rgba(150, 150, 150, 0.4));
                    border-radius: 9999px;
                }
                [data-amc-graphviz]::-webkit-scrollbar-thumb:hover {
                    background: var(--theme-scrollbar-thumb-hover, rgba(150, 150, 150, 0.7));
                }

                /* Diagram Lightbox Modal */
                .amc-diagram-modal-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    background: rgba(15, 23, 42, 0.92);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: none;
                    flex-direction: column;
                }
                .amc-diagram-modal-backdrop.active {
                    display: flex !important;
                }
                .amc-diagram-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem 1.25rem;
                    color: #f8fafc;
                    background: rgba(15, 23, 42, 0.98);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
                    user-select: none;
                    height: 56px;
                    box-sizing: border-box;
                }
                .amc-diagram-modal-title {
                    font-size: 0.95rem;
                    font-weight: 600;
                    letter-spacing: 0.025em;
                }
                .amc-diagram-modal-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .amc-diagram-modal-backdrop .amc-diagram-btn {
                    display: inline-flex !important;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.12);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #f8fafc;
                    border-radius: 0.375rem;
                    padding: 0.35rem 0.65rem;
                    font-size: 0.85rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.15s, border-color 0.15s;
                    user-select: none;
                }
                .amc-diagram-modal-backdrop .amc-diagram-btn:hover {
                    background: rgba(255, 255, 255, 0.25);
                    border-color: rgba(255, 255, 255, 0.35);
                }
                .amc-diagram-modal-hint {
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.5);
                    margin-right: 0.5rem;
                }
                .amc-diagram-modal-viewport {
                    flex: 1;
                    width: 100%;
                    height: calc(100% - 56px);
                    overflow: hidden;
                    position: relative;
                    cursor: grab;
                }
                .amc-diagram-modal-viewport:active {
                    cursor: grabbing;
                }
                .amc-diagram-modal-canvas {
                    position: absolute;
                    left: 0;
                    top: 0;
                    transform-origin: 0 0;
                    will-change: transform;
                    pointer-events: none;
                }
                .amc-diagram-modal-canvas svg {
                    max-width: none !important;
                    height: auto !important;
                    display: block;
                }
            </style>
        </head>
        <body class="${safeBodyClasses} theme-${safeThemeId} is-exporting-png">
            <div class="exported-chat-container">
                <div class="exported-chat-header">
                    <h1 class="exported-chat-title">${safeTitle}</h1>
                    <div class="exported-chat-meta">
                        <span>${safeDate}</span> • <span>${safeModel}</span>
                    </div>
                </div>
                ${contentHtml}
            </div>
            <script>
            (function() {
                var backdrop = document.createElement('div');
                backdrop.className = 'amc-diagram-modal-backdrop';
                backdrop.innerHTML = '<div class="amc-diagram-modal-header">' +
                    '<div class="amc-diagram-modal-title">逻辑拓扑图 / Diagram Viewer</div>' +
                    '<div class="amc-diagram-modal-actions">' +
                        '<span class="amc-diagram-modal-hint">滚轮缩放 • 拖拽平移 • 双击重置</span>' +
                        '<span role="button" class="amc-diagram-btn" id="amc-zoom-in" title="放大 / Zoom In">+</span>' +
                        '<span role="button" class="amc-diagram-btn" id="amc-zoom-out" title="缩小 / Zoom Out">-</span>' +
                        '<span role="button" class="amc-diagram-btn" id="amc-zoom-reset" title="重置 / Reset">1:1</span>' +
                        '<span role="button" class="amc-diagram-btn" id="amc-zoom-fit" title="适应屏幕 / Fit">适应</span>' +
                        '<span role="button" class="amc-diagram-btn" id="amc-modal-close" title="关闭 / Close (Esc)">✕</span>' +
                    '</div>' +
                '</div>' +
                '<div class="amc-diagram-modal-viewport">' +
                    '<div class="amc-diagram-modal-canvas"></div>' +
                '</div>';
                document.body.appendChild(backdrop);

                var canvas = backdrop.querySelector('.amc-diagram-modal-canvas');
                var viewport = backdrop.querySelector('.amc-diagram-modal-viewport');
                var scale = 1;
                var translateX = 0;
                var translateY = 0;
                var isDragging = false;
                var startX = 0;
                var startY = 0;
                var initialSvgWidth = 0;
                var initialSvgHeight = 0;

                function updateTransform() {
                    canvas.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
                }

                function fitToViewport() {
                    if (!initialSvgWidth || !initialSvgHeight) return;
                    var vpRect = viewport.getBoundingClientRect();
                    var padding = 40;
                    var availW = Math.max(100, vpRect.width - padding);
                    var availH = Math.max(100, vpRect.height - padding);
                    var sW = availW / initialSvgWidth;
                    var sH = availH / initialSvgHeight;
                    scale = Math.min(sW, sH, 2.5);
                    translateX = (vpRect.width - initialSvgWidth * scale) / 2;
                    translateY = (vpRect.height - initialSvgHeight * scale) / 2;
                    updateTransform();
                }

                function reset1to1() {
                    var vpRect = viewport.getBoundingClientRect();
                    scale = 1;
                    translateX = (vpRect.width - initialSvgWidth) / 2;
                    translateY = (vpRect.height - initialSvgHeight) / 2;
                    updateTransform();
                }

                function closeModal() {
                    backdrop.classList.remove('active');
                    canvas.innerHTML = '';
                }

                function openModal(svgEl) {
                    canvas.innerHTML = '';
                    var clone = svgEl.cloneNode(true);
                    clone.style.maxWidth = 'none';
                    clone.style.margin = '0';
                    clone.style.display = 'block';

                    var vb = clone.viewBox && clone.viewBox.baseVal;
                    if (vb && vb.width && vb.height) {
                        initialSvgWidth = vb.width;
                        initialSvgHeight = vb.height;
                    } else {
                        initialSvgWidth = parseFloat(clone.getAttribute('width')) || clone.clientWidth || 800;
                        initialSvgHeight = parseFloat(clone.getAttribute('height')) || clone.clientHeight || 600;
                    }
                    clone.setAttribute('width', initialSvgWidth + 'px');
                    clone.setAttribute('height', initialSvgHeight + 'px');
                    canvas.style.width = initialSvgWidth + 'px';
                    canvas.style.height = initialSvgHeight + 'px';
                    canvas.appendChild(clone);

                    backdrop.classList.add('active');
                    fitToViewport();
                }

                backdrop.querySelector('#amc-modal-close').addEventListener('click', closeModal);
                backdrop.querySelector('#amc-zoom-in').addEventListener('click', function(e) {
                    e.stopPropagation();
                    var vpRect = viewport.getBoundingClientRect();
                    var cx = vpRect.width / 2;
                    var cy = vpRect.height / 2;
                    var newScale = Math.min(scale * 1.3, 10);
                    translateX = cx - (cx - translateX) * (newScale / scale);
                    translateY = cy - (cy - translateY) * (newScale / scale);
                    scale = newScale;
                    updateTransform();
                });
                backdrop.querySelector('#amc-zoom-out').addEventListener('click', function(e) {
                    e.stopPropagation();
                    var vpRect = viewport.getBoundingClientRect();
                    var cx = vpRect.width / 2;
                    var cy = vpRect.height / 2;
                    var newScale = Math.max(scale / 1.3, 0.1);
                    translateX = cx - (cx - translateX) * (newScale / scale);
                    translateY = cy - (cy - translateY) * (newScale / scale);
                    scale = newScale;
                    updateTransform();
                });
                backdrop.querySelector('#amc-zoom-reset').addEventListener('click', function(e) {
                    e.stopPropagation();
                    reset1to1();
                });
                backdrop.querySelector('#amc-zoom-fit').addEventListener('click', function(e) {
                    e.stopPropagation();
                    fitToViewport();
                });

                viewport.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    var delta = e.deltaY < 0 ? 1.15 : 0.87;
                    var newScale = Math.min(Math.max(scale * delta, 0.1), 15);
                    var rect = viewport.getBoundingClientRect();
                    var mouseX = e.clientX - rect.left;
                    var mouseY = e.clientY - rect.top;
                    translateX = mouseX - (mouseX - translateX) * (newScale / scale);
                    translateY = mouseY - (mouseY - translateY) * (newScale / scale);
                    scale = newScale;
                    updateTransform();
                }, { passive: false });

                viewport.addEventListener('mousedown', function(e) {
                    if (e.target.closest('.amc-diagram-btn')) return;
                    isDragging = true;
                    startX = e.clientX - translateX;
                    startY = e.clientY - translateY;
                });
                window.addEventListener('mousemove', function(e) {
                    if (!isDragging) return;
                    translateX = e.clientX - startX;
                    translateY = e.clientY - startY;
                    updateTransform();
                });
                window.addEventListener('mouseup', function() {
                    isDragging = false;
                });

                var touchStartDist = 0;
                var touchStartScale = 1;
                viewport.addEventListener('touchstart', function(e) {
                    if (e.touches.length === 1) {
                        isDragging = true;
                        startX = e.touches[0].clientX - translateX;
                        startY = e.touches[0].clientY - translateY;
                    } else if (e.touches.length === 2) {
                        isDragging = false;
                        var dx = e.touches[0].clientX - e.touches[1].clientX;
                        var dy = e.touches[0].clientY - e.touches[1].clientY;
                        touchStartDist = Math.sqrt(dx * dx + dy * dy);
                        touchStartScale = scale;
                    }
                }, { passive: true });
                viewport.addEventListener('touchmove', function(e) {
                    if (e.touches.length === 1 && isDragging) {
                        translateX = e.touches[0].clientX - startX;
                        translateY = e.touches[0].clientY - startY;
                        updateTransform();
                    } else if (e.touches.length === 2 && touchStartDist > 0) {
                        var dx = e.touches[0].clientX - e.touches[1].clientX;
                        var dy = e.touches[0].clientY - e.touches[1].clientY;
                        var dist = Math.sqrt(dx * dx + dy * dy);
                        var newScale = Math.min(Math.max(touchStartScale * (dist / touchStartDist), 0.1), 15);
                        scale = newScale;
                        updateTransform();
                    }
                }, { passive: true });
                viewport.addEventListener('touchend', function() {
                    isDragging = false;
                    touchStartDist = 0;
                });

                viewport.addEventListener('dblclick', function(e) {
                    if (e.target.closest('.amc-diagram-btn')) return;
                    if (Math.abs(scale - 1) < 0.1) {
                        fitToViewport();
                    } else {
                        reset1to1();
                    }
                });

                window.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && backdrop.classList.contains('active')) {
                        closeModal();
                    }
                });

                document.addEventListener('click', function(e) {
                    var sel = window.getSelection();
                    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
                    var target = e.target;
                    if (!(target instanceof Element)) return;
                    var container = target.closest('[data-amc-graphviz]');
                    if (!container) return;
                    if (target.closest('a, button, input, select, textarea')) return;
                    var svg = container.querySelector('svg');
                    if (!svg) return;
                    e.preventDefault();
                    e.stopPropagation();
                    openModal(svg);
                });
            })();
            </script>
        </body>
        </html>
    `;
};

export const generateExportTxtTemplate = ({
  title,
  date,
  model,
  messages,
}: {
  title: string;
  date: string;
  model: string;
  messages: Array<{ role: string; timestamp: Date; content: string; files?: Array<{ name: string }> }>;
}) => {
  const separator = '-'.repeat(40);

  const header = [`Chat: ${title}`, `Date: ${date}`, `Model: ${model}`, '='.repeat(40), ''].join('\n');

  const body = messages
    .map((message) => {
      const roleTitle = message.role.toUpperCase();
      const timestampText = new Date(message.timestamp).toLocaleString();
      let text = `### ${roleTitle} [${timestampText}]\n`;

      if (message.files && message.files.length > 0) {
        message.files.forEach((file) => {
          text += `[Attachment: ${file.name}]\n`;
        });
      }

      text += message.content;
      return text;
    })
    .join(`\n\n${separator}\n\n`);

  return header + body;
};
