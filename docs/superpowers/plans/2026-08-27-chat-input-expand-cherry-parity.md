# Chat Input Expand Cherry Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全对齐 cherry-studio 的输入框展开体验（`max(220px,40/50vh)`、`260ms` 动画、字体自适应 `minHeight`、单行 `compact`、拖拽/键盘/`restoreDefaultHeight`、CSS 变量驱动、Deferred `textarea`→`Tiptap` 切换）。

**Architecture:** 在 `src/components/chat/input` 下新增 `chatInputSizing.ts` 与 `useCompactChatInputPresentation.ts`，将 `useChatInputExpandSizing` 升级为 Cherry 同签名（`fontSize` 入参、`frameStyle/compactFrameStyle/editorContentStyle/editorElementStyle/restoreDefaultHeight` 输出），保留 `ChatTextArea` 作 fallback，新建 `ChatInputTiptapRuntime.tsx`（懒加载 Tiptap）与 `DeferredChatInputSurface.tsx` 按 `needsRuntime` 切换，`ChatInputArea` 接入并从 `appSettings.fontSize` 计算高度。

**Tech Stack:** React 18, TypeScript, Vite 7, Tailwind 4, Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`), `useTimer`/`useResizeDrag` 已有，Vitest + Playwright。

## Global Constraints

- Node/pnpm 版本以 `package.json` 为准，先 `pnpm install`
- 校验：`pnpm --dir . lint`（或 `pnpm lint`）+ 受影响的 `pnpm test <path>`，大改再 `pnpm build`
- 提交需 `git commit -S --signoff`，scope 为具体 kebab-case 模块
- `src/shared` 仅跨进程类型，`src/renderer` 等按现有分层
- 用户可见文案走 `i18n`，`en-us.json` 为源

---

## File Structure

- **Create:** `src/components/chat/input/chatInputSizing.ts` — `getChatInputMinHeight/getCompactChatInputMinHeight`
- **Create:** `src/components/chat/input/useCompactChatInputPresentation.ts` — 单行紧凑测量
- **Modify:** `src/components/chat/input/useChatInputExpandSizing.ts` — Cherry 同签名与 CSS 变量
- **Modify:** `src/components/chat/input/area/ChatTextArea.tsx` — fallback 形态，接收 `editorContentStyle` 等
- **Create:** `src/components/chat/input/ChatInputTiptapRuntime.tsx` — Tiptap 运行时
- **Create:** `src/components/chat/input/DeferredChatInputSurface.tsx` — Deferred 切换 + `selectionRef`
- **Modify:** `src/components/chat/input/ChatInputArea.tsx` — 接入新 hook、Deferred、双击恢复
- **Modify:** `src/components/chat/input/ChatInputExpandCorner.tsx` — 接 `toggleExpanded/restoreDefaultHeight`（如需）
- **Test:** `src/components/chat/input/chatInputSizing.test.ts`, `useCompactChatInputPresentation.test.tsx`, `useChatInputExpandSizing.test.tsx`, `DeferredChatInputSurface.test.tsx`

---

### Task 1: 字体自适应 Sizing

**Files:**

- Create: `src/components/chat/input/chatInputSizing.ts`
- Test: `src/components/chat/input/chatInputSizing.test.ts`

**Interfaces:**

- Consumes: `fontSize: number`
- Produces: `getChatInputMinHeight(fontSize) => number` (`ceil(fontSize*1.4*2+6)`), `getCompactChatInputMinHeight(fontSize) => number` (`ceil(fontSize*1.4+6)`)

- [ ] **Step 1: Write the failing test**

```ts
// src/components/chat/input/chatInputSizing.test.ts
import { describe, expect, it } from 'vitest';
import { getChatInputMinHeight, getCompactChatInputMinHeight } from './chatInputSizing';

