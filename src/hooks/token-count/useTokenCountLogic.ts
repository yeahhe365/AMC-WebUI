import { logService } from '@/services/logService';
import { getErrorMessage } from '@/utils/errorMessage';
import { useState, useEffect, useCallback, useRef } from 'react';
import { type UploadedFile, type AppSettings, type ChatProviderId, MediaResolution } from '@/types';
import { buildContentParts } from '@/utils/chat/builder';
import { isServerCodeExecutionMode } from '@/utils/codeExecution';
import { generateUniqueId } from '@/utils/chat/ids';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { cleanupFilePreviewUrl, cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import { countTokensApi } from '@/services/api/generation/tokenApi';
import { estimateVideoTokensForFiles } from '@/utils/tokenEstimation';
import {
  appendFunctionDeclarationsToTools,
  buildGenerationConfig,
  toCountTokensConfig,
} from '@/services/api/generationConfig';
import { createLocalPythonToolDeclaration } from '@/features/local-python/clientFunctionTool';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  formatApiKeyErrorMessage,
  getGeminiKeyForRequest,
  isServerManagedApiEnabledForProxyRequests,
  parseApiKeys,
  SERVER_MANAGED_API_KEY,
} from '@/utils/apiKeySelection';
import { useI18n } from '@/contexts/I18nContext';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

interface UseTokenCountLogicProps {
  isOpen: boolean;
  initialText: string;
  initialFiles: UploadedFile[];
  appSettings: AppSettings;
  currentModelId: string;
}

const mergeTokenCountAppSettings = (modalAppSettings: AppSettings, latestStoredSettings: AppSettings): AppSettings => ({
  ...latestStoredSettings,
  ...modalAppSettings,
  useCustomApiConfig: modalAppSettings.useCustomApiConfig ?? latestStoredSettings.useCustomApiConfig,
  serverManagedApi: modalAppSettings.serverManagedApi ?? latestStoredSettings.serverManagedApi,
  apiKey: modalAppSettings.apiKey ?? latestStoredSettings.apiKey,
  apiProxyUrl: modalAppSettings.apiProxyUrl ?? latestStoredSettings.apiProxyUrl,
  useApiProxy: modalAppSettings.useApiProxy ?? latestStoredSettings.useApiProxy,
  tokenCalculatorApiKey: modalAppSettings.tokenCalculatorApiKey ?? latestStoredSettings.tokenCalculatorApiKey,
});

const resolveTokenCountRequestKey = (
  effectiveAppSettings: AppSettings,
  modelId: string,
  dedicatedApiKey?: string | null,
): { key: string; isDirectGoogleApi?: boolean } | { error: string } => {
  const activeDedicated = dedicatedApiKey?.trim() || effectiveAppSettings.tokenCalculatorApiKey?.trim();
  if (activeDedicated) {
    const parsedDedicated = parseApiKeys(activeDedicated);
    if (parsedDedicated.length > 0) {
      return { key: parsedDedicated[0], isDirectGoogleApi: true };
    }
  }

  const parsedKeys = parseApiKeys(effectiveAppSettings.apiKey);

  if (effectiveAppSettings.useCustomApiConfig && parsedKeys.length > 0) {
    return { key: parsedKeys[0] };
  }

  if (isServerManagedApiEnabledForProxyRequests(effectiveAppSettings)) {
    return { key: SERVER_MANAGED_API_KEY };
  }

  const tempSettings = { ...effectiveAppSettings, modelId };
  const keyResult = getGeminiKeyForRequest(effectiveAppSettings, tempSettings, { skipIncrement: true });

  if ('error' in keyResult) {
    return { error: keyResult.error };
  }

  return { key: keyResult.key };
};

