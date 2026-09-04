import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { type AppSettings, type UploadedFile } from '@/types';
import { logService } from '@/services/logService';
import { generateUniqueId } from '@/utils/chat/ids';
import { isAudioMimeType } from '@/utils/file/fileTypeClassification';
import { compressAudioToMp3 } from '@/features/audio/audioCompression';
import { extractDocxText, isDocxFile } from '@/utils/docxPreview';
import { useI18n } from '@/contexts/I18nContext';
import { createProcessingPlaceholderFile } from '@/utils/file-upload/fileUploadPolicy';
import { interpolate } from '@/i18n/interpolate';

interface UseFilePreProcessingProps {
  appSettings: AppSettings;
  setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
}

export const useFilePreProcessing = ({ appSettings, setSelectedFiles }: UseFilePreProcessingProps) => {
  const { t } = useI18n();
  const processFiles = useCallback(
    async (
      files: FileList | File[],
      options: { setSelectedFiles?: Dispatch<SetStateAction<UploadedFile[]>> } = {},
    ): Promise<File[]> => {
      const rawFilesArray = Array.isArray(files) ? files : Array.from(files);
      const processedFiles: File[] = [];
      const writeSelectedFiles = options.setSelectedFiles ?? setSelectedFiles;

      for (const file of rawFilesArray) {
        const fileNameLower = file.name.toLowerCase();
        const mimeTypeLower = file.type.toLowerCase();

        const isAudio =
          !mimeTypeLower.startsWith('video/') &&
          (isAudioMimeType(file.type) ||
            ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.wma', '.aiff'].some((extension) =>
              fileNameLower.endsWith(extension),
            ));

        if (fileNameLower.endsWith('.zip')) {
          const tempId = generateUniqueId();
          writeSelectedFiles((prev) => [
            ...prev,
            createProcessingPlaceholderFile({
              id: tempId,
              name: interpolate(t('fileProcessingZip'), { filename: file.name }),
              type: 'application/zip',
              size: file.size,
            }),
          ]);

          try {
            logService.info(`Auto-converting ZIP file: ${file.name}`);
            const { generateZipContext } = await import('@/utils/import-context/loaders');
            const contextFile = await generateZipContext(file);
            processedFiles.push(contextFile);
          } catch (error) {
            logService.error(`Failed to auto-convert zip file ${file.name}`, { error });
            processedFiles.push(file);
          } finally {
            writeSelectedFiles((prev) => prev.filter((selectedFile) => selectedFile.id !== tempId));
          }
        } else if (isDocxFile(file)) {
          const tempId = generateUniqueId();
          writeSelectedFiles((prev) => [
            ...prev,
            createProcessingPlaceholderFile({
              id: tempId,
              name: interpolate(t('fileProcessingDocx'), { filename: file.name }),
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: file.size,
            }),
          ]);

          try {
            logService.info(`Extracting text from Word file via Worker: ${file.name}`);
            const { text: textContent, messages } = await extractDocxText(file);

            if (messages.length > 0) {
              logService.warn('Mammoth extraction warnings:', { messages });
            }

            const newFileName = file.name.replace(/\.docx$/i, '.txt');
            const textFile = new File([textContent], newFileName, { type: 'text/plain' });

            processedFiles.push(textFile);
          } catch (error) {
            logService.error(`Failed to extract text from docx ${file.name}`, { error });
            processedFiles.push(file);
          } finally {
            writeSelectedFiles((prev) => prev.filter((selectedFile) => selectedFile.id !== tempId));
          }
        } else if (isAudio) {
          if (appSettings.isAudioCompressionEnabled) {
            const tempId = generateUniqueId();
            const abortController = new AbortController();

            writeSelectedFiles((prev) => [
              ...prev,
              createProcessingPlaceholderFile({
                id: tempId,
                name: interpolate(t('fileProcessingAudio'), { filename: file.name }),
                type: file.type || 'audio/mpeg',
                size: file.size,
                abortController,
              }),
            ]);

            try {
              logService.info(`Compressing audio file: ${file.name}`);
              const compressedFile = await compressAudioToMp3(file, abortController.signal);
              processedFiles.push(compressedFile);
            } catch (error) {
              const isAbort = (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
              if (isAbort) {
                logService.info(`Compression cancelled for ${file.name}`);
              } else {
                logService.error(`Failed to compress audio file ${file.name}`, { error });
                processedFiles.push(file);
              }
            } finally {
              writeSelectedFiles((prev) => prev.filter((selectedFile) => selectedFile.id !== tempId));
            }
          } else {
            processedFiles.push(file);
          }
        } else {
          processedFiles.push(file);
        }
      }

      return processedFiles;
    },
    [appSettings.isAudioCompressionEnabled, setSelectedFiles, t],
  );

  return { processFiles };
};