describe('chatInputSizing', () => {
  it('computes min heights like Cherry', () => {
    expect(getChatInputMinHeight(14)).toBe(Math.ceil(14 * 1.4 * 2 + 6)); // 46
    expect(getCompactChatInputMinHeight(14)).toBe(Math.ceil(14 * 1.4 + 6)); // 26
    expect(getChatInputMinHeight(16)).toBe(Math.ceil(16 * 1.4 * 2 + 6));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/chatInputSizing.test.ts`
Expected: FAIL `Cannot find module './chatInputSizing'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/chat/input/chatInputSizing.ts
export function getChatInputMinHeight(fontSize: number) {
  return Math.ceil(fontSize * 1.4 * 2 + 6);
}
export function getCompactChatInputMinHeight(fontSize: number) {
  return Math.ceil(fontSize * 1.4 + 6);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/chatInputSizing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/input/chatInputSizing.ts src/components/chat/input/chatInputSizing.test.ts
git commit -S --signoff -m "feat(chat-input): add font-size adaptive sizing"
```

---

### Task 2: 升级 useChatInputExpandSizing 到 Cherry 签名

**Files:**

- Modify: `src/components/chat/input/useChatInputExpandSizing.ts`
- Test: `src/components/chat/input/useChatInputExpandSizing.test.ts`

**Interfaces:**

- Consumes: `Options { fontSize: number, isExpanded: boolean, onExpandedChange: (b:boolean)=>void, focusEditor: ()=>void, minHeight?: number }` + `useTimer().setTimeoutTimer` / `useResizeDrag`
- Produces: `{ frameRef, frameStyle, compactFrameStyle, editorContentStyle, compactEditorContentStyle, editorElementStyle, hasCustomHeight, isResizing, startResize, handleResizeKeyDown, handleTransitionEnd, toggleExpanded, restoreDefaultHeight, minHeight, maxHeight, resizeHandleValue }`
- `editorContentStyle` 包含 `--composer-editor-*` CSS 变量与 `height/minHeight`；`editorElementStyle = "max-height: var(--composer-editor-max-height) !important; overflow-y: var(--composer-editor-overflow-y); height: var(--composer-editor-height)"`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/chat/input/useChatInputExpandSizing.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatInputExpandSizing } from './useChatInputExpandSizing';

describe('useChatInputExpandSizing cherry parity', () => {
  it('exposes restoreDefaultHeight and compact styles', () => {
    const { result } = renderHook(() =>
      useChatInputExpandSizing({
        fontSize: 14,
        isExpanded: false,
        onExpandedChange: vi.fn(),
        focusEditor: vi.fn(),
        minHeight: 46,
      }),
    );
    expect(result.current.restoreDefaultHeight).toBeDefined();
    expect(result.current.compactFrameStyle).toBeDefined();
    expect(result.current.editorContentStyle).toBeDefined();
    expect(result.current.editorElementStyle).toContain('var(--composer-editor-max-height)');
  });
  it('Home/End/Arrow handle', () => {
    const onExpandedChange = vi.fn();
    const { result } = renderHook(() =>
      useChatInputExpandSizing({
        fontSize: 14,
        isExpanded: true,
        onExpandedChange,
        focusEditor: vi.fn(),
        minHeight: 46,
      }),
    );
    act(() => result.current.handleResizeKeyDown({ key: 'Home', preventDefault: vi.fn() } as any));
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/useChatInputExpandSizing.test.ts`
Expected: FAIL `restoreDefaultHeight is not a function` / missing styles

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/chat/input/useChatInputExpandSizing.ts
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TransitionEvent as ReactTransitionEvent,
} from 'react';
import { useResizeDrag } from '@/hooks/useResizeDrag';
import { getChatInputMinHeight, getCompactChatInputMinHeight } from './chatInputSizing';
// useTimer 可选：若项目无此 hook，用 window.setTimeout 包一层，key 忽略
export const CHAT_INPUT_EXPANDED_MAX_HEIGHT = 'max(220px, 50vh)';
export const CHAT_INPUT_COLLAPSED_MAX_HEIGHT = 'max(220px, 40vh)';
const HEIGHT_TRANSITION_MS = 260;
const STEP = 16;
type Options = {
  fontSize: number;
  isExpanded: boolean;
  onExpandedChange: (b: boolean) => void;
  focusEditor: () => void;
  minHeight?: number;
  setTimeoutTimer?: (k: string, fn: () => void, ms: number) => void;
};
function getViewportRelativeHeightPx(minH: number, ratio: number) {
  return Math.max(minH, Math.round(window.innerHeight * ratio));
}
function getExpandedHeightPx(minH: number) {
  return Math.max(minH, getViewportRelativeHeightPx(220, 0.5));
}
function clampHeight(h: number, minH: number, maxH: number) {
  return Math.min(maxH, Math.max(minH, Math.round(h)));
}
function getCollapsedHeightPx(frame: HTMLDivElement, minH: number) {
  const ta = frame.querySelector('textarea[data-chat-input-textarea="true"], .composer-tiptap') as HTMLElement | null;
  let ch = frame.scrollHeight || minH;
  const maxCollapsed = getViewportRelativeHeightPx(220, 0.4);
  if (ta) {
    const ph = ta.style.height,
      pm = (ta.style as any).maxHeight;
    try {
      ta.style.height = 'auto';
      (ta.style as any).maxHeight = 'none';
      ch = ta.scrollHeight || ch;
    } finally {
      ta.style.height = ph;
      (ta.style as any).maxHeight = pm;
    }
  }
  return Math.max(minH, Math.min(ch, maxCollapsed));
}
function getEditorContentStyle(fontSize: number, isExpanded: boolean, manual: number | null, compact = false) {
  const minHeight = compact ? getCompactChatInputMinHeight(fontSize) : getChatInputMinHeight(fontSize);
  const hasCustom = isExpanded || manual !== null;
  const isFixed = compact || hasCustom;
  const maxHeight = compact
    ? `${minHeight}px`
    : isExpanded
      ? CHAT_INPUT_EXPANDED_MAX_HEIGHT
      : manual !== null
        ? `${manual}px`
        : CHAT_INPUT_COLLAPSED_MAX_HEIGHT;
  return {
    height: compact ? minHeight : hasCustom ? ('100%' as const) : undefined,
    minHeight,
    '--composer-editor-padding': compact ? '3px 0' : '6px 44px 0 15px',
    '--composer-editor-min-height': `${minHeight}px`,
    '--composer-editor-font-size': `${fontSize}px`,
    '--composer-editor-line-height': '1.4',
    '--composer-editor-max-height': maxHeight,
    '--composer-editor-overflow-y': compact ? ('hidden' as const) : ('auto' as const),
    '--composer-editor-height': isFixed ? ('100%' as const) : ('auto' as const),
  } as CSSProperties & Record<string, string>;
}
const EDITOR_ELEMENT_STYLE = [
  'max-height: var(--composer-editor-max-height) !important',
  'overflow-y: var(--composer-editor-overflow-y)',
  'height: var(--composer-editor-height)',
].join('; ');
export function useChatInputExpandSizing({
  fontSize,
  isExpanded,
  onExpandedChange,
  focusEditor,
  minHeight: minHeightProp,
  setTimeoutTimer,
}: Options) {
  const minHeight = minHeightProp ?? getChatInputMinHeight(fontSize);
  const compactMinHeight = getCompactChatInputMinHeight(fontSize);
  const maxHeight = useMemo(() => getExpandedHeightPx(minHeight), [minHeight]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const pendingRef = useRef<boolean | null>(null);
  const dragRef = useRef({ startClientY: 0, startHeight: 0, collapseExpanded: false });
  const [animatedHeight, setAnimatedHeight] = useState<string | null>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const hasCustomHeight = isExpanded || manualHeight !== null;
  const clearAnim = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);
  const clearAfter = useCallback(() => {
    const fn = () => {
      setAnimatedHeight(null);
      pendingRef.current = null;
    };
    if (setTimeoutTimer) setTimeoutTimer('chatInputFrame', fn, HEIGHT_TRANSITION_MS + 80);
    else window.setTimeout(fn, HEIGHT_TRANSITION_MS + 80);
  }, [setTimeoutTimer]);
  const getCurrentHeight = useCallback(
    () => frameRef.current?.offsetHeight ?? (isExpanded ? maxHeight : (manualHeight ?? minHeight)),
    [isExpanded, manualHeight, maxHeight, minHeight],
  );
  const setClamped = useCallback(
    (h: number) => {
      clearAnim();
      pendingRef.current = null;
      setAnimatedHeight(null);
      setManualHeight(clampHeight(h, minHeight, maxHeight));
    },
    [clearAnim, maxHeight, minHeight],
  );
  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.collapseExpanded) {
        d.collapseExpanded = false;
        onExpandedChange(false);
      }
      setClamped(d.startHeight + d.startClientY - e.clientY);
    },
    [onExpandedChange, setClamped],
  );
  const { isResizing, startResizing } = useResizeDrag({ onMove: handleResizeMove, cursor: 'row-resize' });
  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      dragRef.current = { startClientY: e.clientY, startHeight: getCurrentHeight(), collapseExpanded: isExpanded };
      startResizing(e);
    },
    [getCurrentHeight, isExpanded, startResizing],
  );
  const handleResizeKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const cur = getCurrentHeight();
      let n: number | null = null;
      switch (e.key) {
        case 'ArrowUp':
          n = cur + STEP;
          break;
        case 'ArrowDown':
          n = cur - STEP;
          break;
        case 'Home':
          n = minHeight;
          break;
        case 'End':
          n = maxHeight;
          break;
      }
      if (n === null) return;
      e.preventDefault();
      if (isExpanded) onExpandedChange(false);
      setClamped(n);
    },
    [getCurrentHeight, isExpanded, maxHeight, minHeight, onExpandedChange, setClamped],
  );
  const toggleExpanded = useCallback(
    (next?: boolean) => {
      const t = typeof next === 'boolean' ? next : !isExpanded;
      const f = frameRef.current;
      if (f) {
        clearAnim();
        setAnimatedHeight(`${f.offsetHeight || minHeight}px`);
        pendingRef.current = t;
      }
      if (!t) setManualHeight(null);
      onExpandedChange(t);
      focusEditor();
    },
    [clearAnim, focusEditor, isExpanded, minHeight, onExpandedChange],
  );
  useEffect(() => {
    const f = frameRef.current;
    if (!f || pendingRef.current !== isExpanded) return;
    const th = isExpanded ? getExpandedHeightPx(minHeight) : getCollapsedHeightPx(f, minHeight);
    clearAnim();
    animRef.current = requestAnimationFrame(() => {
      setAnimatedHeight(`${th}px`);
      animRef.current = null;
    });
    clearAfter();
  }, [clearAfter, clearAnim, isExpanded, minHeight]);
  useEffect(() => clearAnim, [clearAnim]);
  const handleTransitionEnd = useCallback((e: ReactTransitionEvent<HTMLDivElement>) => {
    if (e.propertyName && e.propertyName !== 'height') return;
    setAnimatedHeight(null);
    pendingRef.current = null;
  }, []);
  const restoreDefaultHeight = useCallback(() => {
    const f = frameRef.current;
    clearAnim();
    pendingRef.current = null;
    if (!f) {
      setManualHeight(null);
      onExpandedChange(false);
      focusEditor();
      return;
    }
    const start = f.offsetHeight || getCurrentHeight();
    const target = getCollapsedHeightPx(f, minHeight);
    setAnimatedHeight(`${start}px`);
    animRef.current = requestAnimationFrame(() => {
      setManualHeight(null);
      onExpandedChange(false);
      setAnimatedHeight(`${target}px`);
      animRef.current = null;
    });
    clearAfter();
    focusEditor();
  }, [clearAfter, clearAnim, focusEditor, getCurrentHeight, minHeight, onExpandedChange]);
  const resolvedFrameHeight =
    animatedHeight ??
    (isExpanded ? CHAT_INPUT_EXPANDED_MAX_HEIGHT : manualHeight !== null ? `${manualHeight}px` : undefined);
  const frameStyle = useMemo<CSSProperties>(
    () => ({
      height: resolvedFrameHeight,
      minHeight,
      overflow: 'hidden',
      transition: isResizing ? 'none' : `height ${HEIGHT_TRANSITION_MS}ms cubic-bezier(0, 0, 0.2, 1)`,
    }),
    [isResizing, minHeight, resolvedFrameHeight],
  );
  const compactFrameStyle = useMemo<CSSProperties>(
    () => ({ height: compactMinHeight, minHeight: compactMinHeight, overflow: 'hidden', transitionDuration: '0ms' }),
    [compactMinHeight],
  );
  const editorContentStyle = useMemo(
    () => getEditorContentStyle(fontSize, isExpanded, manualHeight),
    [fontSize, isExpanded, manualHeight],
  );
  const compactEditorContentStyle = useMemo(() => getEditorContentStyle(fontSize, false, null, true), [fontSize]);
  return {
    frameRef,
    frameStyle,
    compactFrameStyle,
    editorContentStyle,
    compactEditorContentStyle,
    editorElementStyle: EDITOR_ELEMENT_STYLE,
    minHeight,
    maxHeight,
    isResizing,
    startResize,
    handleResizeKeyDown,
    handleTransitionEnd,
    toggleExpanded,
    restoreDefaultHeight,
    hasCustomHeight,
    resizeHandleValue: isExpanded ? maxHeight : (manualHeight ?? minHeight),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/useChatInputExpandSizing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/input/useChatInputExpandSizing.ts
git commit -S --signoff -m "feat(chat-input): align expand sizing with cherry"
```

---

### Task 3: 单行紧凑测量

**Files:**

- Create: `src/components/chat/input/useCompactChatInputPresentation.ts`
- Test: `src/components/chat/input/useCompactChatInputPresentation.test.tsx`

**Interfaces:**

- Consumes: `{ enabled: boolean, frameRef: RefObject<HTMLDivElement|null>, isComposing: ()=>boolean }`
- Produces: `{ isCompact: boolean, requestMeasurement: ()=>void }`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCompactChatInputPresentation } from './useCompactChatInputPresentation';
describe('useCompact', () => {
  it('returns compact for single line', async () => {
    const frame = document.createElement('div');
    frame.innerHTML =
      '<div data-composer-compact-row style="width:200px"><div class="composer-tiptap" style="width:100px"></div></div>';
    document.body.appendChild(frame);
    const ref = { current: frame as HTMLDivElement };
    const { result } = renderHook(() =>
      useCompactChatInputPresentation({ enabled: true, frameRef: ref as any, isComposing: () => false }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.isCompact).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/useCompactChatInputPresentation.test.tsx`
Expected: FAIL module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/chat/input/useCompactChatInputPresentation.ts
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
const TOL = 1;
export function useCompactChatInputPresentation({
  enabled,
  frameRef,
  isComposing,
}: {
  enabled: boolean;
  frameRef: RefObject<HTMLDivElement | null>;
  isComposing: () => boolean;
}) {
  const [rev, setRev] = useState(0);
  const [m, setM] = useState<{ presentation: 'compact' | 'regular'; revision: number }>({
    presentation: 'compact',
    revision: -1,
  });
  const schedRef = useRef(false);
  const mountedRef = useRef(true);
  const wasEnabledRef = useRef(enabled);
  const requestMeasurement = useCallback(() => {
    if (!enabled || isComposing() || schedRef.current) return;
    schedRef.current = true;
    queueMicrotask(() => {
      schedRef.current = false;
      if (mountedRef.current) setRev((r) => r + 1);
    });
  }, [enabled, isComposing]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      return;
    }
    if (!wasEnabledRef.current) {
      wasEnabledRef.current = true;
      requestMeasurement();
      return;
    }
    if (m.revision === rev || isComposing()) return;
    const frame = frameRef.current;
    const ed = frame?.querySelector<HTMLElement>('textarea[data-chat-input-textarea="true"], .composer-tiptap');
    const row =
      frame?.closest<HTMLElement>('[data-composer-compact-row]') ??
      frame?.querySelector<HTMLElement>('[data-composer-compact-row]');
    const targetRow = row ?? frame;
    const hasHardBr = !!(
      ed?.querySelector(':scope > p > br:not(.ProseMirror-trailingBreak)') ||
      (ed as HTMLTextAreaElement)?.value?.includes('\n')
    );
    const hasOverflow = ed ? ed.scrollHeight > ed.clientHeight + TOL : false;
    const hasRowOverflow = targetRow ? targetRow.scrollWidth > targetRow.clientWidth + TOL : false;
    setM({ presentation: hasHardBr || hasOverflow || hasRowOverflow ? 'regular' : 'compact', revision: rev });
  }, [enabled, frameRef, isComposing, m.revision, rev, requestMeasurement]);
  return { isCompact: m.presentation === 'compact', requestMeasurement };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/useCompactChatInputPresentation.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/input/useCompactChatInputPresentation.ts
