import React from 'react';
import { Modal } from '@/components/shared/Modal';

interface TextEditorModalShellProps {
  onClose: () => void;
  contentClassName: string;
  header: React.ReactNode;
  body: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export const TextEditorModalShell: React.FC<TextEditorModalShellProps> = ({
  onClose,
  contentClassName,
  header,
  body,
  footer,
  ariaLabel,
  ariaLabelledBy,
}) => {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      noPadding
      contentClassName={contentClassName}
      ariaLabel={ariaLabel}
      ariaLabelledBy={ariaLabelledBy}
    >
      {header}
      {body}
      {footer}
    </Modal>
  );
};
