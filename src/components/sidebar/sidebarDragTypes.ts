/**
 * The drag data type used to carry a session id during a sidebar session drag.
 * `setData('sessionId', ...)` is normalized by the spec to lowercase ASCII, so
 * the DataTransfer type is `'sessionid'`, not `'sessionId'`. Keep the payload
 * and the guard checking this constant in lockstep.
 */
export const SESSION_DRAG_TYPE = 'sessionid';
export const GROUP_DRAG_TYPE = 'groupid';

export const isSessionDrag = (event: { dataTransfer?: DataTransfer | null }): boolean => {
  if (!event?.dataTransfer?.types) return false;
  return Array.from(event.dataTransfer.types).includes(SESSION_DRAG_TYPE);
};

export const isGroupDrag = (event: { dataTransfer?: DataTransfer | null }): boolean => {
  if (!event?.dataTransfer?.types) return false;
  return Array.from(event.dataTransfer.types).includes(GROUP_DRAG_TYPE);
};

/**
 * before/after 的唯一判定实现：指示线渲染与落点处理必须共用它，
 * 否则"看到的线"和"落下的位置"会各说各话。
 */
export const resolveDropPosition = (event: {
  clientY: number;
  currentTarget: EventTarget & { getBoundingClientRect: () => { top: number; height: number } };
}): 'before' | 'after' => {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
};