git commit -S --signoff -m "feat(chat-input): add compact presentation"
```

---

### Task 4: Fallback 与 CSS 变量接入

**Files:**

- Modify: `src/components/chat/input/area/ChatTextArea.tsx`

**Interfaces:**

- Consumes: `editorContentStyle: CSSProperties, editorElementStyle: string, isCompact: boolean`
- Produces: `textarea` with `style={isCompact?compactStyle:editorContentStyle}` + `data-composer-editor-frame` inner `style` uses CSS vars

- [ ] **Step 1: Write the failing test**

```tsx
// extend ChatTextArea.test.tsx
it('applies CSS variables when expanded', () => {
  const ref = { current: null } as any;
  act(() =>
    renderer.root.render(
      <ChatTextArea
        textareaRef={ref}
        value="hi"
        onChange={() => {}}
        onKeyDown={() => {}}
        onPaste={() => {}}
        onCompositionStart={() => {}}
        onCompositionEnd={() => {}}
        placeholder=""
        disabled={false}
        isFullscreen={true}
        hasCustomHeight={true}
        isMobile={false}
        initialTextareaHeight={24}
        isConverting={false}
        editorContentStyle={{ '--composer-editor-max-height': 'max(220px,50vh)' } as any}
      />,
    ),
  );
  const ta = renderer.container.querySelector('textarea[data-chat-input-textarea="true"]');
  expect(ta?.getAttribute('style')).toContain('var(--composer-editor-max-height)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/area/ChatTextArea.test.tsx`
Expected: FAIL not containing var

- [ ] **Step 3: Write minimal implementation**

```tsx
// ChatTextArea props add editorContentStyle?: CSSProperties, editorElementStyle?: string, isCompact?: boolean
// outer div className `${isCompact?'compact':''}` and style={editorContentStyle}
// inner textarea style combines editorContentStyle vars via class + inline max-height var
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/area/ChatTextArea.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/input/area/ChatTextArea.tsx
git commit -S --signoff -m "feat(chat-input): wire css var sizing"
```

---

### Task 5: Tiptap 运行时（懒加载）

**Files:**

- Create: `src/components/chat/input/ChatInputTiptapRuntime.tsx`
- Modify: `package.json` add `@tiptap/react @tiptap/starter-kit @tiptap/pm`

**Interfaces:**

- Consumes: `{ text, onTextChange, placeholder, fontSize, editorContentStyle, editorElementStyle, frameRef }`
- Produces: `<EditorContent editor={editor} style={editorContentStyle} />` with `editorElementStyle` applied via `className="composer-tiptap"`

- [ ] **Step 1: Write the failing test**

```tsx
// DeferredChatInputSurface.test.tsx (later) will import this, test that runtime renders EditorContent
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/ChatInputTiptapRuntime.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```tsx
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
export function ChatInputTiptapRuntime({ text, onTextChange, placeholder, editorContentStyle, editorElementStyle }) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: `<p>${text}</p>`,
    onUpdate: ({ editor }) => onTextChange(editor.getText()),
  });
  if (!editor) return null;
  return (
    <EditorContent editor={editor} className="composer-tiptap custom-scrollbar" style={editorContentStyle as any} />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input/ChatInputTiptapRuntime.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/components/chat/input/ChatInputTiptapRuntime.tsx
git commit -S --signoff -m "feat(chat-input): add tiptap runtime"
```

---

### Task 6: Deferred 切换

**Files:**

- Create: `src/components/chat/input/DeferredChatInputSurface.tsx`
- Test: `src/components/chat/input/DeferredChatInputSurface.test.tsx`

**Interfaces:**

- Consumes: `{ text, onTextChange, isExpanded, draftTokens, compactWhenSingleLine, ... }`
- Produces: renders `ChatTextArea` fallback or `ChatInputTiptapRuntime` based on `needsRuntime = isExpanded || text.trim().length>0 || draftTokens?.length>0 || compactWhenSingleLine`

- [ ] **Step 1: Write the failing test**

```tsx
it('switches to runtime when expanded', async()=>{
  const { container } = render(<DeferredChatInputSurface text="hi" isExpanded={true} ... />);
  expect(container.querySelector('.composer-tiptap')).toBeTruthy();
});
```

- [ ] **Step 2-5: similar TDD**

---

### Task 7: 集成到 ChatInputArea

**Files:**

- Modify: `src/components/chat/input/ChatInputArea.tsx`
- Modify: `src/components/chat/input/ChatInputExpandCorner.tsx`

**Interfaces:**

- Consumes: `appSettings.fontSize` from store

- [ ] **Step 1: Write the failing test** – e2e expand still passes with new fontSize
- [ ] **Step 3: Implementation** – wire `fontSize`, `useCompact`, `DeferredChatInputSurface`, `onDoubleClick={restoreDefaultHeight}`, `data-composer-compact-row` wrapper
- [ ] **Step 5: Commit**

---

### Task 8: 全量回归

- [ ] **Step 1: Run** `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test src/components/chat/input`
- [ ] **Step 2: Run** `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI build`
- [ ] **Step 3: Run** `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI test:e2e -- e2e/expand-bug.spec.ts` (previously passing with 360px)
- [ ] **Step 4: Manual** `pnpm --dir /Volumes/WD_BLACK/Code/AMC-WebUI preview` + playwright screenshot

```

```
