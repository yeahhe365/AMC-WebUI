# 询问面板贴边收起（Edge Docking）设计

日期：2026-08-30
范围：`SelectionAskPanel`（划词"询问"弹窗）

## 需求

询问面板拖到页面左右边缘附近时，自动收起到边缘里，只留一个小把手；鼠标靠近把手时自动展开。展开后保持展开（不因鼠标移开而收起），直到再次拖近边缘或关闭。

## 行为定义

- **吸附时机**：仅拖拽结束（pointerup）时判定。拖拽结束后面板右缘距视口右缘 < 28px → 停靠右侧；左缘同理。左右同时满足时优先右侧。拖拽过程中不吸附，初始定位不吸附（必须由用户拖拽触发）。
- **收起形态**：面板 DOM 卸载，渲染一个固定在边缘的竖向把手（22×56px，半圆角贴边，含方向箭头），垂直位置取面板收起时的垂直中点（clamp 在视口内）。
- **展开**：鼠标悬停或键盘聚焦把手时展开。面板恢复到停靠前那一侧的完整位置（右停靠 → `left = vw - width - 12`；左停靠 → `left = 12`；top 取收起时的 top 并 clamp），重新播放入场动画。展开后不再自动收起。
- **再次停靠**：只能通过再次把面板拖近边缘触发。调整大小（resize）结束不触发停靠。
- 面板状态（问题、回答、流式请求）在收起/展开期间保留；停靠状态下 Escape / 关闭按钮逻辑不变（把手仅用于展开，关闭需先展开）。

## 实现要点

- `src/utils/text-selection/askPanelDocking.ts`：纯函数 `resolveAskPanelDockSide(rectLeft, rectRight, viewportWidth, threshold)`，导出阈值常量 28。
- `SelectionAskPanel.tsx`：
  - 新增状态 `docked: 'left' | 'right' | null` 与 `dockedTop`；
  - `handlePointerUp` 拖拽结束时用面板 `getBoundingClientRect()` 判定吸附；
  - `docked` 非 null 时渲染边缘把手按钮（`onMouseEnter` / `onFocus` → `expandFromDock`）；
  - `expandFromDock` 恢复 `position` 并清空 `docked`。

## 测试

- `askPanelDocking.test.ts` 未单列，判定逻辑经组件测试覆盖；`SelectionAskPanel.test.tsx`：
  - 左/右拖近边缘 → 收起为对应侧把手 → 悬停展开到正确位置；
  - 远离边缘拖拽结束不吸附；
  - 展开后鼠标移开保持展开；
  - jsdom 环境下 stub `setPointerCapture`/`releasePointerCapture`，用 `getBoundingClientRect` 覆写模拟面板位置。
