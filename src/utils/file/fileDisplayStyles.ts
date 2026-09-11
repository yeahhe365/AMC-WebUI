import type { ElementType } from 'react';
import {
  AlertTriangle,
  FileArchive,
  FileAudio,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ImageIcon,
  Presentation,
  Youtube,
} from 'lucide-react';
import { PdfFileIcon, DocFileIcon } from '@/components/icons/FileFormatIcons';
import { MediaResolution } from '@/types';
import { resolveFileCategory, type FileCategory } from './fileTypeClassification';

export const CATEGORY_STYLES: Record<FileCategory, { Icon: ElementType; colorClass: string; bgClass: string }> = {
  image: {
    Icon: ImageIcon,
    colorClass: 'text-blue-500 dark:text-blue-400',
    bgClass: 'bg-blue-500/10 dark:bg-blue-400/10',
  },
  audio: {
    Icon: FileAudio,
    colorClass: 'text-purple-500 dark:text-purple-400',
    bgClass: 'bg-purple-500/10 dark:bg-purple-400/10',
  },
  video: {
    Icon: FileVideo,
    colorClass: 'text-pink-500 dark:text-pink-400',
    bgClass: 'bg-pink-500/10 dark:bg-pink-400/10',
  },
  youtube: { Icon: Youtube, colorClass: 'text-red-600 dark:text-red-500', bgClass: 'bg-red-600/10 dark:bg-red-500/10' },
  pdf: { Icon: PdfFileIcon, colorClass: 'text-red-500 dark:text-red-400', bgClass: 'bg-red-500/10 dark:bg-red-400/10' },
  doc: {
    Icon: DocFileIcon,
    colorClass: 'text-blue-600 dark:text-blue-500',
    bgClass: 'bg-blue-600/10 dark:bg-blue-500/10',
  },
  presentation: {
    Icon: Presentation,
    colorClass: 'text-orange-600 dark:text-orange-500',
    bgClass: 'bg-orange-600/10 dark:bg-orange-500/10',
  },
  spreadsheet: {
    Icon: FileSpreadsheet,
    colorClass: 'text-emerald-600 dark:text-emerald-500',
    bgClass: 'bg-emerald-600/10 dark:bg-emerald-500/10',
  },
  archive: {
    Icon: FileArchive,
    colorClass: 'text-amber-500 dark:text-amber-400',
    bgClass: 'bg-amber-500/10 dark:bg-amber-400/10',
  },
  code: {
    Icon: FileCode2,
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    bgClass: 'bg-cyan-500/10 dark:bg-cyan-400/10',
  },
  text: {
    Icon: FileText,
    colorClass: 'text-slate-500 dark:text-slate-400',
    bgClass: 'bg-slate-500/10 dark:bg-slate-400/10',
  },
  error: {
    Icon: AlertTriangle,
    colorClass: 'text-[var(--theme-text-danger)]',
    bgClass: 'bg-[var(--theme-bg-danger)]/10',
  },
};

export const getFileDisplayMeta = (file: { name?: string; type?: string; error?: string | null }) => {
  const category = resolveFileCategory(file);
  const styles = CATEGORY_STYLES[category] || CATEGORY_STYLES.text;
  return {
    category,
    ...styles,
  };
};

export const getResolutionColor = (resolution?: MediaResolution): string => {
  switch (resolution) {
    case MediaResolution.MEDIA_RESOLUTION_LOW:
      return 'text-emerald-400 hover:text-emerald-300';
    case MediaResolution.MEDIA_RESOLUTION_MEDIUM:
      return 'text-sky-400 hover:text-sky-300';
    case MediaResolution.MEDIA_RESOLUTION_HIGH:
      return 'text-violet-400 hover:text-violet-300';
    case MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH:
      return 'text-amber-400 hover:text-amber-300';
    default:
      return 'text-white/80 hover:text-white';
  }
};
