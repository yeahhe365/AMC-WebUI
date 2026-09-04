# Sidebar Shortcut Hint — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Scope:** `src/components/sidebar/SidebarActions.tsx` (`ShortcutHint` + `compactShortcut`)

## Context

Sidebar primary actions (New Chat / Search) show a right-aligned shortcut hint (`newChatShortcut`, `searchChatsShortcut`). Current `ShortcutHint` uses `text-sm font-semibold tracking-normal text-[var(--theme-text-primary)] opacity-60 group-hover:opacity-100`. Issues observed in screenshot:

- Visual weight equals the label (`text-sm` + `font-semibold`), competes rather than secondary.
- `opacity-60` on `text-primary` looks washed, fails contrast, and flickers on hover (no hover on touch).
- `⌘`/`⇧` at 14px low-res can be misread as `%`/`↑`.
- All platforms show `⌘`/`⇧`; Windows/Linux should show `Ctrl`/`Shift`.
- No typographic tuning (tracking, tabular-nums) for mixed symbol+text.

Upstream display string comes from `getShortcutDisplay(actionId, settings)` → `formatShortcut(key).join(' + ')`, where `mod` already maps to `⌘` (Mac) or `Ctrl` (non-Mac). `compactShortcut` re-maps to glyphs with a second pass.

## Decision

Style: **Minimal secondary text** (Linear/Notion style), always visible but faint, not capsule/badge, not hover-only. Platform-adaptive symbols, always-visible faint color.

Alternatives considered:

- **Kbd pill/badge** (`bg-tertiary` + `border` per key) — most legible, but heavier; rejected for sidebar density.
- **Hover-only reveal** — cleanest, but discoverability low for new users; rejected.

## Visual Spec

- **Size/weight:** `text-[11px] font-medium leading-none tracking-wide` (down from `text-sm font-semibold tracking-normal`)
- **Color:** `text-[var(--theme-text-tertiary)]` at rest, `group-hover:text-[var(--theme-text-secondary)]` + `group-focus-visible:text-[var(--theme-text-secondary)]` on hover/focus. No `opacity-*` utilities. `transition-colors duration-150`.
- **Font:** keep sans but add `tabular-nums` / `font-mono` fallback is not needed; ensure `tracking-wide` gives air between `⇧ ⌘ O`. Keep `whitespace-nowrap ml-auto shrink-0`.
- **Element:** `kbd[data-testid="sidebar-action-shortcut"]`, `aria-hidden="true"`, add `title` with original shortcut string for hover tooltip.
- **No border/shadow/background.**

## Behavioral Spec

- **Platform detection:** `isMac = navigator.platform.toUpperCase().includes('MAC')` (align with `keyboardShortcuts.ts`). `compactShortcut(shortcut, isMac)` maps:
  - `Shift` → `⇧` (both platforms)
  - `Alt`/`Opt` → `⌥` on Mac, `Alt` on Win/Linux
  - `Ctrl` → `Ctrl` (text, never `⌃` for readability)
  - `Cmd`/`⌘`/`mod` → `⌘` on Mac, `Ctrl` on Win/Linux
  - Remaining keys → uppercased as-is (`K`, `O`, etc.)
- **Ordering:** modifiers sorted by `Ctrl(0) < Alt/Opt(1) < Shift(2) < Cmd/⌘/mod(3)` then keys; joined by single space `' '`.
- **Visibility:** always in DOM when `shortcut` non-empty; no conditional hover-only mounting.

## Implementation Scope

- **File:** `src/components/sidebar/SidebarActions.tsx`
  - Replace `COMPACT_SHORTCUT_PARTS` / `COMPACT_SHORTCUT_ORDER` + `compactShortcut` with platform-aware version.
  - Update `ShortcutHint` class string as above, add `title={shortcut}` propagation.
- **Test:** `src/components/sidebar/SidebarActions.test.tsx`
  - Update “hover-revealed” assertion: expect `text-[11px]` / `font-medium` / `tracking-wide` / `text-[var(--theme-text-tertiary)]`, not `text-sm` / `font-semibold` / `opacity-60`.
- **No changes** to `src/utils/keyboardShortcuts.ts`, `ChatArea`, or design tokens.
- **Non-goal:** capsule style, hiding logic, i18n key changes, header shortcut title.

## Verification

- `npm run typecheck` / `NODE_ENV=test node scripts/run-vitest.mjs src/components/sidebar/SidebarActions.test.tsx`
- Visual check in Pearl/Onyx/Graphite themes at sidebar width 240px and 320px; confirm `⌘`/`⇧` crisp at 11px, not clipping `ml-auto`.
- Manual platform spoof: `Object.defineProperty(navigator,'platform',{value:'MacIntel'})` vs `Win32` yields `⇧ ⌘ O` vs `Ctrl ⇧ O`.

## Risks

- 11px glyphs may still be subtle on low-DPI; mitigated by moving from opacity wash to solid tertiary (higher perceived contrast).
- Changing class breaks snapshot tests expecting old classes — updated in same PR.
