import { lazy, memo, Suspense, useState, type ElementType, type FC, type ReactNode } from 'react';
import type { UploadedFile } from '@/types';
import { useVisibleThumbnailGate } from '@/hooks/ui/useVisibleThumbnailGate';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/constants/fileTypeSupport';
import { resolveFileCategory } from '@/utils/file/fileTypeClassification';
import { FileCode2, Play } from 'lucide-react';
import { extractYoutubeVideoId } from '@/utils/file/youtubeUrl';
import { MaterialIcon } from '@/components/message/code/MaterialIcon';
import { MATERIAL_ICONS } from '@/components/message/code/materialIcons.generated';

const LazyPdfFileThumbnail = lazy(() =>
  import('./PdfFileThumbnail').then((module) => ({ default: module.PdfFileThumbnail })),
);

interface FileThumbnailProps {
  file: UploadedFile;
  Icon: ElementType;
  colorClass: string;
  bgClass: string;
}

const EXTENSION_TO_MATERIAL_ICON: Record<string, string> = {
  py: 'python',
  pyw: 'python',
  ts: 'typescript',
  tsx: 'react-ts',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'react',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'less',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'c-sharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'database',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  vue: 'vue',
  svelte: 'svelte',
  graphql: 'graphql',
  gql: 'graphql',
  md: 'markdown',
  markdown: 'markdown',
};

const PdfThumbnail = ({ file, fallback }: { file: UploadedFile; fallback: ReactNode }) => {
  const shouldLoadPreview = !!file.dataUrl;
  const { containerRef, isVisible } = useVisibleThumbnailGate(shouldLoadPreview);

  return (
    <div ref={containerRef} data-thumbnail-kind="pdf" className="h-full w-full overflow-hidden">
      {shouldLoadPreview && isVisible ? (
        <Suspense fallback={fallback}>
          <LazyPdfFileThumbnail file={file} fallback={fallback} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
};

const VideoThumbnail = memo(
  ({ file, fallback }: { file: UploadedFile; fallback: ReactNode }) => {
    if (!file.dataUrl) {
      return (
        <div data-thumbnail-kind="video" className="h-full w-full">
          {fallback}
        </div>
      );
    }

    return (
      <div data-thumbnail-kind="video" className="relative h-full w-full overflow-hidden bg-black">
        <video
          src={`${file.dataUrl}#t=0.1`}
          className="h-full w-full object-cover pointer-events-none"
          muted
          playsInline
          preload="metadata"
          aria-label={file.name}
        />
      </div>
    );
  },
  (prev, next) => prev.file.id === next.file.id && prev.file.dataUrl === next.file.dataUrl,
);

const YoutubeThumbnail = memo(
  ({ file, fallback }: { file: UploadedFile; fallback: ReactNode }) => {
    const videoId = extractYoutubeVideoId(file.fileUri || file.name);
    const [hasError, setHasError] = useState(false);

    if (!videoId || hasError) {
      return <>{fallback}</>;
    }

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

    return (
      <div
        data-thumbnail-kind="youtube"
        className="relative h-full w-full overflow-hidden bg-black flex items-center justify-center"
      >
        <img
          src={thumbnailUrl}
          alt={file.name}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/15">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white shadow-md transition-transform group-hover:scale-110 duration-200">
            <Play size={10} fill="currentColor" className="ml-0.5" />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.file.id === next.file.id &&
    prev.file.fileUri === next.file.fileUri &&
    prev.file.name === next.file.name &&
    prev.file.error === next.file.error,
);

const CoverThumbnail = ({
  file,
  Icon: defaultIcon,
  colorClass: defaultColorClass,
  bgClass: defaultBgClass,
}: FileThumbnailProps) => {
  const category = resolveFileCategory(file);
  const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
  const materialIconName = ext ? EXTENSION_TO_MATERIAL_ICON[ext] : undefined;
  const hasMaterialIcon = Boolean(materialIconName && MATERIAL_ICONS[materialIconName]);

  let Icon = defaultIcon;
  let colorClass = defaultColorClass;
  let bgClass = defaultBgClass;

  if (category === 'code') {
    Icon = FileCode2;
    colorClass = 'text-cyan-600 dark:text-cyan-400';
    bgClass = 'bg-[var(--theme-bg-code-block)]';
  }

  return (
    <div
      data-thumbnail-kind={category}
      className={`relative h-full w-full overflow-hidden ${bgClass} flex items-center justify-center transition-transform group-hover:scale-105 duration-200`}
    >
      {hasMaterialIcon && materialIconName ? (
        <MaterialIcon name={materialIconName} size={26} />
      ) : (
        <Icon size={24} className={colorClass} strokeWidth={1.75} />
      )}
    </div>
  );
};

const FileThumbnailComponent: FC<FileThumbnailProps> = (props) => {
  const { file } = props;
  const category = resolveFileCategory(file);
  const fallback = <CoverThumbnail {...props} />;

  if (file.dataUrl && SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
    return (
      <img
        data-thumbnail-kind="image"
        src={file.dataUrl}
        alt={file.name}
        className="h-full w-full rounded-lg object-cover shadow-sm"
      />
    );
  }

  if (category === 'pdf') {
    return <PdfThumbnail file={file} fallback={fallback} />;
  }

  if (category === 'video') {
    return <VideoThumbnail file={file} fallback={fallback} />;
  }

  if (category === 'youtube') {
    return <YoutubeThumbnail file={file} fallback={fallback} />;
  }

  return fallback;
};

export const FileThumbnail: FC<FileThumbnailProps> = memo(
  FileThumbnailComponent,
  (prev, next) =>
    prev.file.id === next.file.id &&
    prev.file.dataUrl === next.file.dataUrl &&
    prev.file.fileUri === next.file.fileUri &&
    prev.file.name === next.file.name &&
    prev.file.type === next.file.type &&
    prev.file.error === next.file.error &&
    prev.Icon === next.Icon &&
    prev.colorClass === next.colorClass &&
    prev.bgClass === next.bgClass,
);
