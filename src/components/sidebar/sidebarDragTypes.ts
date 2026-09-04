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
