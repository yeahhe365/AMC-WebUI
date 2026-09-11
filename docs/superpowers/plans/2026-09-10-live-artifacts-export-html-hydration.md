# Live Artifacts HTML Export Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable self-contained, zero-dependency rendering of Live Artifacts (ECharts charts, Graphviz diagrams, and responsive layout) when exporting messages or chat sessions to HTML.

**Architecture:** In `src/utils/export/dom.ts`, unify the live artifact preparation pipeline so that `replaceLiveArtifactIframes` is applied to both HTML and PNG export paths. The sandboxed `<iframe>` tags are replaced with same-origin static preview containers via `createStaticPreviewSnapshotContainer`, compiling `data-amc-chart` (ECharts) and `data-amc-graphviz` (Graphviz) into crisp, inline vector SVGs with transparent backgrounds and natural `height: auto` responsiveness.

**Tech Stack:** TypeScript, React, Vitest, DOMParser, Apache ECharts SSR, @hpcc-js/wasm (Viz.js), Playwright / Chromium for headless verification.

---

### Task 1: Update `dom.test.ts` with Failing Tests for HTML Export Hydration

**Files:**

- Modify: `src/utils/export/dom.test.ts:67-97`

**Interfaces:**

- Consumes: `prepareElementForExport(container, { forPng: false, expandDetails: false })`
- Produces: Assertion that `iframe` is replaced by `.is-exporting-png` snapshot container and contains hydrated artifact content, even when `forPng: false`.

- [ ] **Step 1: Update the test in `dom.test.ts` to assert that HTML export (`forPng=false`) also replaces iframe with static snapshot**

```typescript
it('replaces iframe srcdoc with static snapshot when forPng=false (HTML export path)', async () => {
  const container = document.createElement('div');
  container.appendChild(buildArtifactFrame('<div>Hello HTML Export</div>'));

  const clone = await prepareElementForExport(container, {
    expandDetails: false,
    forPng: false,
  });

  const iframe = clone.querySelector('iframe');
  expect(iframe).toBeNull();

  const snapshotContainer = clone.querySelector('.is-exporting-png');
  expect(snapshotContainer).not.toBeNull();
  expect(snapshotContainer?.textContent).toContain('Hello HTML Export');
});
```

- [ ] **Step 2: Run Vitest to verify it fails**

Run: `node scripts/run-vitest.mjs run src/utils/export/dom.test.ts`
Expected: FAIL because `prepareElementForExport` currently preserves the iframe when `forPng=false`.

---

### Task 2: Implement Live Artifact Hydration for All Export Paths

**Files:**

- Modify: `src/utils/export/dom.ts:108-141,347-352`

**Interfaces:**

- Consumes: `createStaticPreviewSnapshotContainer(html, targetDocument, { themeId })` from `@/utils/html-preview/previewDocument`
- Produces: `prepareElementForExport(sourceElement, options)` replacing all `[data-live-artifact-frame="true"]` nodes with clean, inline static containers regardless of `forPng`.

- [ ] **Step 1: Update `replaceLiveArtifactIframes` styling in `src/utils/export/dom.ts`**

Configure `container.style` to ensure clean responsiveness and theme inheritance:

- `background: 'transparent'` (prevents forced `#ffffff` in dark theme)
- `overflow: 'visible'` (prevents clipping of wide diagrams and tables)
- `height: 'auto'` (allows container to naturally wrap rendered contents without frozen viewport height or trailing whitespace)

- [ ] **Step 2: Call `replaceLiveArtifactIframes` unconditionally in `prepareElementForExport`**

Replace:

```typescript
// Replace sandboxed artifact iframes with same-origin static snapshots for PNG export.
// HTML export preserves the iframe srcdoc so the artifact remains runnable when reopened.
if (forPng) {
  await replaceLiveArtifactIframes(clone, sourceElement.ownerDocument, themeId);
}
```

with:

```typescript
// Replace sandboxed artifact iframes with same-origin static snapshots for both PNG and HTML export.
// Sandboxed iframes cannot load external vendor scripts (/vendor/echarts.min.js) or receive
// parent window Graphviz postMessage relays when exported as standalone HTML documents.
await replaceLiveArtifactIframes(clone, sourceElement.ownerDocument, themeId);
```

- [ ] **Step 3: Run Vitest on `dom.test.ts` to verify tests pass**

Run: `node scripts/run-vitest.mjs run src/utils/export/dom.test.ts`
Expected: PASS (all tests green).

---

### Task 3: Comprehensive Regression Testing & Full Verification

**Files:**

- Test: `src/utils/export/*.test.ts`
- Test: `src/components/message/buttons/export/*.test.tsx`
- Test: `src/hooks/data-management/useChatSessionExport.test.tsx`

- [ ] **Step 1: Run all export-related unit tests**

Run: `node scripts/run-vitest.mjs run src/utils/export src/components/message/buttons/export src/hooks/data-management/useChatSessionExport.test.tsx`
Expected: All 10 test files and 45+ tests PASS.

- [ ] **Step 2: Typecheck the codebase**

Run: `npm run typecheck`
Expected: 0 TypeScript errors.

- [ ] **Step 3: Verify with real-world exported HTML sample**

Generate an exported HTML using the updated logic on the user's sample payload, load in headless Chrome, and verify:

- Console error for `file:///vendor/echarts.min.js` is gone.
- `data-amc-chart` is replaced by `<svg>` with rendered bars.
- `data-amc-graphviz` is replaced by `<svg>` with rendered nodes and edges.
- No `<iframe>` tags remain in the message content container.
