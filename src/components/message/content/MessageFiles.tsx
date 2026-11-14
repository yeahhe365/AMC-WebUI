import React, { useMemo } from 'react';
import { type UploadedFile } from '@/types';
import { FileDisplay } from '@/components/message/FileDisplay';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { useI18n } from '@/contexts/I18nContext';

interface MessageFilesProps {
  files: UploadedFile[];
  content?: string;
  onImageClick: (file: UploadedFile) => void;
  onConfigureFile?: (file: UploadedFile, messageId: string) => void;
  messageId: string;
  isGemini3?: boolean;
  hasContentOrAudio: boolean;
}

export const MessageFiles: React.FC<MessageFilesProps> = ({
  files,
  content,
  onImageClick,
  onConfigureFile,
  messageId,
  isGemini3,
  hasContentOrAudio,
}) => {
  const { t } = useI18n();
  const hasToolResult = /\btool-result\b/.test(content || '');

  const { imageFiles, documentFiles, generatedVideos } = useMemo(() => {
    if (!files || files.length === 0) {
      return { imageFiles: [], documentFiles: [], generatedVideos: [] };
    }

    const imageAttachments: UploadedFile[] = [];
    const documentAttachments: UploadedFile[] = [];
    const videos: UploadedFile[] = [];
    files.forEach((file) => {
      // Tool result blocks already render generated outputs inline.
      // Hide any generated attachments from the top strip to avoid duplicate previews.
      if (hasToolResult && file.name.startsWith('generated-')) {
        return;
      }

      if (file.name.startsWith('generated-video-') && file.type.startsWith('video/') && file.dataUrl) {
        videos.push(file);
        return;
      }
      const isImageFile = isImageMimeType(file.type);
      if (isImageFile) imageAttachments.push(file);
      else documentAttachments.push(file);
    });
    return { imageFiles: imageAttachments, documentFiles: documentAttachments, generatedVideos: videos };
  }, [files, hasToolResult]);

  if (!files || files.length === 0) return null;

  const isQuadImageView =
    imageFiles.length === 4 &&
    imageFiles.every((file) => file.name.startsWith('generated-image-') || file.name.startsWith('edited-image-'));
  const isStripImageView = imageFiles.length > 1 && !isQuadImageView;
  const marginClass = hasContentOrAudio ? 'mb-2' : '';

  const showDocScroll = documentFiles.length > 4;

  if (imageFiles.length === 0 && documentFiles.length === 0 && generatedVideos.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2 ${marginClass}`}>
      {generatedVideos.map((file) => (
        <div key={file.id} className="w-full max-w-xl">
          <video src={file.dataUrl} controls preload="metadata" className="w-full rounded-xl" />
          <a href={file.dataUrl} download={file.name} className="text-sm text-[var(--theme-text-link)]">
            {t('filePreviewDownloadFile')}
          </a>
        </div>
      ))}
      {imageFiles.length > 0 &&
        (isQuadImageView ? (
          <div className="grid grid-cols-2 gap-2">
            {imageFiles.map((file) => (
              <FileDisplay
                key={file.id}
                file={file}
                onFileClick={onImageClick}
                isFromMessageList={true}
                isGridView={true}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-row gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar md:custom-scrollbar">
            {imageFiles.map((file) => (
              <div key={file.id} className={isStripImageView ? 'flex-shrink-0 h-40 w-40 sm:w-48' : 'flex-shrink-0'}>
                <FileDisplay
                  file={file}
                  onFileClick={onImageClick}
                  isFromMessageList={true}
                  isStripView={isStripImageView}
                  onConfigure={onConfigureFile ? () => onConfigureFile(file, messageId) : undefined}
                  isGemini3={isGemini3}
                />
              </div>
            ))}
          </div>
        ))}

      {documentFiles.length > 0 && (
        <div
          className={`grid grid-flow-col gap-2 ${showDocScroll ? 'overflow-x-auto pb-2' : ''} -mx-1 px-1 no-scrollbar md:custom-scrollbar w-fit max-w-full`}
          style={{
            // Limit to 4 rows max, or fewer if not enough files to fill 4 rows
            gridTemplateRows: `repeat(${Math.min(documentFiles.length, 4)}, min-content)`,
          }}
        >
          {documentFiles.map((file) => (
            <div key={file.id} className="min-w-0 w-full max-w-full sm:max-w-md">
              <FileDisplay
                file={file}
                onFileClick={onImageClick}
                isFromMessageList={true}
                onConfigure={onConfigureFile ? () => onConfigureFile(file, messageId) : undefined}
                isGemini3={isGemini3}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
