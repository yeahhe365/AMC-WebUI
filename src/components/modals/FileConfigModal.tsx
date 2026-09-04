import React, { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { MediaResolution, type UploadedFile, type VideoMetadata } from '@/types';
import { FileConfigHeader } from './file-config/FileConfigHeader';
import { ResolutionConfig } from './file-config/ResolutionConfig';
import { VideoConfig } from './file-config/VideoConfig';
import { FileConfigFooter } from './file-config/FileConfigFooter';
import { getFileKindFlags } from '@/utils/file/fileTypeClassification';
import { interpolate } from '@/i18n/interpolate';
import { useI18n } from '@/contexts/I18nContext';

interface FileConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: UploadedFile | null;
  onSave: (fileId: string, updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution }) => void;
  isGemini3: boolean;
  /** Global input detail level; labels the "follow global" option in the per-file select. */
  globalMediaResolution?: MediaResolution;
}

interface FileConfigurationDraft {
  startOffset: string;
  endOffset: string;
  fps: string;
  mediaResolution: MediaResolution | '';
}

const buildDraft = (file: UploadedFile): FileConfigurationDraft => ({
  startOffset: file.videoMetadata?.startOffset || '',
  endOffset: file.videoMetadata?.endOffset || '',
  fps: file.videoMetadata?.fps ? String(file.videoMetadata.fps) : '',
  mediaResolution: file.mediaResolution || '',
});

const SECONDS_DURATION_PATTERN = /^\d+(?:\.\d{1,9})?s$/;
const SECONDS_INPUT_PATTERN = /^\d+(?:\.\d{1,9})?$/;
const TIMESTAMP_SECONDS_PATTERN = /^(\d+)(\.\d{1,9})?$/;

const normalizeTimestampOffset = (value: string): string | undefined => {
  const segments = value.split(':');
  if (segments.length !== 2 && segments.length !== 3) {
    return undefined;
  }

  const secondsMatch = segments[segments.length - 1].match(TIMESTAMP_SECONDS_PATTERN);
  if (!secondsMatch) {
    return undefined;
  }

  const leadingSegments = segments.slice(0, -1);
  if (!leadingSegments.every((segment) => /^\d+$/.test(segment))) {
    return undefined;
  }

  const boundedSegments = segments.length === 3 ? leadingSegments.slice(1) : [];
  if (boundedSegments.some((segment) => Number(segment) >= 60)) {
    return undefined;
  }

  const secondsWhole = Number(secondsMatch[1]);
  if (secondsWhole >= 60) {
    return undefined;
  }

  const hours = segments.length === 3 ? Number(segments[0]) : 0;
  const minutes = Number(segments[segments.length - 2]);
  const wholeSeconds = hours * 3600 + minutes * 60 + secondsWhole;

  return `${wholeSeconds}${secondsMatch[2] || ''}s`;
};

const normalizeDurationOffset = (value: string): string | undefined => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;
  if (SECONDS_DURATION_PATTERN.test(trimmedValue)) return trimmedValue;
  if (SECONDS_INPUT_PATTERN.test(trimmedValue)) return `${trimmedValue}s`;
  return normalizeTimestampOffset(trimmedValue);
};

const parseDurationSeconds = (value: string): number | null => {
  const normalized = normalizeDurationOffset(value);
  if (!normalized) return null;
  const seconds = Number(normalized.slice(0, -1));
  return Number.isFinite(seconds) ? seconds : null;
};

const normalizeVideoFps = (value: string): number | undefined => {
  const fps = Number(value.trim());
  return Number.isFinite(fps) && fps > 0 && fps <= 24 ? fps : undefined;
};

// Per-unit token cost of each detail level (Gemini 3 models), used for the
// inline estimate. Source: https://ai.google.dev/gemini-api/docs/media-resolution
const RESOLUTION_TOKEN_ESTIMATES: Record<'image' | 'video' | 'pdf', Partial<Record<MediaResolution, number>>> = {
  image: {
    [MediaResolution.MEDIA_RESOLUTION_LOW]: 280,
    [MediaResolution.MEDIA_RESOLUTION_MEDIUM]: 560,
    [MediaResolution.MEDIA_RESOLUTION_HIGH]: 1120,
    [MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH]: 2240,
  },
  video: {
    [MediaResolution.MEDIA_RESOLUTION_LOW]: 70,
    [MediaResolution.MEDIA_RESOLUTION_MEDIUM]: 70,
    [MediaResolution.MEDIA_RESOLUTION_HIGH]: 280,
  },
  pdf: {
    [MediaResolution.MEDIA_RESOLUTION_LOW]: 280,
    [MediaResolution.MEDIA_RESOLUTION_MEDIUM]: 560,
    [MediaResolution.MEDIA_RESOLUTION_HIGH]: 1120,
  },
};

type FileConfigModalContentProps = Omit<FileConfigModalProps, 'file'> & {
  file: UploadedFile;
};

