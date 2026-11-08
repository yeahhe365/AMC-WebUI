import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Loader2, Sparkles, Subtitles } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { logService } from '@/services/logService';
import { toastError, toastSuccess } from '@/stores/toastStore';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/api/apiKeySelection';
import { DEFAULT_THOUGHT_TRANSLATION_MODEL_ID } from '@/constants/modelConfiguration';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { getErrorMessage } from '@/utils/errorMessage';
import { extractAudioFromVideo } from '@/utils/video-subtitles/extractAudioFromVideo';
import { transcribeAudioWithGemini } from '@/utils/video-subtitles/geminiTranscribeService';
import {
  type SubtitleCue,
  type SubtitleDisplayMode,
  groupWordsIntoCues,
  generateVttContent,
  generateSrtContent,
} from '@/utils/video-subtitles/subtitleFormatter';
import { translateSubtitlesWithGemini } from '@/utils/video-subtitles/geminiSubtitleTranslateService';
import { getCachedSubtitles, saveCachedSubtitles } from '@/utils/video-subtitles/subtitleCacheService';
import type { VideoPlayerHandle } from '@/components/shared/file-preview/VideoPlayer';
import type { AudioPreviewViewerRef } from '@/components/shared/file-preview/AudioPreviewViewer';
import type { AppSettings, UploadedFile } from '@/types';

export type SubtitlePhase = 'idle' | 'extracting' | 'uploading' | 'transcribing' | 'ready' | 'error';

export interface UseFileSubtitlesOptions {
  file: UploadedFile;
  previewFile: UploadedFile;
  isMedia: boolean;
  isVideo: boolean;
  isAudio: boolean;
  videoPlayerRef: RefObject<VideoPlayerHandle>;
  audioViewerRef: RefObject<AudioPreviewViewerRef>;
  appSettings: AppSettings;
}