export const useTokenCountLogic = ({
  isOpen,
  initialText,
  initialFiles,
  appSettings,
  currentModelId,
}: UseTokenCountLogicProps) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(currentModelId);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [videoTokenEstimate, setVideoTokenEstimate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyConfigOpen, setIsApiKeyConfigOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestStoredSettings = useSettingsStore((state) => state.appSettings);
  const [dedicatedApiKey, setDedicatedApiKey] = useState(
    () => appSettings.tokenCalculatorApiKey ?? latestStoredSettings.tokenCalculatorApiKey ?? '',
  );

  const performCalculation = useCallback(
    async (txt: string, fls: UploadedFile[], modelId: string, customKeyOverride?: string | null) => {
      if (!txt.trim() && fls.length === 0) return;

      setIsLoading(true);
      setError(null);
      setTokenCount(null);

      const effectiveAppSettings = mergeTokenCountAppSettings(appSettings, latestStoredSettings);
      const activeDedicatedKey =
        customKeyOverride !== undefined
          ? customKeyOverride
          : dedicatedApiKey.trim() || effectiveAppSettings.tokenCalculatorApiKey;
      const keyResult = resolveTokenCountRequestKey(effectiveAppSettings, modelId, activeDedicatedKey);

      if ('error' in keyResult) {
        setError(formatApiKeyErrorMessage(keyResult.error, t));
        setIsLoading(false);
        return;
      }

      try {
        const preferCodeExecutionFileInputs = isServerCodeExecutionMode(effectiveAppSettings);
        const { contentParts } = await buildContentParts(
          txt,
          fls,
          modelId,
          effectiveAppSettings.mediaResolution,
          preferCodeExecutionFileInputs,
        );

        if (contentParts.length === 0) {
          setTokenCount(0);
          return;
        }

        const generationConfig = await buildGenerationConfig({
          settings: effectiveAppSettings,
          modelId,
          isLocalPythonEnabled: false,
        });

        const requestConfig = effectiveAppSettings.isLocalPythonEnabled
          ? appendFunctionDeclarationsToTools(modelId, generationConfig, [createLocalPythonToolDeclaration()])
          : generationConfig;

        const count = await countTokensApi(keyResult.key, modelId, contentParts, toCountTokensConfig(requestConfig), {
          directGoogleApi: keyResult.isDirectGoogleApi,
        });
        setTokenCount(count);
      } catch (tokenCountError) {
        logService.error('Token calculation failed', tokenCountError);
        const message = getErrorMessage(tokenCountError);
        setError(formatI18nErrorMessage(t, 'tokenCountErrorWithMessage', message));
      } finally {
        setIsLoading(false);
      }
    },
    [appSettings, dedicatedApiKey, latestStoredSettings, t],
  );

  // Local, instant estimate for the video portion only. Surfaced separately
  // from the server count so the UI can show something before the network
  // round-trip completes (and as a fallback if it fails).
  const recomputeVideoEstimate = useCallback(
    async (fls: UploadedFile[], modelId: string, resolution: MediaResolution | undefined) => {
      try {
        const effectiveResolution = resolution ?? MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED;
        const estimate = await estimateVideoTokensForFiles(fls, modelId, effectiveResolution);
        setVideoTokenEstimate(estimate > 0 ? estimate : null);
      } catch (error) {
        logService.error('Video token estimate failed', error);
        setVideoTokenEstimate(null);
      }
    },
    [],
  );

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setText(initialText);
      const shallowFiles = [...initialFiles];
      setFiles(shallowFiles);
      setSelectedModelId(currentModelId);
      setTokenCount(null);
      setError(null);

      if (initialText.trim() || shallowFiles.length > 0) {
        performCalculation(initialText, shallowFiles, currentModelId);
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialText, initialFiles, currentModelId, performCalculation]);

  // Recompute the local video estimate whenever files, model, or resolution
  // change. Cheap and instant, runs alongside the server countTokens call.
  useEffect(() => {
    if (!isOpen) return;
    recomputeVideoEstimate(files, selectedModelId, appSettings.mediaResolution);
  }, [isOpen, files, selectedModelId, appSettings.mediaResolution, recomputeVideoEstimate]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files).map((file) => ({
        id: generateUniqueId(),
        name: file.name,
        type: file.type,
        size: file.size,
        rawFile: file,
        dataUrl: createManagedObjectUrl(file),
        uploadState: 'active' as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
      setTokenCount(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const removedFile = prev.find((file) => file.id === id);
      cleanupFilePreviewUrl(removedFile);
      return prev.filter((file) => file.id !== id);
    });
    setTokenCount(null);
  };

  const clearAll = () => {
    setText('');
    setFiles((prev) => {
      cleanupFilePreviewUrls(prev);
      return [];
    });
    setTokenCount(null);
  };

  const handleCalculateClick = () => {
    performCalculation(text, files, selectedModelId);
  };

  const handleModelSelect = (id: string, _providerId?: ChatProviderId) => {
    setSelectedModelId(id);
    setTokenCount(null);
  };

  const handleSaveDedicatedApiKey = (newKey: string) => {
    const trimmed = newKey.trim() || null;
    setDedicatedApiKey(trimmed ?? '');
    useSettingsStore.getState().setAppSettings((prev) => ({
      ...prev,
      tokenCalculatorApiKey: trimmed,
    }));
    setTokenCount(null);
    if (text.trim() || files.length > 0) {
      performCalculation(text, files, selectedModelId, trimmed);
    }
  };

  const hasDedicatedApiKey = Boolean(
    dedicatedApiKey.trim() || latestStoredSettings.tokenCalculatorApiKey || appSettings.tokenCalculatorApiKey,
  );

  return {
    text,
    setText,
    files,
    selectedModelId,
    tokenCount,
    videoTokenEstimate,
    isLoading,
    error,
    fileInputRef,
    handleFileChange,
    removeFile,
    clearAll,
    handleCalculateClick,
    handleModelSelect,
    setTokenCount,
    dedicatedApiKey,
    setDedicatedApiKey,
    handleSaveDedicatedApiKey,
    isApiKeyConfigOpen,
    setIsApiKeyConfigOpen,
    hasDedicatedApiKey,
  };
};