const FileConfigModalContent: React.FC<FileConfigModalContentProps> = ({
  isOpen,
  onClose,
  file,
  onSave,
  isGemini3,
  globalMediaResolution,
}) => {
  const [draft, setDraft] = useState<FileConfigurationDraft>(() => buildDraft(file));
  const { isVideo, isYoutube, isImage, isPdf } = getFileKindFlags(file);
  const supportsVideoConfiguration = isVideo || isYoutube;
  const { t } = useI18n();

  // Derived (not mirrored) validation so every keystroke re-evaluates without
  // extra state or effects.
  const startOffsetError =
    supportsVideoConfiguration && draft.startOffset.trim() && !normalizeDurationOffset(draft.startOffset)
      ? t('fileSettingsErrorOffset')
      : undefined;
  const endOffsetFormatError =
    supportsVideoConfiguration && draft.endOffset.trim() && !normalizeDurationOffset(draft.endOffset)
      ? t('fileSettingsErrorOffset')
      : undefined;
  const startSeconds = supportsVideoConfiguration ? parseDurationSeconds(draft.startOffset) : null;
  const endSeconds = supportsVideoConfiguration ? parseDurationSeconds(draft.endOffset) : null;
  const endOffsetError =
    endOffsetFormatError ??
    (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds
      ? t('fileSettingsErrorEndBeforeStart')
      : undefined);
  const fpsError =
    supportsVideoConfiguration && draft.fps.trim() && normalizeVideoFps(draft.fps) === undefined
      ? t('fileSettingsErrorFps')
      : undefined;
  const hasErrors = Boolean(startOffsetError || endOffsetError || fpsError);

  // Echo the canonical "Ns" form back into the field on blur so the user sees
  // what will actually be sent (e.g. "01:15" → "75s").
  const handleOffsetBlur = (field: 'startOffset' | 'endOffset', value: string) => {
    const normalized = normalizeDurationOffset(value);
    if (normalized && normalized !== value.trim()) {
      setDraft((prev) => ({ ...prev, [field]: normalized }));
    }
  };

  const handleFpsBlur = (value: string) => {
    const fps = normalizeVideoFps(value);
    if (fps !== undefined && String(fps) !== value.trim()) {
      setDraft((prev) => ({ ...prev, fps: String(fps) }));
    }
  };

  const handleSave = () => {
    if (hasErrors) return;

    const updates: { videoMetadata?: VideoMetadata; mediaResolution?: MediaResolution } = {};

    if (supportsVideoConfiguration) {
      const metadata: VideoMetadata = {};
      const normalizedStartOffset = normalizeDurationOffset(draft.startOffset);
      const normalizedEndOffset = normalizeDurationOffset(draft.endOffset);

      if (normalizedStartOffset) {
        metadata.startOffset = normalizedStartOffset;
      }

      if (normalizedEndOffset) {
        metadata.endOffset = normalizedEndOffset;
      }

      const normalizedFps = normalizeVideoFps(draft.fps);
      if (normalizedFps) {
        metadata.fps = normalizedFps;
      }

      if (Object.keys(metadata).length > 0) {
        updates.videoMetadata = metadata;
      } else if (file.videoMetadata) {
        updates.videoMetadata = undefined;
      }
    }

    if (isGemini3 && draft.mediaResolution) {
      updates.mediaResolution = draft.mediaResolution as MediaResolution;
    } else if (isGemini3 && file.mediaResolution && !draft.mediaResolution) {
      updates.mediaResolution = undefined;
    }

    onSave(file.id, updates);
    onClose();
  };

  const showResolutionSettings = isGemini3 && (isImage || supportsVideoConfiguration || isPdf);

  const estimateKind: 'image' | 'video' | 'pdf' | undefined = isImage
    ? 'image'
    : isPdf
      ? 'pdf'
      : supportsVideoConfiguration
        ? 'video'
        : undefined;
  const estimateCount =
    estimateKind && draft.mediaResolution ? RESOLUTION_TOKEN_ESTIMATES[estimateKind][draft.mediaResolution] : undefined;
  const tokenEstimate =
    estimateKind && estimateCount !== undefined
      ? interpolate(
          t(
            estimateKind === 'image'
              ? 'fileSettingsTokenPerImage'
              : estimateKind === 'pdf'
                ? 'fileSettingsTokenPerPage'
                : 'fileSettingsTokenPerFrame',
          ),
          { count: estimateCount },
        )
      : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="bg-[var(--theme-bg-primary)] rounded-xl shadow-2xl max-w-md w-full border border-[var(--theme-border-primary)]"
    >
      <FileConfigHeader
        onClose={onClose}
        showResolutionSettings={showResolutionSettings}
        isVideo={supportsVideoConfiguration}
        fileName={file.name}
      />

      <div className="p-6 space-y-6">
        {showResolutionSettings && (
          <ResolutionConfig
            mediaResolution={draft.mediaResolution}
            setMediaResolution={(value) => setDraft((prev) => ({ ...prev, mediaResolution: value }))}
            allowUltraHigh={isImage}
            globalMediaResolution={globalMediaResolution}
            tokenEstimate={tokenEstimate}
            kind={estimateKind}
          />
        )}

        {supportsVideoConfiguration && (
          <VideoConfig
            startOffset={draft.startOffset}
            setStartOffset={(value) => setDraft((prev) => ({ ...prev, startOffset: value }))}
            setStartOffsetBlur={(value) => handleOffsetBlur('startOffset', value)}
            startOffsetError={startOffsetError}
            endOffset={draft.endOffset}
            setEndOffset={(value) => setDraft((prev) => ({ ...prev, endOffset: value }))}
            setEndOffsetBlur={(value) => handleOffsetBlur('endOffset', value)}
            endOffsetError={endOffsetError}
            fps={draft.fps}
            setFps={(value) => setDraft((prev) => ({ ...prev, fps: value }))}
            setFpsBlur={handleFpsBlur}
            fpsError={fpsError}
          />
        )}

        <FileConfigFooter onClose={onClose} onSave={handleSave} disabled={hasErrors} />
      </div>
    </Modal>
  );
};

export const FileConfigModal: React.FC<FileConfigModalProps> = (props) => {
  const { file, isOpen } = props;

  if (!file) return null;

  return <FileConfigModalContent key={`${file.id}:${isOpen ? 'open' : 'closed'}`} {...props} file={file} />;
};
