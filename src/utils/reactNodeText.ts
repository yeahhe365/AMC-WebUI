import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

export interface CodeElementProps {
  className?: string;
  children?: ReactNode;
}

export const extractTextFromNode = (node: ReactNode): string => {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromNode).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextFromNode(node.props.children);
  }
  return '';
};

export const findCodeElement = (children: ReactNode): ReactElement<CodeElementProps> | undefined => {
  return Children.toArray(children).find(
    (child): child is ReactElement<CodeElementProps> =>
      isValidElement<CodeElementProps>(child) &&
      (child.type === 'code' || Boolean(child.props.className?.includes('language-'))),
  );
};
