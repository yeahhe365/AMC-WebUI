import { CHART_RENDERER_SCRIPT } from './chartRendererScript';
import { GRAPHVIZ_RENDERER_SCRIPT } from './graphvizRendererScript';
import {
  HTML_PREVIEW_COPY_EVENT,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
} from './previewMessageProtocol';

export const PREVIEW_BRIDGE_SCRIPT = `<script>
(() => {
  const channel = ${JSON.stringify(HTML_PREVIEW_MESSAGE_CHANNEL)};
  const notify = (event, payload) => {
    try {
      parent.postMessage(payload === undefined ? { channel, event } : { channel, event, payload }, '*');
    } catch {}
  };
  const notifyDiagnostic = (payload) => notify(${JSON.stringify(HTML_PREVIEW_DIAGNOSTIC_EVENT)}, payload);
  const readResourceUrl = (element) => {
    if (!(element instanceof Element)) return undefined;
    return element.getAttribute('src') || element.getAttribute('href') || element.getAttribute('poster') || undefined;
  };
  const isSupportedResourceError = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();
    if (!['img', 'script', 'link', 'video', 'audio', 'source'].includes(tagName)) {
      return false;
    }

    notifyDiagnostic({
      type: 'resource-error',
      tagName,
      url: readResourceUrl(target),
    });
    return true;
  };
  window.addEventListener('error', (event) => {
    if (isSupportedResourceError(event)) return;

    notifyDiagnostic({
      type: 'runtime-error',
      message: event.message || 'Unknown preview runtime error',
      source: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
    });
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    notifyDiagnostic({
      type: 'runtime-error',
      message: reason && typeof reason.message === 'string' ? reason.message : String(reason || 'Unhandled promise rejection'),
    });
  });
  window.addEventListener('securitypolicyviolation', (event) => {
    notifyDiagnostic({
      type: 'csp-violation',
      blockedURI: event.blockedURI,
      violatedDirective: event.violatedDirective,
      effectiveDirective: event.effectiveDirective,
    });
  });
  // Measure intrinsic content height — never use body/html offsetHeight.
  // Those equal the iframe viewport once the parent sets a fixed height, which
  // creates a ratchet (height only grows) and large blank regions under short content.
  // Also briefly neutralize height/min-height on the document shell so model CSS
  // like min-height:100vh cannot lock the reported height to the current iframe size.
  let isMeasuringHeight = false;
  const measureContentHeight = () => {
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return 0;

    const restored = [];
    const neutralizeSize = (el) => {
      if (!(el instanceof HTMLElement)) return;
      restored.push([el, el.style.height, el.style.minHeight, el.style.maxHeight]);
      el.style.height = 'auto';
      el.style.minHeight = '0';
      el.style.maxHeight = 'none';
    };

    isMeasuringHeight = true;
    try {
      neutralizeSize(root);
      neutralizeSize(body);

      const children = body.children;
      for (let i = 0; i < children.length; i += 1) {
        const el = children[i];
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
        neutralizeSize(el);
      }

      let contentBottom = 0;
      for (let i = 0; i < children.length; i += 1) {
        const el = children[i];
        if (!(el instanceof HTMLElement)) continue;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        const marginBottom = parseFloat(style.marginBottom) || 0;
        let bottom;
        if (style.position === 'fixed') {
          // Fixed fullscreen shell (inset:0 + overflow:hidden) clips content.
          // Use scrollHeight so the parent stretches the iframe past the clip zone.
          bottom = rect.top + (window.scrollY || 0) + Math.max(el.scrollHeight, rect.height) + marginBottom;
        } else {
          bottom = rect.bottom + (window.scrollY || 0) + marginBottom;
        }
        if (bottom > contentBottom) contentBottom = bottom;
      }

      const bodyStyle = window.getComputedStyle(body);
      const paddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
      const borderBottom = parseFloat(bodyStyle.borderBottomWidth) || 0;

      if (contentBottom > 0) {
        return Math.ceil(contentBottom + paddingBottom + borderBottom);
      }

      // Empty/sparse documents: fall back to scrollHeight only (not offsetHeight).
      return Math.max(body.scrollHeight || 0, root.scrollHeight || 0);
    } finally {
      for (let i = restored.length - 1; i >= 0; i -= 1) {
        const [el, height, minHeight, maxHeight] = restored[i];
        el.style.height = height;
        el.style.minHeight = minHeight;
        el.style.maxHeight = maxHeight;
      }
      isMeasuringHeight = false;
    }
  };

  const notifyResize = () => {
    try {
      const height = measureContentHeight();
      parent.postMessage({ channel, event: 'resize', height }, '*');
    } catch {}
  };

  let resizeFrame = 0;
  const scheduleResize = () => {
    if (isMeasuringHeight || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (isMeasuringHeight) return;
      notifyResize();
    });
  };

  const notifyReady = () => {
    notify('ready');
    scheduleResize();
  };

  if (document.readyState === 'complete') {
    Promise.resolve().then(notifyReady);
  } else {
    window.addEventListener('load', notifyReady, { once: true });
  }

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleResize);
    if (document.documentElement) observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
  }

  if ('MutationObserver' in window) {
    const observer = new MutationObserver((mutations) => {
      // Skip style-only attribute mutations: measuring temporarily writes inline
      // styles and restoring them would re-trigger → infinite loop.
      if (mutations.some((m) => !(m.type === 'attributes' && m.attributeName === 'style'))) {
        scheduleResize();
      }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true });
  }

  window.addEventListener('resize', scheduleResize);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      notify('escape');
    }
  });

  const isEditableElement = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
  };

  const getElementForNode = (node) => {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  };

  const notifySelection = () => {
    try {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        notify('selection', null);
        return;
      }

      const range = selection.getRangeAt(0);
      const targetElement = getElementForNode(range.commonAncestorContainer);
      if (isEditableElement(targetElement)) {
        notify('selection', null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        notify('selection', null);
        return;
      }

      const rect = range.getBoundingClientRect();
      notify('selection', {
        text,
        copyText: text,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
        },
      });
    } catch {
      notify('selection', null);
    }
  };

  let selectionFrame = 0;
  const scheduleSelection = () => {
    if (selectionFrame) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = 0;
      notifySelection();
    });
  };

  document.addEventListener('selectionchange', scheduleSelection);
  document.addEventListener('mouseup', scheduleSelection);
  document.addEventListener('keyup', scheduleSelection);

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.channel !== channel || event.data.event !== 'clear-selection') {
      return;
    }

    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
  });

  const parseFollowupPayload = (rawPayload) => {
    const trimmedPayload = rawPayload.trim();
    if (!trimmedPayload) return null;

    try {
      const parsedPayload = JSON.parse(trimmedPayload);
      if (typeof parsedPayload === 'string') {
        const instruction = parsedPayload.trim();
        return instruction ? { instruction } : null;
      }
      return parsedPayload;
    } catch (error) {
      if (/^[{[]/.test(trimmedPayload)) {
        console.warn('Invalid Live Artifact follow-up payload.', error);
        return null;
      }

      return { instruction: trimmedPayload };
    }
  };

  const readFollowupPayload = (target) => {
    if (!(target instanceof Element)) return null;
    const trigger = target.closest('[data-amc-followup]');
    if (!trigger) return null;

    const rawPayload = trigger.getAttribute('data-amc-followup');
    if (!rawPayload) return null;

    const payload = parseFollowupPayload(rawPayload);
    return payload ? mergeFollowupState(payload, collectFollowupState(trigger)) : null;
  };

  const resolveFollowupScope = (trigger) => {
    const scopeSelector = trigger.getAttribute('data-amc-followup-scope');
    if (scopeSelector && scopeSelector.trim()) {
      try {
        return document.querySelector(scopeSelector) || trigger.closest(scopeSelector) || document;
      } catch {
        return document;
      }
    }

    return trigger.closest('[data-amc-followup-scope]') || document;
  };

  const readStateValue = (element) => {
    if (element instanceof HTMLInputElement) {
      const inputType = element.type.toLowerCase();
      if (inputType === 'checkbox') return element.checked;
      if (inputType === 'radio') return element.checked ? element.value || true : undefined;
      if (inputType === 'number' || inputType === 'range') {
        return element.value === '' || Number.isNaN(element.valueAsNumber) ? element.value : element.valueAsNumber;
      }
      return element.value;
    }

    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        return Array.from(element.selectedOptions).map((option) => option.value);
      }
      return element.value;
    }

    if (element instanceof HTMLTextAreaElement) return element.value;

    const stateValue = element.getAttribute('data-amc-state-value');
    if (stateValue !== null) {
      const isToggleLike =
        element.hasAttribute('aria-pressed') ||
        element.hasAttribute('aria-selected') ||
        element.hasAttribute('aria-checked');
      if (!isToggleLike) return stateValue;

      const isActive =
        element.getAttribute('aria-pressed') === 'true' ||
        element.getAttribute('aria-selected') === 'true' ||
        element.getAttribute('aria-checked') === 'true';
      return isActive ? stateValue : undefined;
    }

    const textValue = element.textContent ? element.textContent.trim() : '';
    return textValue || undefined;
  };

  const appendStateValue = (state, key, value) => {
    if (value === undefined) return;

    if (Object.prototype.hasOwnProperty.call(state, key)) {
      state[key] = Array.isArray(state[key]) ? [...state[key], value] : [state[key], value];
      return;
    }

    state[key] = value;
  };

  const collectFollowupState = (trigger) => {
    const scope = resolveFollowupScope(trigger);
    const state = {};
    const stateElements = [];

    if (scope instanceof Element && scope.matches('[data-amc-state-key]')) {
      stateElements.push(scope);
    }

    stateElements.push(...Array.from(scope.querySelectorAll('[data-amc-state-key]')));

    stateElements.forEach((element) => {
      const key = element.getAttribute('data-amc-state-key');
      if (!key || element.disabled) return;

      appendStateValue(state, key, readStateValue(element));
    });

    return state;
  };

  const mergeFollowupState = (payload, collectedState) => {
    if (!collectedState || Object.keys(collectedState).length === 0) return payload;

    const existingState =
      payload && typeof payload.state === 'object' && !Array.isArray(payload.state)
        ? payload.state
        : payload && payload.state !== undefined
          ? { value: payload.state }
          : {};

    return {
      ...payload,
      state: {
        ...existingState,
        ...collectedState,
      },
    };
  };

  const readCopyText = (target) => {
    if (!(target instanceof Element)) return null;
    const trigger = target.closest('[data-amc-copy]');
    if (!trigger) return null;
    const value = trigger.getAttribute('data-amc-copy');
    if (value !== null && value.trim()) return value.trim();
    const label = trigger.textContent ? trigger.textContent.trim() : '';
    return label || null;
  };

  document.addEventListener('click', (event) => {
    // Only honor real user gestures. A preview's own script can dispatch a
    // synthetic click (element.click()) — without this check it could trigger a
    // followup/copy on the parent page without the user touching anything.
    if (!event.isTrusted) {
      return;
    }

    const copyText = readCopyText(event.target);
    if (copyText) {
      event.preventDefault();
      notify(${JSON.stringify(HTML_PREVIEW_COPY_EVENT)}, { text: copyText });
      return;
    }

    const payload = readFollowupPayload(event.target);
    if (!payload) return;

    event.preventDefault();
    notify('followup', payload);
  });
${CHART_RENDERER_SCRIPT}
${GRAPHVIZ_RENDERER_SCRIPT}
})();
</script>`;
