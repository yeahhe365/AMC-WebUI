export type AskPanelDockSide = 'left' | 'right';

const ASK_PANEL_DOCK_THRESHOLD = 28;

/**
 * 拖拽结束时判断询问面板应停靠到哪一侧：
 * 面板右缘贴近视口右缘优先停靠右侧，左缘同理；都不满足则返回 null。
 */
export const resolveAskPanelDockSide = (
  rectLeft: number,
  rectRight: number,
  viewportWidth: number,
  threshold: number = ASK_PANEL_DOCK_THRESHOLD,
): AskPanelDockSide | null => {
  if (rectRight >= viewportWidth - threshold) return 'right';
  if (rectLeft <= threshold) return 'left';
  return null;
};
