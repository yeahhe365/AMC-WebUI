# Image Localization Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three progressive image localization capabilities in AMC-WebUI: (1) Coordinate auto-sniffing & annotated snapshot export, (2) Multi-target simultaneous HUD with numbered tags ①②③ & viewport minimap radar, (3) Visual prompting allowing users to drag-select bounding boxes on images to ask AI questions.

**Architecture:**

- Create `coordinateSniffer.ts` to normalize 0-1 floats, percentages, and inverted coordinates into standard `0-1000` integer bounds.
- Create `exportAnnotatedImage.ts` to composite high-res image + HUD BBox reticles + arrows + badges onto a Canvas and trigger download.
- Add `ImageMinimap.tsx` to display an interactive viewport radar when zoomed in (`scale > 1.2`).
- Enhance `ImageHighlightOverlay.tsx` and `mediaNavStore.ts` to support multi-target list view with numbered anchors `①, ②, ③` and active highlight switching.
- Add visual selection/drag-to-box tool to `ImageViewer.tsx` that converts drawn screen rects to `[ymin, xmin, ymax, xmax]` and feeds `<image-locate>` tags into `useChatStore.setCommandedInput`.
- Add i18n translations across all 7 languages for all new buttons and tooltips.

**Tech Stack:** React 19, TypeScript, Panzoom, HTML Canvas, Zustand, Lucide Icons, Vitest.

---

### Task 1: Coordinate Auto-Sniffing & Normalization Utility

**Files:**

- Create: `src/utils/media-nav/coordinateSniffer.ts`
- Create: `src/utils/media-nav/coordinateSniffer.test.ts`
- Modify: `src/utils/media-nav/imageLinks.ts`
- Modify: `src/utils/media-nav/locateMarker.ts`

**Interfaces:**

- `normalizeBoxCoordinates(raw: string | number[]): [number, number, number, number] | null`
  - Handles 0-1 floats: `[0.12, 0.34, 0.56, 0.78]` -> `[120, 340, 560, 780]`
  - Handles percentages: `['12%', '34%', '56%', '78%']` -> `[120, 340, 560, 780]`
  - Handles string lists: `'120, 340, 560, 780'` or `'[120, 340, 560, 780]'`
  - Ensures `ymin <= ymax` and `xmin <= xmax`
  - Clamps all values to `[0, 1000]`
- `normalizePointCoordinates(raw: string | number[]): [number, number] | null`

- [ ] **Step 1: Write unit tests in `src/utils/media-nav/coordinateSniffer.test.ts`**
- [ ] **Step 2: Implement `src/utils/media-nav/coordinateSniffer.ts`**
- [ ] **Step 3: Run vitest on `coordinateSniffer.test.ts` to verify PASS**
- [ ] **Step 4: Update `imageLinks.ts` and `locateMarker.ts` to use `normalizeBoxCoordinates` and `normalizePointCoordinates`**
- [ ] **Step 5: Run existing media-nav tests to ensure full regression safety**

---

### Task 2: Annotated Image Export Tool (Canvas Snapshot)

**Files:**

- Create: `src/utils/media-nav/exportAnnotatedImage.ts`
- Create: `src/utils/media-nav/exportAnnotatedImage.test.ts`
- Modify: `src/i18n/translations/messages.ts`
- Modify: `src/components/shared/file-preview/ImageViewer.tsx`

**Interfaces:**

- `exportAnnotatedImage(options: { imageSrc: string; fileName: string; highlights: ImageNavHighlight[]; rotation?: number }): Promise<void>`
  - Draws image to hidden canvas at full natural resolution
  - Handles rotation (0, 90, 180, 270)
  - Draws BBoxes with semi-transparent fill and corner brackets
  - Draws point circles and directional arrows
  - Draws label badges with text drop shadows
  - Exports to PNG and triggers browser download

- [ ] **Step 1: Add i18n keys for export and visual crop in `messages.ts` (en, zh, ja, de, fr, es, ko)**
- [ ] **Step 2: Implement `exportAnnotatedImage.ts` with canvas drawing logic**
- [ ] **Step 3: Write unit tests for `exportAnnotatedImage.test.ts`**
- [ ] **Step 4: Add Export button to `ImageViewer.tsx` floating toolbar**
- [ ] **Step 5: Run vitest to verify export utilities**

---

