import React from 'react';
import { type UploadedFile } from '@/types';
import { SelectedFileDisplay } from '@/components/chat/input/files/SelectedFileDisplay';
import { useAutoAnimate } from '@formkit/auto-animate/react';

interface ChatFilePreviewListProps {
  selectedFiles: UploadedFile[];
  onRemove: (id: string) => void;
  onCancelUpload: (id: string) => void;
  onConfigure: (file: UploadedFile) => void;
  onMoveTextToInput: (file: UploadedFile) => Promise<void>;
  onPreview: (file: UploadedFile) => void;
  isGemini3?: boolean;
}

const ChatFilePreviewListComponent: React.FC<ChatFilePreviewListProps> = ({
  selectedFiles,
  onRemove,
  onCancelUpload,
  onConfigure,
  onMoveTextToInput,
  onPreview,
  isGemini3,
}) => {
  const [parent] = useAutoAnimate<HTMLDivElement>({
    duration: 200,
    easing: 'ease-in-out',
  });

  if (selectedFiles.length === 0) return null;

  return (
    <div ref={parent} className="flex gap-2 overflow-x-auto pb-2 mb-1 custom-scrollbar px-1 items-start">
      {selectedFiles.map((file) => (
        <SelectedFileDisplay
          key={file.id}
          file={file}
          onRemove={onRemove}
          onCancelUpload={onCancelUpload}
          onConfigure={onConfigure}
          onMoveTextToInput={onMoveTextToInput}
          onPreview={onPreview}
          isGemini3={isGemini3}
        />
      ))}
    </div>
  );
};

export const ChatFilePreviewList = React.memo(ChatFilePreviewListComponent);
