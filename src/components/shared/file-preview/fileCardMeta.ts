import type { ElementType } from 'react';
import { Edit3, Scissors, Settings2, SlidersHorizontal } from 'lucide-react';
import type { UploadedFile } from '@/types';
import { resolveFileCategory } from '@/utils/file/fileTypeClassification';

interface FileCardMetaOptions {
  isGemini3?: boolean;
  includeTextEditing?: boolean;
  requireActiveForConfigure?: boolean;
  canConfigure: boolean;
}

interface FileCardMeta {
  category: ReturnType<typeof resolveFileCategory>;
  isActive: boolean;
  isVideo: boolean;
  isImage: boolean;
  isPdf: boolean;
  isText: boolean;
  canConfigure: boolean;
  ConfigIcon: ElementType;
}

export const getFileCardMeta = (
  file: UploadedFile,
  {
    isGemini3 = false,
    includeTextEditing = false,
    requireActiveForConfigure = false,
    canConfigure,
  }: FileCardMetaOptions,
): FileCardMeta => {
  const category = resolveFileCategory(file);
  const isActive = file.uploadState === 'active';
  const isVideo = category === 'video' || category === 'youtube';
  const isImage = category === 'image';
  const isPdf = category === 'pdf';
  const isText = category === 'text' || category === 'code';

  const supportsConfiguration = isVideo || (isGemini3 && (isImage || isPdf)) || (includeTextEditing && isText);

  const isConfigurable =
    canConfigure && !file.error && (!requireActiveForConfigure || isActive) && supportsConfiguration;

  const ConfigIcon =
    includeTextEditing && isText ? Edit3 : isGemini3 ? SlidersHorizontal : isVideo ? Scissors : Settings2;

  return {
    category,
    isActive,
    isVideo,
    isImage,
    isPdf,
    isText,
    canConfigure: isConfigurable,
    ConfigIcon,
  };
};
