# 代码块头部吸顶与操作栏常驻设计

日期：2026-09-07
范围：`src/components/message/blocks/CodeBlock.tsx`、`src/components/message/blocks/parts/CodeHeader.tsx`

## 需求背景

在长代码块（如几百甚至上千行）展开阅读时，用户向下滚动浏览代码，原有的代码块头部工具栏（语言、行数、预览、换行、下载、复制、折叠等）会随顶部滚出视口。用户若需复制代码或切换预览，需长距离往回滚动，操作不便。
同时，桌面端原先在未 hover 时将操作按钮设为 `sm:opacity-0`，导致在吸顶或快速扫读时不易直观发现和直接点击操作。

需求目标：

1. **页面滚动时工具栏吸顶**：无论用户如何在长代码块中向下滚动，代码块头部工具栏始终保持吸附在聊天区域视口顶部；超出代码块底部时随父块自然滚出。
2. **操作按钮常驻可见**：在桌面端/吸顶时保持操作按钮常驻可见（不再隐藏为 `opacity-0`），方便随时操作。

## 方案设计

### 1. 滚动吸顶机制与容器样式调整

- **解除外层剪裁阻断**：
  在 `CodeBlock.tsx` 中，最外层容器原先设置了 `overflow-hidden`：
  ```tsx
  <div className="group relative my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-code-block)] shadow-sm overflow-hidden">
  ```
  CSS 规则中，中间容器的 `overflow: hidden` 会建立剪裁上下文，破坏子元素相对于外部聊天滚动视口（Virtuoso）的 `position: sticky` 吸顶能力。
  解决方案：移除最外层容器的 `overflow-hidden`。
- **圆角与视觉边界约束**：
  - 最外层容器保留 `rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-code-block)]`；
  - 顶部 `CodeHeader` 已具备 `rounded-t-lg`，常态下精准贴合外层圆角；
  - 底部 `<pre>` 以及展开蒙层（`code-block-expand-overlay`）补充 `rounded-b-lg`，防止未折叠或横向滚动内容超出圆角边缘。
- **吸顶层级与边界保证**：
  - `CodeHeader` 保留 `sticky top-0 z-10`，其背景色使用主题纯色 `bg-[var(--theme-bg-code-block-header)]`，下部具有 `border-b border-[var(--theme-border-secondary)]/50`；
  - 层级高于代码行号栏（`z-[1]`）与代码文本，代码向上滚动时从头部下方穿过，文本不透出；
  - 层级低于底部悬浮输入栏（`z-30`）及各类全局 Modal，滚动至底部时不产生遮挡冲突。

### 2. 操作栏按钮常驻显示

- 在 `CodeHeader.tsx` 中，将 `[data-code-header-toolbar]` 的样式：
  ```tsx
  className =
    'flex flex-shrink-0 items-center gap-0.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-200';
  ```
  调整为：
  ```tsx
  className =
    'flex flex-shrink-0 items-center gap-0.5 opacity-90 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200';
  ```
  不再在 `sm` 断点下将未 hover 状态隐藏为 `opacity-0`，确保用户随时可直接点击按钮。

## 测试与验证计划

1. **`CodeHeader.test.tsx`**：
   - 验证操作栏不再包含 `sm:opacity-0` 类，断言各操作按钮在常态下即为可见状态；
   - 验证 `sticky top-0 z-10` 与背景色、边框等样式属性保持一致。
2. **`CodeBlock.test.tsx`**：
   - 验证代码块根容器不再包含 `overflow-hidden`，确保不会破坏吸顶机制；
   - 验证带有行号和代码内容的渲染不受影响。
3. **架构与回归测试**：
   - 运行项目全量 `npm test` 中相关的 Markdown / Block 渲染测试，确保全部通过。
