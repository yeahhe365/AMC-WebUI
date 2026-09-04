# 分叉消息图标替换为 DSH 分叉图标 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消息气泡「从这里分叉」菜单项图标从 lucide `GitBranch` 换成 DeepSeek Harness 的 `IconBranchOutline16` 字形。

**Architecture:** 新增共享图标组件 `IconBranch`（填充式 16×16 SVG，`currentColor`）到 `src/components/icons/groups/GeneralIcons.tsx`（经 `index.ts` 已有 `export *` 自动导出），`MessageActions.tsx` 分叉菜单项替换引用并移除 `GitBranch` 导入。交互逻辑零改动。

**Tech Stack:** React + TypeScript + Tailwind（类名内联）、vitest（`node scripts/run-vitest.mjs`）、ESLint。

**Spec:** `docs/superpowers/specs/2026-08-23-fork-message-icon-dsh-branch-design.md`

## Global Constraints

- 不新增任何依赖；只动 2 个源文件 + 2 个测试文件。
- SVG 路径数据必须照抄 spec（勿改写数值）。
- 本机 git 缺 GPG 私钥：所有提交用 `git -c commit.gpgsign=false commit ...`。
- 测试命令：`node scripts/run-vitest.mjs run <文件>`；lint 带 `--max-warnings=0`。
- 提交只 add 本任务文件（工作区有他人未提交改动，勿混入）。

---

### Task 1: `IconBranch` 组件（GeneralIcons）

**Files:**

- Modify: `src/components/icons/groups/GeneralIcons.tsx`（文件末尾追加）
- Test: `src/components/icons/groups/GeneralIcons.test.tsx`

**Interfaces:**

- Consumes: `IconProps`、`defaultSize`、`defaultColor`（`@/components/icons/iconPrimitives`，该文件已导入）。
- Produces: `export const IconBranch: React.FC<IconProps>` — props `size`（默认 24）、`className`、`color`（默认 `currentColor`）；忽略 `strokeWidth`（填充字形）。Task 2 通过 `@/components/icons` 桶导入使用。

- [ ] **Step 1: 写失败测试**

在 `src/components/icons/groups/GeneralIcons.test.tsx` 中，把 import 行改为：

```tsx
import { IconBranch, IconNewGroup, IconSidebarToggle } from './GeneralIcons';
```

并在 `describe('GeneralIcons', ...)` 内追加用例：

```tsx
it('renders the DSH branch glyph as a filled 16-grid path', () => {
  const { container } = render(<IconBranch size={14} />);

  const svg = container.querySelector('svg');
  const paths = Array.from(container.querySelectorAll('path'));

  expect(svg?.getAttribute('viewBox')).toBe('0 0 16 16');
  expect(svg?.getAttribute('fill')).toBe('none');
  expect(paths).toHaveLength(1);
  expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
  expect(paths[0]?.getAttribute('fill-rule')).toBe('evenodd');
  expect(paths[0]?.getAttribute('d')).toMatch(/^M13\.0762 1\.37207/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/icons/groups/GeneralIcons.test.tsx`
Expected: FAIL — `IconBranch` 未导出（import 为 undefined，渲染报错或断言失败）。

- [ ] **Step 3: 最小实现**

在 `src/components/icons/groups/GeneralIcons.tsx` 文件末尾追加（路径数据照抄，勿改动）：

