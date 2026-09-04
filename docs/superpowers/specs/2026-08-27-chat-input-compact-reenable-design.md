# Chat Input Compact Mode Re-Enable Design

> 2026-08-27 · 重新启用输入框「空态收窄为单行」的紧凑模式（Cherry Studio 对齐），并修复导致其被关闭的两个输入冻结 bug。

## Goal

输入框在空态/单行内容时收窄为单行高度（紧凑模式），多行内容时自动恢复常规高度，行为对齐 cherry-studio 的 `useCompactComposerPresentation`。同时消除此前导致「清空后输入冻结」的两个无限渲染循环，使 `enabled: false` 可以安全恢复为 `!hasCustomHeight && !isMobile`。

## Root Causes（已实测复现）

1. **无限渲染循环 A（输入冻结）**：`ChatInputArea` 传入 `isComposing: () => isComposingRef.current`，该内联箭头函数每次渲染都是新引用 → hook 内 `requestMeasurement` 的 `useCallback` 依赖变化、每次渲染重建 → `useEffect([inputText, requestMeasurement])` 每次渲染重跑 → `requestMeasurement()` → `setRev` → 渲染 → 循环。`enabled:false` 时守卫短路，故之前关闭 compact 才能避免冻结。
2. **无限渲染循环 B（多行输入冻结）**：`MutationObserver` 观察 frame 子树；React/浏览器每次渲染会重写 textarea 自身的 `#text` 子节点 → observer 触发 → `requestMeasurement` → `setM` → 渲染 → 再次重写 → 循环。cherry 的编辑器是 Tiptap（contenteditable），不存在 textarea 文本节点重写问题，因此 cherry 的观察器接线不会自激。
3. **紧凑模式从未生效**：`hasRowOverflow` 用输入容器的 `scrollWidth` 判断，展开角按钮 `translate-x-2.5` 造成约 4px 的水平溢出 → 恒判 `regular`。cherry 只在紧凑布局挂 `data-composer-compact-row` 且紧凑态隐藏角标，测不到该溢出。

## Changes

### `useCompactChatInputPresentation.ts`

- `MutationObserver` 回调过滤以 `HTMLTextAreaElement` 为 target 的 mutation（textarea 的 value 写入重写自身文本节点，属应用自身更新而非内容信号；value 变化已由 `inputText` effect 驱动测量）。其余 mutation（富文本 `.composer-tiptap` 变体的内容编辑）照常触发测量。
- 水平溢出判断由「装饰过的容器」改为编辑器元素自身：`ed.scrollWidth > ed.clientWidth + 1`（textarea 软换行，几乎不触发；不再被角标装饰误伤）。移除对 `data-composer-compact-row` 的依赖。

### `ChatInputArea.tsx`

- 恢复 `enabled: !hasCustomHeight && !isMobile`。
- `isComposing` 用 `useCallback(…, [])` 稳定引用。
- 紧凑态隐藏 resize 手柄与展开角标（`{!isCompact && …}`，cherry 同款）：避免 32px 角标压住约 29px 的单行编辑器；内容增长回 regular 后自动恢复。
- 移除已被 hook 弃用的 `data-composer-compact-row` 属性。

### 高度行为（不变，与 cherry 一致）

- 紧凑单行：`ceil(fontSize*1.4+6)`（默认 16px 字体 ≈ 29px）
- 常规最小：`ceil(fontSize*1.4*2+6)`；自动增长上限 `max(220px, 40vh)`；展开上限 `max(220px, 50vh)`

## Verification

- 新 e2e `e2e/chat-input-compact.spec.ts`：空态收窄 → 单行保持 → 多行增长 + 角标出现 → 角标展开/收起 → 清空回紧凑 → 清空后可继续输入（覆盖两个冻结回归）。
- `src/components/chat/input` 24 个测试文件 120 用例全部通过；全量 2985 用例中仅 4 个为 HEAD 既有失败（与本次改动无关，已逐一对照 HEAD 确认）。
- `eslint`（改动文件零告警）、`tsc --noEmit`（改动文件零错误）、`prettier` 均通过。
