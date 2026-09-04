const THINKING_STRIP_VISIBLE_LINES = 5;
const THINKING_STRIP_LINE_HEIGHT_REM = 1.25;
// Cap for the strip viewport height: short content shrinks to its natural
// height, longer content locks to this cap and scrolls. 6.25rem = 100px.
export const THINKING_STRIP_CONTENT_HEIGHT_REM = THINKING_STRIP_VISIBLE_LINES * THINKING_STRIP_LINE_HEIGHT_REM;
/** strip 内渲染的源文本尾部窗口(供向上滚动回看的行数上限)。 */
export const THINKING_STRIP_MAX_SOURCE_LINES = 24;
