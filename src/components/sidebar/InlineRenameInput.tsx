import React, { type RefObject } from 'react';

interface InlineRenameInputProps {
  editInputRef: RefObject<HTMLInputElement>;
  title: string;
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** GroupItem 内嵌在 <summary> 中，需要阻止 click 冒泡到展开切换；SessionItem 不需要 */
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
  className: string;
}

/**
 * 侧边栏内联重命名输入框：SessionItem 与 GroupItem 共用同一份 JSX。
 * 聚焦全选（onFocus select）与受控 value 行为在两处原本就完全一致；
 * 其余可见差异（className、是否阻止 click 冒泡）通过 props 原样透传。
 */
export const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  editInputRef,
  title,
  onTitleChange,
  onBlur,
  onKeyDown,
  onClick,
  className,
}) => (
  <input
    ref={editInputRef}
    type="text"
    value={title}
    onChange={onTitleChange}
    onFocus={(e) => e.currentTarget.select()}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
    onClick={onClick}
    className={className}
  />
);
