import { lazy, memo, Suspense, useEffect, useRef, useState, type ElementType, type FC, type ReactNode } from 'react';
import type { UploadedFile } from '@/types';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/constants/fileTypeSupport';
import { getFileTypeCategory } from '@/utils/file/fileTypeClassification';
import { FileCode } from 'lucide-react';

const LazyPdfFileThumbnail = lazy(() =>
  import('./PdfFileThumbnail').then((module) => ({ default: module.PdfFileThumbnail })),
);

interface FileThumbnailProps {
  file: UploadedFile;
  Icon: ElementType;
  colorClass: string;
  bgClass: string;
}

const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'json',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
  'sh',
  'bash',
  'zsh',
  'yaml',
  'yml',
  'toml',
  'sql',
  'xml',
  'graphql',
  'vue',
  'svelte',
]);

const isCodeExtension = (filename: string): boolean => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? CODE_EXTENSIONS.has(extension) : false;
};

const getDisplayExtension = (file: UploadedFile) => {
  const extension = file.name.split('.').pop()?.trim();
  if (extension && extension !== file.name) {
    return extension.slice(0, 4).toUpperCase();
  }

  const mimeSuffix = file.type.split('/').pop()?.split(/[+;]/)[0];
  return (mimeSuffix || 'FILE').slice(0, 4).toUpperCase();
};

const useVisibleThumbnailGate = (enabled: boolean) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(() => !enabled || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (!enabled || isVisible) {
      return undefined;
    }

    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setIsVisible(true));
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, isVisible]);

  return { containerRef, isVisible };
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

const CoverThumbnail = ({
  file,
  Icon: defaultIcon,
  colorClass: defaultColorClass,
  bgClass: defaultBgClass,
}: FileThumbnailProps) => {
  const category = getFileTypeCategory(file.type, file.error);
  const extension = getDisplayExtension(file);

  let Icon = defaultIcon;
  let colorClass = defaultColorClass;
  let bgClass = defaultBgClass;

  if (category === 'text' && isCodeExtension(file.name)) {
    Icon = FileCode;
    colorClass = 'text-cyan-600 dark:text-cyan-400';
    bgClass = 'bg-[var(--theme-bg-code-block)]';
  }

  return (
    <div
      data-thumbnail-kind={category}
      className={`relative h-full w-full overflow-hidden ${bgClass} p-2 flex flex-col items-center justify-center gap-1`}
    >
      <div className="rounded-lg bg-[var(--theme-bg-primary)]/90 p-1.5 shadow-sm border border-[var(--theme-border-secondary)]/50">
        <Icon size={19} className={colorClass} strokeWidth={1.6} />
      </div>
      <span className="max-w-full truncate rounded bg-[var(--theme-bg-primary)]/90 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-[var(--theme-text-secondary)] shadow-xs border border-[var(--theme-border-secondary)]/40">
        {extension}
      </span>
    </div>
  );
};

const FileThumbnailComponent: FC<FileThumbnailProps> = (props) => {
  const { file } = props;
  const category = getFileTypeCategory(file.type, file.error);
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

  return fallback;
};

export const FileThumbnail: FC<FileThumbnailProps> = memo(
  FileThumbnailComponent,
  (prev, next) =>
    prev.file.id === next.file.id &&
    prev.file.dataUrl === next.file.dataUrl &&
    prev.file.type === next.file.type &&
    prev.file.error === next.file.error &&
    prev.Icon === next.Icon &&
    prev.colorClass === next.colorClass &&
    prev.bgClass === next.bgClass,
);
