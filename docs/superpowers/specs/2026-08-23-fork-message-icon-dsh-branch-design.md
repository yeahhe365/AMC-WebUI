# 消息「从这里分叉」图标替换为 DeepSeek Harness 分叉图标 — 设计

日期：2026-08-23
状态：已批准（方案 1）

## 背景与目标

消息气泡操作菜单中的「从这里分叉」（`forkMessageTitle`）按钮目前使用 lucide 的
`GitBranch` 图标。用户要求将其替换为 DeepSeek Harness（DSH）Web GUI 中
「分叉会话」按钮所用的图标（`IconBranchOutline16`）。

## 现状

- `src/components/message/MessageActions.tsx:237`：`<GitBranch size={14} strokeWidth={2} />`，
  是 `src` 中 `GitBranch` 的唯一使用点。
- DSH 图标：16×16 viewBox 的填充（filled）字形，单条 `path`，`fill="currentColor"`，
  `fillRule="evenodd"`；已从运行中的 DSH Web bundle 提取并渲染核对。
- 仓库图标约定：自定义图标放在 `src/components/icons/groups/GeneralIcons.tsx`，
  形如 `React.FC<IconProps>`，经 `src/components/icons/index.ts` re-export；
  引用外部来源的图标附来源注释（见 `IconNewChat` 的 Cherry Studio 注释）。

## 设计（方案 1）

1. 在 `src/components/icons/groups/GeneralIcons.tsx` 新增 `IconBranch`：
   - 签名 `React.FC<IconProps>`，使用 `size`（默认 24）、`className`、`color`
     （默认 `currentColor`）；填充型图标不使用 `strokeWidth`。
   - SVG：`viewBox="0 0 16 16"` `fill="none"`，单个 `<path>` 使用 DSH
     `IconBranchOutline16` 的原始 `d`，`fill={color}`，`fillRule/clipRule="evenodd"`，
     `aria-hidden="true"`。
   - 附来源注释：图标取自 DeepSeek Harness Web GUI（`IconBranchOutline16`）。
   - 路径数据（照抄 DSH，勿改写数值）：
     `M13.0762 1.37207C14.0846 1.37228 14.9021 2.19077 14.9023 3.19922C14.9022 4.20772 14.0847 5.02518 13.0762 5.02539C12.2967 5.02539 11.6325 4.53691 11.3701 3.84961H4.35547C4.79397 4.26458 5.15861 4.7644 5.41699 5.33496L7.10645 9.06738C7.88526 10.7875 9.55104 11.9228 11.4189 12.0371C11.7085 11.4109 12.3411 10.9756 13.0762 10.9756C14.0843 10.9759 14.9023 11.7936 14.9023 12.8018C14.9023 13.81 14.0843 14.6277 13.0762 14.6279C12.2534 14.6279 11.5574 14.0832 11.3291 13.335C8.9868 13.1879 6.89981 11.7612 5.92285 9.60352L4.23242 5.87109C3.67503 4.64033 2.44878 3.84961 1.09766 3.84961V2.54883C1.10665 2.54883 1.11601 2.54975 1.125 2.5498L11.3701 2.54883C11.6326 1.86151 12.2969 1.37207 13.0762 1.37207ZM13.0762 12.2764C12.7858 12.2764 12.5508 12.5114 12.5508 12.8018C12.5508 13.0921 12.7858 13.3281 13.0762 13.3281C13.3664 13.3279 13.6025 13.092 13.6025 12.8018C13.6025 12.5115 13.3664 12.2766 13.0762 12.2764ZM13.0762 2.67285C12.7855 2.67285 12.55 2.90861 12.5498 3.19922C12.5499 3.48987 12.7855 3.72559 13.0762 3.72559C13.3667 3.72538 13.6024 3.48975 13.6025 3.19922C13.6023 2.90874 13.3666 2.67306 13.0762 2.67285Z`
2. `MessageActions.tsx` 分叉菜单项改用 `<IconBranch size={14} />`，
   并删除 lucide `GitBranch` 导入。
3. 无新增导出清单改动（`index.ts` 已 `export * from './groups/GeneralIcons'`）。

## 不做的事

- 不改动分叉交互逻辑、菜单结构、其他图标。
- 不替换 lucide 其他图标；不引入新依赖。

## 验证

- `IconBranch` 渲染 14px 时与相邻 14px 菜单图标视觉协调（填充字形，继承主题色）。
- 现有测试不受影响：`MessageActions.test.tsx` 仅断言分叉按钮存在与点击，不涉及图标。
- 运行相关 lint / 测试确认无回归。