export const useFileSubtitles = ({
  file,
  previewFile,
  isMedia,
  isVideo,
  isAudio,
  videoPlayerRef,
  audioViewerRef,
  appSettings,
}: UseFileSubtitlesOptions) => {
  const { t } = useI18n();

  const [subtitlePhase, setSubtitlePhase] = useState<SubtitlePhase>('idle');
  const [subtitleProgressPercent, setSubtitleProgressPercent] = useState<number | undefined>(undefined);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleVttBlobUrl, setSubtitleVttBlobUrl] = useState<string | null>(null);
  const [isSubtitlesDrawerOpen, setIsSubtitlesDrawerOpen] = useState(false);
  const [mediaCurrentTime, setMediaCurrentTime] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);
  const [subtitleDisplayMode, setSubtitleDisplayMode] = useState<SubtitleDisplayMode>('bilingual');
  const [isTranslatingSubtitles, setIsTranslatingSubtitles] = useState(false);

  const subtitleAbortControllerRef = useRef<AbortController | null>(null);
  const currentFileKeyRef = useRef<string | null>(null);
  const subtitlePhaseRef = useRef(subtitlePhase);
  const subtitleDisplayModeRef = useRef(subtitleDisplayMode);

  useEffect(() => {
    subtitlePhaseRef.current = subtitlePhase;
  }, [subtitlePhase]);

  useEffect(() => {
    subtitleDisplayModeRef.current = subtitleDisplayMode;
  }, [subtitleDisplayMode]);

  const handleSeekMedia = useCallback(
    (seconds: number) => {
      if (isVideo) {
        videoPlayerRef.current?.seekTo(seconds);
      } else if (isAudio) {
        audioViewerRef.current?.seekTo(seconds);
      }
    },
    [isVideo, isAudio, videoPlayerRef, audioViewerRef],
  );

  const updateVttBlobUrl = useCallback((cues: SubtitleCue[], mode: SubtitleDisplayMode) => {
    if (!cues || cues.length === 0) return;
    const vttContent = generateVttContent(cues, { mode });
    const vttBlob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
    const vttUrl = URL.createObjectURL(vttBlob);
    setSubtitleVttBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return vttUrl;
    });
  }, []);

  const handleDisplayModeChange = useCallback(
    (mode: SubtitleDisplayMode) => {
      setSubtitleDisplayMode(mode);
      updateVttBlobUrl(subtitleCues, mode);
    },
    [subtitleCues, updateVttBlobUrl],
  );

  useEffect(() => {
    let isMounted = true;
    const fileKey = file ? `${file.id || file.name}:${file.size ?? 0}` : null;

    // Reset subtitle states only when switching to a different file
    if (currentFileKeyRef.current !== fileKey) {
      currentFileKeyRef.current = fileKey;
      setSubtitleCues([]);
      setSubtitlePhase('idle');
      setIsFromCache(false);
      setIsSubtitlesDrawerOpen(false);
      setMediaCurrentTime(0);
      setSubtitleVttBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }

    if (!isMedia || !file) return;

    const loadCached = () => {
      getCachedSubtitles(file).then((cached) => {
        if (!isMounted) return;
        if (!cached) {
          if (subtitlePhaseRef.current === 'idle') {
            setSubtitleCues([]);
            setIsFromCache(false);
            setIsSubtitlesDrawerOpen(false);
            setSubtitleVttBlobUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          }
          return;
        }
        setSubtitleCues(cached.cues);
        const hasTranslation = cached.cues.some((cue) => Boolean(cue.translation));
        const targetMode = hasTranslation ? subtitleDisplayModeRef.current : 'original';
        const vttContent = generateVttContent(cached.cues, { mode: targetMode });
        const vttBlob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
        const vttUrl = URL.createObjectURL(vttBlob);
        setSubtitleVttBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return vttUrl;
        });
        setSubtitlePhase('ready');
        setIsFromCache(true);
      });
    };

    loadCached();

    const handleCacheUpdated = () => {
      loadCached();
    };

    window.addEventListener('subtitles-cache-updated', handleCacheUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('subtitles-cache-updated', handleCacheUpdated);
    };
  }, [file, isMedia]);

  useEffect(() => {
    return () => {
      subtitleAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (subtitleVttBlobUrl) {
        URL.revokeObjectURL(subtitleVttBlobUrl);
      }
    };
  }, [subtitleVttBlobUrl]);

  const handleExtractSubtitles = useCallback(async () => {
    if (subtitlePhase === 'extracting' || subtitlePhase === 'uploading' || subtitlePhase === 'transcribing') {
      return;
    }

    let apiKey: string | null = null;
    const keyResult = getGeminiKeyForRequest(
      appSettings,
      { ...DEFAULT_CHAT_SETTINGS, modelId: 'gemini-3.5-transcribe' },
      { skipIncrement: true },
    );

    if (!('error' in keyResult)) {
      apiKey = keyResult.key;
    } else if (appSettings?.apiKey) {
      apiKey = appSettings.apiKey;
    }

    if (!apiKey) {
      toastError(formatApiKeyErrorMessage('error' in keyResult ? keyResult.error : 'API Key not configured.', t));
      return;
    }

    let videoBlob: Blob | null = null;
    if (file.rawFile instanceof Blob) {
      videoBlob = file.rawFile;
    } else if (previewFile.dataUrl) {
      try {
        const resp = await fetch(previewFile.dataUrl);
        videoBlob = await resp.blob();
      } catch {
        // Fallback below
      }
    }

    if (!videoBlob) {
      toastError(t('noAudioTrackDetected'));
      return;
    }

    const abortController = new AbortController();
    subtitleAbortControllerRef.current = abortController;

    try {
      setSubtitlePhase('extracting');
      setSubtitleProgressPercent(undefined);
      setIsFromCache(false);

      // 1. Extract audio pure client-side via Web Audio API
      const { audioBlob, durationSeconds } = await extractAudioFromVideo(videoBlob, abortController.signal);

      // 2. Transcribe with gemini-3.5-transcribe
      const annotations = await transcribeAudioWithGemini(
        apiKey,
        audioBlob,
        `${file.name.replace(/\.[^/.]+$/, '')}-audio.wav`,
        abortController.signal,
        (phase, percent) => {
          setSubtitlePhase(phase);
          setSubtitleProgressPercent(percent);
        },
        durationSeconds,
      );

      // 3. Group words into cues and generate VTT Blob URL
      const cues = groupWordsIntoCues(annotations);
      if (cues.length === 0) {
        setSubtitlePhase('idle');
        toastError(t('noSpeechDetected'));
        return;
      }

      setSubtitleCues(cues);

      const vttContent = generateVttContent(cues);
      const srtContent = generateSrtContent(cues);
      const vttBlob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
      const vttUrl = URL.createObjectURL(vttBlob);

      if (subtitleVttBlobUrl) {
        URL.revokeObjectURL(subtitleVttBlobUrl);
      }
      setSubtitleVttBlobUrl(vttUrl);
      setSubtitlePhase('ready');
      setIsFromCache(false);
      setIsSubtitlesDrawerOpen(true);
      toastSuccess(t('subtitlesReady'));

      void saveCachedSubtitles(file, {
        cues,
        srtContent,
        vttContent,
        durationSeconds,
      });
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setSubtitlePhase('idle');
        return;
      }
      const errMsg = getErrorMessage(err);
      logService.error('[FilePreviewModal] Subtitle extraction failed:', err);
      setSubtitlePhase('error');
      toastError(errMsg);
    }
  }, [appSettings, file, previewFile, subtitlePhase, subtitleVttBlobUrl, t]);

  const handleTranslateSubtitles = useCallback(async () => {
    if (isTranslatingSubtitles || subtitleCues.length === 0) return;

    let apiKey: string | null = null;
    const keyResult = getGeminiKeyForRequest(
      appSettings,
      { ...DEFAULT_CHAT_SETTINGS, modelId: DEFAULT_THOUGHT_TRANSLATION_MODEL_ID },
      { skipIncrement: true },
    );
    if (!('error' in keyResult)) {
      apiKey = keyResult.key;
    } else if (appSettings?.apiKey) {
      apiKey = appSettings.apiKey;
    }

    if (!apiKey) {
      toastError(formatApiKeyErrorMessage('error' in keyResult ? keyResult.error : 'API Key not configured.', t));
      return;
    }

    setIsTranslatingSubtitles(true);
    try {
      const translationModelId =
        appSettings?.inputTranslationModelId ||
        appSettings?.thoughtTranslationModelId ||
        DEFAULT_THOUGHT_TRANSLATION_MODEL_ID;

      const translatedCues = await translateSubtitlesWithGemini(apiKey, subtitleCues, {
        targetLanguage: 'Chinese',
        modelId: translationModelId,
      });
      setSubtitleCues(translatedCues);
      setSubtitleDisplayMode('bilingual');
      updateVttBlobUrl(translatedCues, 'bilingual');

      const srtContent = generateSrtContent(translatedCues);
      const vttContent = generateVttContent(translatedCues);
      const bilingualVttContent = generateVttContent(translatedCues, { mode: 'bilingual' });
      const translatedVttContent = generateVttContent(translatedCues, { mode: 'translation' });

      await saveCachedSubtitles(file, {
        cues: translatedCues,
        srtContent,
        vttContent,
        bilingualVttContent,
        translatedVttContent,
        targetLanguage: 'Chinese',
      });
      toastSuccess(t('subtitlesReady'));
    } catch (err: unknown) {
      logService.error('[FilePreviewModal] Subtitle translation failed:', err);
      toastError(getErrorMessage(err) || t('translateFailed'));
    } finally {
      setIsTranslatingSubtitles(false);
    }
  }, [isTranslatingSubtitles, subtitleCues, appSettings, t, file, updateVttBlobUrl]);

  const subtitleActions = useMemo(() => {
    if (!isMedia) return null;

    if (subtitlePhase === 'extracting' || subtitlePhase === 'uploading' || subtitlePhase === 'transcribing') {
      const label =
        subtitlePhase === 'extracting'
          ? t('extractingAudio')
          : subtitlePhase === 'uploading'
            ? t('uploadingAudio').replace('{percent}', String(subtitleProgressPercent ?? 0))
            : t('transcribingSubtitles');

      return (
        <div
          data-testid="subtitles-progress-badge"
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-sky-500/15 text-sky-200 border border-sky-500/30"
        >
          <Loader2 size={13} className="animate-spin text-sky-300 flex-shrink-0" />
          <span className="truncate max-w-[200px]">{label}</span>
        </div>
      );
    }

    if (subtitlePhase === 'ready') {
      const titleText = isFromCache ? `${t('videoSubtitles')} (${t('loadedFromCache')})` : t('videoSubtitles');
      return (
        <button
          type="button"
          onClick={() => setIsSubtitlesDrawerOpen((prev) => !prev)}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
            isSubtitlesDrawerOpen ? 'bg-sky-600 text-white shadow-sm' : 'bg-white/10 hover:bg-white/20 text-white/90'
          }`}
          data-testid="toggle-subtitles-drawer-btn"
          title={titleText}
        >
          <Subtitles size={13} />
          <span>{t('videoSubtitles')}</span>
          <span className="text-[10px] font-mono px-1 rounded-full bg-black/20">{subtitleCues.length}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleExtractSubtitles}
        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 hover:text-white border border-sky-500/40 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
        data-testid="extract-subtitles-btn"
        title={t('extractSubtitles')}
      >
        <Sparkles size={13} className="text-sky-300" />
        <span>{t('extractSubtitles')}</span>
      </button>
    );
  }, [
    handleExtractSubtitles,
    isFromCache,
    isMedia,
    isSubtitlesDrawerOpen,
    subtitleCues.length,
    subtitlePhase,
    subtitleProgressPercent,
    t,
  ]);

  return {
    subtitlePhase,
    subtitleProgressPercent,
    subtitleCues,
    subtitleVttBlobUrl,
    isSubtitlesDrawerOpen,
    setIsSubtitlesDrawerOpen,
    mediaCurrentTime,
    setMediaCurrentTime,
    isFromCache,
    subtitleDisplayMode,
    isTranslatingSubtitles,
    handleSeekMedia,
    handleDisplayModeChange,
    handleExtractSubtitles,
    handleTranslateSubtitles,
    subtitleActions,
  };
};
