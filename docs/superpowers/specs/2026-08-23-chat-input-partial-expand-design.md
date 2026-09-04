# Chat Input Partial Expand — Design

## Context

AMC 的输入框展开目前是 `fixed inset-0 z-[2000]` 全屏遮罩 (`chatInputAreaLayout.wrapperClass` / `ChatTextArea` `height:100%`)，占据整个网页。Cherry Studio 的同款角落展开按钮（`ComposerSurfaceRuntime` + `useComposerEditorFrameSizing`）仅在原地把编辑器容器高度提升到 `max(220px, 50vh)`，收起时限制为 `max(220px, 40vh)`，并支持顶部拖拽手柄在 `minHeight` ~ `maxHeight` 间调节。用户要求 AMC 改为 Cherry 的“只展开一部分空间”。

## Goals

- 点击右上角角落按钮在 **原地部分展开** 与收起间切换，不再遮蔽消息列表。
- 高度策略与 Cherry 一致：展开 `max(220px, 50vh)`，收起 `max(220px, 40vh)`，可拖拽手柄微调。
- 视觉保持 `rounded-[20px]`、`ChatInputExpandCorner` 现有样式与 `hasCustomHeight` 图标切换。

## Non-Goals

- 不新增设置项控制展开行为（现有 `isFullscreen/isExpanded` 即开关）。
- 不改动消息列表虚拟化/滚动逻辑，仅保证输入框自身高度变化不推走视口。

## Approach (selected)

**完全按 Cherry 做**：引入 `useChatInputExpandSizing`（精简版 `useComposerEditorFrameSizing`），`ChatInputArea` 顶部渲染拖拽手柄与角落按钮，`chatInputAreaLayout` 去掉 `fixed inset-0` 全屏分支，`ChatTextArea` 在展开时 `height:100%` 且受容器 `max-h-[max(220px,50vh)]` 约束。

Alternatives considered:

- 仅固定 50vh 无拖拽：实现更简单但失去 Cherry 的精细调节，且与现有 Cherry 手感不一致。
- 保留全屏并新增半屏切换：增加设置与分支复杂度，用户已明确不要全屏。

## Architecture

```
useChatInputExpandSizing (new)
  ├─ frameRef, frameStyle {height, minHeight, overflow:hidden, transition}
  ├─ editorContentStyle {--composer-editor-max-height, --composer-editor-height}
  ├─ isExpanded, hasCustomHeight, manualHeight
  └─ toggleExpanded, startResize, handleResizeKeyDown, handleTransitionEnd

ChatInputArea
  ├─ getChatInputAreaLayout({isExpanded, isPipActive, ...}) // 去掉 fixed 分支
  ├─ 顶部拖拽手柄 div[data-composer-resize-handle]
  └─ inputContainer (relative, rounded-[20px]) 内含 ChatInputExpandCorner + frameRef 包裹 ChatTextArea

ChatTextArea
  └─ isExpanded 时 height:100% / overflow:auto，否则按 shadow 测量 + 40vh 上限

ChatInputExpandCorner
  └─ aria-pressed = hasCustomHeight (isExpanded || manualHeight != null)

State
  └─ 复用 machineState.isFullscreen（语义改为 isExpanded），避免存储键迁移；对外可别名 isExpanded。
```

## Data Flow

1. `useChatInputState` 管理 `isFullscreen` 布尔（后续可重命名为 `isExpanded`，兼容旧键）。
2. `ChatInputArea` 调用 `useChatInputExpandSizing({isExpanded, onExpandedChange, focusEditor, ...})` 获得 `frameRef/frameStyle`。
3. 点击角落按钮 → `toggleExpanded()` → 翻转 `isExpanded`，`frameStyle` 在 260ms 过渡内通过 `animatedHeight` 插值。
4. 拖拽手柄 `onMouseDown` → `useResizeDrag` → `setClampedManualHeight()`，若从展开态开始拖拽则先 `onExpandedChange(false)`。

## Sizing Details

- `minHeight = INITIAL_TEXTAREA_HEIGHT_PX + chrome (~ 48px)` 或沿用 Cherry 的 `getComposerEditorMinHeight(fontSize)` 映射（AMC 暂取 56px 基准，对应现有 `initialTextareaHeight+2`）。
- `collapsedMax = max(220, 40vh)`, `expandedMax = max(220, 50vh)` — 与 `useComposerEditorFrameSizing.COMPOSER_EDITOR_*` 一致，Tailwind 用 `max-h-[max(220px,40vh)]!` / `max-h-[max(220px,50vh)]!`。
- 键盘 `ArrowUp/Down 16px`、`Home/End` 同 Cherry。

## Error Handling

- `frameRef` 缺失时回退到 `minHeight`/`manualHeight`。
- `window.innerHeight` 在 SSR/测试中以 `1024` 回退（与现有 `ChatTextArea.test` 一致，mock `window.innerHeight`）。
- 拖拽越界由 `clampComposerEditorHeightPx(min,max)` 保证。

## Testing

- 更新 `chatInputAreaLayout.test` / `ChatInputArea.test`：不再断言 `fixed inset-0` / `z-[2000]`，改为断言 `max(220px,50vh)` 与 `expanded` 类。
- 更新 `ChatTextArea.test`：展开态期望 `height:100%` 且容器受 `frameStyle` 约束，而非全屏。
- 新增 `useChatInputExpandSizing.test`（可选）：覆盖 `toggleExpanded`、`clamp`、`drag collapseExpanded` 行为，复用 Cherry 的 `ComposerSurface.test` 用例思路。
- 运行 `pnpm test` 相关文件 + `pnpm lint` / `pnpm build` 验证。

## Rollout

- 单次提交，保持 `isFullscreen` 存储键兼容（值含义由全屏改为部分展开），无需迁移。
- 若后续需重命名为 `isExpanded`，另起迁移提交。
