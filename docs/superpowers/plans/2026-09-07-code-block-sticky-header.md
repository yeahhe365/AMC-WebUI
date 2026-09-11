# 代码块头部吸顶与操作栏常驻实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造代码块组件，使长代码块在聊天页面滚动时头部工具栏自动吸顶悬浮在视口顶部，且工具栏操作按钮在桌面端常驻可见。

**Architecture:** 移除 `CodeBlock.tsx` 根容器阻断 CSS 吸顶的 `overflow-hidden` 类，并在底部元素补充 `rounded-b-lg` 维持圆角剪裁；同时调整 `CodeHeader.tsx` 的工具栏可见性类，移除 `sm:opacity-0` 确保按钮常驻可见。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- 不破坏 `CodeBlock.tsx` 与 `CodeHeader.tsx` 原有 Props 接口与功能逻辑（复制、全屏预览、Python执行、折叠等）。
- 保持各主题（Onyx, Graphite, Pearl）下背景色 `bg-[var(--theme-bg-code-block-header)]` 与边框视觉统一。
- 遵循现有的 Tailwind 规范，通过所有单元测试和架构回归测试。

---

### Task 1: 调整 CodeHeader 工具栏按钮为常驻可见并更新测试

**Files:**

- Modify: `src/components/message/blocks/parts/CodeHeader.tsx`
- Modify: `src/components/message/blocks/parts/CodeHeader.test.tsx`

**Interfaces:**

- `CodeHeader`: 保留现有全部 `CodeHeaderProps` 接口与属性。
- 改变项：`[data-code-header-toolbar]` 的 className 不再包含 `sm:opacity-0`。

- [ ] **Step 1: 在 `CodeHeader.test.tsx` 中编写针对工具栏常驻可见的测试**

```tsx
it('keeps header toolbar visible at all times without desktop sm:opacity-0 hiding', () => {
  act(() => {
    renderer.root.render(
      <CodeHeader
        language="python"
        showPreview={false}
        isOverflowing={false}
        isExpanded={false}
        isCopied={false}
        onToggleExpand={vi.fn()}
        onCopy={vi.fn()}
        onDownload={vi.fn()}
        onOpenSide={vi.fn()}
        onOpenPreview={vi.fn()}
      />,
    );
  });

  const toolbar = renderer.container.querySelector('[data-code-header-toolbar]') as HTMLElement | null;
  expect(toolbar).not.toBeNull();
  expect(toolbar?.className).not.toContain('sm:opacity-0');
  expect(toolbar?.className).toContain('opacity-90');
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/components/message/blocks/parts/CodeHeader.test.tsx`
Expected: FAIL，因为当前包含 `sm:opacity-0`。

- [ ] **Step 3: 修改 `CodeHeader.tsx` 工具栏类名为常驻可见**

在 `src/components/message/blocks/parts/CodeHeader.tsx` 中将：

```tsx
      <div
        data-code-header-toolbar
        className="flex flex-shrink-0 items-center gap-0.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
```

修改为：

```tsx
      <div
        data-code-header-toolbar
        className="flex flex-shrink-0 items-center gap-0.5 opacity-90 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/components/message/blocks/parts/CodeHeader.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交更改**

```bash
git add src/components/message/blocks/parts/CodeHeader.tsx src/components/message/blocks/parts/CodeHeader.test.tsx
git commit -m "feat(code-block): make code header toolbar always visible"
```

---

### Task 2: 移除 CodeBlock 根容器 overflow-hidden 并补充底部圆角

**Files:**

- Modify: `src/components/message/blocks/CodeBlock.tsx`
- Modify: `src/components/message/blocks/CodeBlock.test.tsx`

**Interfaces:**

- `CodeBlock`: 根容器支持 `position: sticky` 子元素相对于外部聊天滚动视口吸顶。

- [ ] **Step 1: 在 `CodeBlock.test.tsx` 中编写针对根容器不含 overflow-hidden 的断言**

```tsx
it('does not apply overflow-hidden to root container to enable sticky header scrolling', () => {
  act(() => {
    renderer.root.render(
      <CodeBlock
        onOpenHtmlPreview={vi.fn()}
        onOpenSidePanel={vi.fn()}
        expandCodeBlocksByDefault={false}
        className="language-python"
      >
        <code className="language-python">{'print("hello")'}</code>
      </CodeBlock>,
    );
  });

  const root = renderer.container.firstElementChild as HTMLElement | null;
  expect(root).not.toBeNull();
  expect(root?.className).toContain('rounded-lg');
  expect(root?.className).toContain('border');
  expect(root?.className).not.toContain('overflow-hidden');
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/components/message/blocks/CodeBlock.test.tsx`
Expected: FAIL，因为当前根容器包含 `overflow-hidden`。

- [ ] **Step 3: 修改 `CodeBlock.tsx` 根容器并为底部元素补充 rounded-b-lg**

1. 将最外层容器（line 342 附近）：

```tsx
<div className="group relative my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-code-block)] shadow-sm overflow-hidden">
```

修改为：

```tsx
<div className="group relative my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-code-block)] shadow-sm">
```

2. 为 `<pre>` 添加 `rounded-b-lg`，确保底部与滚动条贴合圆角边界：

```tsx
        <pre
          ref={preRef}
          className={`${props.className || ''} group !m-0 !p-0 !border-none !rounded-none rounded-b-lg !bg-transparent custom-scrollbar ${
            isWrapped ? '!whitespace-pre-wrap !break-all !overflow-x-hidden' : '!whitespace-pre !overflow-x-auto'
          }`}
```

3. 为折叠展开蒙层（`code-block-expand-overlay`）添加 `rounded-b-lg`：

```tsx
        {isOverflowing && !isExpanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-20 select-none bg-gradient-to-t from-[var(--theme-bg-code-block)] to-transparent cursor-pointer flex items-end justify-center pb-2 group/expand code-block-expand-overlay rounded-b-lg"
            onClick={handleToggleExpand}
          >
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/components/message/blocks/CodeBlock.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交更改**

```bash
git add src/components/message/blocks/CodeBlock.tsx src/components/message/blocks/CodeBlock.test.tsx
git commit -m "fix(code-block): allow header to stick during scroll by removing root overflow-hidden"
```

---

### Task 3: 运行全量相关回归测试

**Files:**

- Test: `src/components/message/blocks/CodeBlock.test.tsx`
- Test: `src/components/message/blocks/parts/CodeHeader.test.tsx`
- Test: `src/test/architecture/uiClarityRegressions.test.ts`
- Test: `src/components/message/BasicMarkdownRenderer.test.tsx`

- [ ] **Step 1: 运行所有代码块相关测试**

Run: `npm test -- src/components/message/blocks/CodeBlock.test.tsx src/components/message/blocks/parts/CodeHeader.test.tsx src/test/architecture/uiClarityRegressions.test.ts src/components/message/BasicMarkdownRenderer.test.tsx`
Expected: 所有测试文件全部通过 (PASS)。

- [ ] **Step 2: 验证 git 状态干净**

Run: `git status -s`