### Task 3: Multi-Target Grounding HUD (Numbered Indices ① ② ③)

**Files:**

- Modify: `src/stores/mediaNavStore.ts`
- Modify: `src/utils/media-nav/seekImage.ts`
- Modify: `src/components/media-nav/ImageHighlightOverlay.tsx`
- Modify: `src/components/media-nav/ImageHighlightOverlay.test.tsx`
- Modify: `src/components/shared/file-preview/ImageViewer.tsx`

**Interfaces:**

- `ImageNavHighlight`: add optional `index?: number`, `total?: number`, `isActive?: boolean`, `id?: string`
- `mediaNavStore`: add `allImageHighlights: ImageNavHighlight[]`, `setActiveImageHighlight(index: number): void`
- In `seekImage.ts`: when seeking an image, collect all `<image-locate>` markers from the active message/session matching `target.name` and assign `index` 1..N.
- `ImageHighlightOverlay.tsx`:
  - Renders the primary active highlight with focus animation, full badge, and close button.
  - Renders secondary highlights with numbered circle tags `①, ②, ③` and subtle dashed/HUD borders.
  - Clicking a secondary marker switches it to the active highlight and triggers camera zoom/pan.
  - Displays a compact switcher pill `[ < 1/3 > ]` on the top-right overlay when multiple highlights exist.

- [ ] **Step 1: Update `mediaNavStore.ts` to support `allImageHighlights` and `setActiveImageHighlightIndex`**
- [ ] **Step 2: Update `seekImage.ts` to collect sibling image markers for the targeted image**
- [ ] **Step 3: Update `ImageHighlightOverlay.tsx` to render multi-target numbered markers and switcher**
- [ ] **Step 4: Add multi-target tests in `ImageHighlightOverlay.test.tsx` and `mediaNavStore.test.ts`**
- [ ] **Step 5: Run vitest to verify PASS**

---

### Task 4: Interactive Viewport Minimap (Radar View)

**Files:**

- Create: `src/components/shared/file-preview/image/ImageMinimap.tsx`
- Create: `src/components/shared/file-preview/image/ImageMinimap.test.tsx`
- Modify: `src/components/shared/file-preview/ImageViewer.tsx`

**Interfaces:**

- `ImageMinimapProps`:
  - `src: string`
  - `scale: number`
  - `pan: { x: number; y: number }`
  - `imageDimensions: { width: number; height: number }`
  - `viewportDimensions: { width: number; height: number }`
  - `rotation: number`
  - `onPanTo: (x: number, y: number) => void`
  - `highlights?: ImageNavHighlight[]`

- [ ] **Step 1: Implement `ImageMinimap.tsx`**
- [ ] **Step 2: Write tests in `ImageMinimap.test.tsx`**
- [ ] **Step 3: Mount `ImageMinimap` inside `ImageViewer.tsx`**
- [ ] **Step 4: Run vitest to verify PASS**

---

### Task 5: Visual Prompting (User Drag-to-Select BBox to Ask AI)

**Files:**

- Create: `src/components/shared/file-preview/image/ImageVisualCropper.tsx`
- Create: `src/components/shared/file-preview/image/ImageVisualCropper.test.tsx`
- Modify: `src/components/shared/file-preview/ImageViewer.tsx`

**Interfaces:**

- `ImageVisualCropperProps`:
  - `imageRef: React.RefObject<HTMLImageElement>`
  - `rotation: number`
  - `onConfirmSelection: (box2d: [number, number, number, number]) => void`
  - `onCancel: () => void`

- [ ] **Step 1: Implement `ImageVisualCropper.tsx`**
- [ ] **Step 2: Write unit tests in `ImageVisualCropper.test.tsx`**
- [ ] **Step 3: Add Crosshair toggle button to `ImageViewer.tsx` toolbar**
- [ ] **Step 4: Wire selection confirmation to `setCommandedInput` and clipboard**
- [ ] **Step 5: Run vitest to verify PASS**

---

### Task 6: End-to-End Verification & Docker Compose Deployment

- [ ] **Step 1: Run all vitest unit tests across the codebase**
- [ ] **Step 2: Run `npx tsc --noEmit` to ensure zero type errors**
- [ ] **Step 3: Run `npm run build:docker`**
- [ ] **Step 4: Run `docker compose up -d --build`**
- [ ] **Step 5: Verify `curl -I http://localhost:8082` returns 200 OK**