```tsx
/**
 * DeepSeek Harness「分叉会话」图标 - 1:1 复刻
 * Source: DeepSeek Harness Web GUI 消息操作（dsh-client-ui-primitives 的 IconBranchOutline16）。
 * 填充式字形：不使用 strokeWidth。
 */
export const IconBranch: React.FC<IconProps> = ({ size = defaultSize, className, color = defaultColor }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.0762 1.37207C14.0846 1.37228 14.9021 2.19077 14.9023 3.19922C14.9022 4.20772 14.0847 5.02518 13.0762 5.02539C12.2967 5.02539 11.6325 4.53691 11.3701 3.84961H4.35547C4.79397 4.26458 5.15861 4.7644 5.41699 5.33496L7.10645 9.06738C7.88526 10.7875 9.55104 11.9228 11.4189 12.0371C11.7085 11.4109 12.3411 10.9756 13.0762 10.9756C14.0843 10.9759 14.9023 11.7936 14.9023 12.8018C14.9023 13.81 14.0843 14.6277 13.0762 14.6279C12.2534 14.6279 11.5574 14.0832 11.3291 13.335C8.9868 13.1879 6.89981 11.7612 5.92285 9.60352L4.23242 5.87109C3.67503 4.64033 2.44878 3.84961 1.09766 3.84961V2.54883C1.10665 2.54883 1.11601 2.54975 1.125 2.5498L11.3701 2.54883C11.6326 1.86151 12.2969 1.37207 13.0762 1.37207ZM13.0762 12.2764C12.7858 12.2764 12.5508 12.5114 12.5508 12.8018C12.5508 13.0921 12.7858 13.3281 13.0762 13.3281C13.3664 13.3279 13.6025 13.092 13.6025 12.8018C13.6025 12.5115 13.3664 12.2766 13.0762 12.2764ZM13.0762 2.67285C12.7855 2.67285 12.55 2.90861 12.5498 3.19922C12.5499 3.48987 12.7855 3.72559 13.0762 3.72559C13.3667 3.72538 13.6024 3.48975 13.6025 3.19922C13.6023 2.90874 13.3666 2.67306 13.0762 2.67285Z"
    />
  </svg>
);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/run-vitest.mjs run src/components/icons/groups/GeneralIcons.test.tsx`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 提交**

```bash
git add src/components/icons/groups/GeneralIcons.tsx src/components/icons/groups/GeneralIcons.test.tsx
git -c commit.gpgsign=false commit -m "feat: 新增 DeepSeek Harness 分叉图标 IconBranch"
```

---

### Task 2: MessageActions 分叉菜单项换图标

**Files:**

- Modify: `src/components/message/MessageActions.tsx:12`（删除 `GitBranch,`）、`:237`（替换用法）
- Test: `src/components/message/MessageActions.test.tsx`（fork 用例内追加断言）

**Interfaces:**

- Consumes: Task 1 的 `IconBranch`（`import { IconBranch } from '@/components/icons';`，桶导出已存在）。
- Produces: 无新接口；`forkMessageTitle` 菜单项渲染 16 网格填充图标。

- [ ] **Step 1: 写失败测试**

在 `src/components/message/MessageActions.test.tsx` 的 fork 用例中，`expect(forkItem).toBeInTheDocument();`（约 :122）之后追加：

```tsx
const forkIcon = forkItem?.querySelector('svg');
expect(forkIcon?.getAttribute('viewBox')).toBe('0 0 16 16');
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/run-vitest.mjs run src/components/message/MessageActions.test.tsx`
Expected: FAIL — 当前 lucide `GitBranch` 渲染 `viewBox="0 0 24 24"`，断言 `0 0 16 16` 不符。

- [ ] **Step 3: 替换实现**

`src/components/message/MessageActions.tsx`：

1. lucide 导入列表中删除 `GitBranch,` 一行（原 :12）。
2. 在 `import { useWindowContext } ...` 之后加：

```tsx
import { IconBranch } from '@/components/icons';
```

3. 原 :237 的 `<GitBranch size={14} strokeWidth={2} />` 改为：

```tsx
<IconBranch size={14} />
```

- [ ] **Step 4: 跑测试确认通过 + lint**

Run: `node scripts/run-vitest.mjs run src/components/message/MessageActions.test.tsx src/components/icons/groups/GeneralIcons.test.tsx`
Expected: PASS。

Run: `npx eslint src/components/message/MessageActions.tsx src/components/message/MessageActions.test.tsx src/components/icons/groups/GeneralIcons.tsx src/components/icons/groups/GeneralIcons.test.tsx --max-warnings=0`
Expected: 无输出（0 问题）。

- [ ] **Step 5: 提交**

```bash
git add src/components/message/MessageActions.tsx src/components/message/MessageActions.test.tsx
git -c commit.gpgsign=false commit -m "feat: 分叉消息按钮改用 DSH 分叉图标"
```

---

## Self-Review 记录

- Spec 覆盖：spec 的 3 条设计点分别落在 Task 1（组件+注释+路径照抄）与 Task 2（替换引用+删导入）；「不做的事」无对应任务（正确）；验证节由两任务 Step 4 覆盖。
- 占位符扫描：无 TBD/TODO，所有代码步骤含完整代码。
- 类型一致性：`IconBranch` 在 Task 1 定义、Task 2 经 `@/components/icons` 桶导入，签名一致；测试断言的 `viewBox`/`fill-rule` 与实现属性一致（React 输出为小写 `fill-rule`）。
