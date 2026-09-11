import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { File as GeminiFile } from '@google/genai';
import { Modal } from '@/components/shared/Modal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { formatFileSize } from '@/utils/file/fileSize';
import { listFilesApi, deleteFileApi } from '@/services/api/fileApi';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { logService } from '@/services/logService';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import type { AppSettings, ChatSettings } from '@/types';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  X,
  Search,
  Check,
  Copy,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCheck,
  Clock,
  Plus,
} from 'lucide-react';
import { getFileDisplayMeta } from '@/utils/file/fileDisplayStyles';

export type CloudFileCategoryFilter = 'all' | 'video' | 'audio' | 'document' | 'image';

export interface CloudFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFiles?: (files: GeminiFile[]) => void;
  onAddFileById?: (fileId: string) => Promise<void>;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
}

const MAX_PROJECT_QUOTA_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB limit per project

const getRemainingHours = (expirationTime?: string | number): number | null => {
  if (!expirationTime) return null;
  const timestamp = typeof expirationTime === 'number' ? expirationTime : Date.parse(expirationTime);
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60));
};

const getFileIcon = (mimeType?: string, displayName?: string) => {
  const { Icon: FileIcon, colorClass } = getFileDisplayMeta({ type: mimeType, name: displayName });
  return <FileIcon size={18} className={`${colorClass} flex-shrink-0`} strokeWidth={1.75} />;
};

export const CloudFilesModal: React.FC<CloudFilesModalProps> = ({
  isOpen,
  onClose,
  onAddFiles,
  onAddFileById,
  appSettings,
  currentChatSettings,
}) => {
  const { t } = useI18n();

  const [files, setFiles] = useState<GeminiFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const isNoKeyWarning = useMemo(() => {
    return fetchError === t('cloudFilesNoKeyWarning');
  }, [fetchError, t]);

  const isPermissionOrProxyError = useMemo(() => {
    if (!fetchError || isNoKeyWarning) return false;
    const lower = fetchError.toLowerCase();
    return (
      lower.includes('permission_denied') ||
      lower.includes('403') ||
      lower.includes('proxy browser error') ||
      lower.includes('the caller does not have permission')
    );
  }, [fetchError, isNoKeyWarning]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CloudFileCategoryFilter>('all');
  const [selectedFileNames, setSelectedFileNames] = useState<Set<string>>(new Set());

  const [directInputId, setDirectInputId] = useState('');
  const [isAddingDirect, setIsAddingDirect] = useState(false);
  const [directAddError, setDirectAddError] = useState<string | null>(null);
  const [directAddSuccess, setDirectAddSuccess] = useState<string | null>(null);

  const [copiedFileName, setCopiedFileName] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<GeminiFile | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const apiKeyResult = useMemo(() => {
    return getGeminiKeyForRequest(appSettings, currentChatSettings, { skipIncrement: true });
  }, [appSettings, currentChatSettings]);

  const activeApiKey = useMemo(() => {
    return 'error' in apiKeyResult ? null : apiKeyResult.key;
  }, [apiKeyResult]);

  const loadFiles = useCallback(
    async (showRefreshIndicator = false) => {
      if (!activeApiKey) {
        setFetchError(t('cloudFilesNoKeyWarning'));
        setFiles([]);
        return;
      }

      if (showRefreshIndicator) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        let allFiles: GeminiFile[] = [];
        let nextToken: string | undefined = undefined;

        do {
          const res = await listFilesApi(activeApiKey, 100, nextToken);
          allFiles = [...allFiles, ...res.files];
          nextToken = res.nextPageToken;
        } while (nextToken && allFiles.length < 500);

        setFiles(allFiles);
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        logService.error('Failed to fetch cloud files from Gemini Files API:', fetchError);
        setFetchError(errorMsg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeApiKey, t],
  );

  useEffect(() => {
    if (isOpen) {
      void loadFiles(false);
      setSelectedFileNames(new Set());
      setSearchQuery('');
      setCategoryFilter('all');
      setDirectInputId('');
      setDirectAddError(null);
      setDirectAddSuccess(null);
      setShowErrorDetails(false);
    }
  }, [isOpen, loadFiles]);

  const totalBytesUsed = useMemo(() => {
    return files.reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0);
  }, [files]);

  const quotaPercent = useMemo(() => {
    return Math.min(100, Math.round((totalBytesUsed / MAX_PROJECT_QUOTA_BYTES) * 1000) / 10);
  }, [totalBytesUsed]);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const mime = file.mimeType ?? '';
      let matchCategory = true;
      if (categoryFilter === 'video') matchCategory = mime.startsWith('video/');
      else if (categoryFilter === 'audio') matchCategory = mime.startsWith('audio/');
      else if (categoryFilter === 'image') matchCategory = mime.startsWith('image/');
      else if (categoryFilter === 'document') {
        matchCategory =
          mime.startsWith('text/') ||
          mime === 'application/pdf' ||
          mime.includes('officedocument') ||
          mime.includes('msword') ||
          mime.includes('json') ||
          mime.includes('csv');
      }

      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const displayName = (file.displayName ?? '').toLowerCase();
      const name = (file.name ?? '').toLowerCase();
      return displayName.includes(q) || name.includes(q);
    });
  }, [files, categoryFilter, searchQuery]);

  const toggleSelectFile = useCallback((name: string) => {
    setSelectedFileNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const allFilteredSelected = useMemo(() => {
    return filteredFiles.length > 0 && filteredFiles.every((f) => (f.name ? selectedFileNames.has(f.name) : false));
  }, [filteredFiles, selectedFileNames]);

  const handleSelectAllToggle = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedFileNames(new Set());
    } else {
      const allNames = new Set(filteredFiles.map((f) => f.name).filter((n): n is string => Boolean(n)));
      setSelectedFileNames(allNames);
    }
  }, [allFilteredSelected, filteredFiles]);

  const handleCopyId = useCallback((name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    void navigator.clipboard.writeText(name);
    setCopiedFileName(name);
    setTimeout(() => {
      setCopiedFileName((cur) => (cur === name ? null : cur));
    }, 2000);
  }, []);

  const handleDirectAdd = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = directInputId.trim();
      if (!trimmed || isAddingDirect) return;

      setIsAddingDirect(true);
      setDirectAddError(null);
      setDirectAddSuccess(null);

      try {
        if (onAddFileById) {
          await onAddFileById(trimmed);
        }
        if (trimmed.startsWith('gs://')) {
          setDirectAddSuccess(t('cloudFilesGcsSuccess'));
        }
        setDirectInputId('');
        await loadFiles(true);
      } catch (directAddError) {
        const msg = directAddError instanceof Error ? directAddError.message : String(directAddError);
        setDirectAddError(msg);
      } finally {
        setIsAddingDirect(false);
      }
    },
    [directInputId, isAddingDirect, loadFiles, onAddFileById, t],
  );

  const handleDeleteSingle = useCallback(async () => {
    if (!fileToDelete?.name || !activeApiKey) return;
    const targetName = fileToDelete.name;
    setIsDeleting(true);

    try {
      await deleteFileApi(activeApiKey, targetName);
      setFiles((prev) => prev.filter((f) => f.name !== targetName));
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        next.delete(targetName);
        return next;
      });
      setFileToDelete(null);
    } catch (deleteError) {
      logService.error('Failed to delete cloud file:', deleteError);
    } finally {
      setIsDeleting(false);
    }
  }, [activeApiKey, fileToDelete]);

  const handleBatchDelete = useCallback(async () => {
    if (!selectedFileNames.size || !activeApiKey) return;
    setIsDeleting(true);

    try {
      const toDelete = Array.from(selectedFileNames);
      for (const name of toDelete) {
        try {
          await deleteFileApi(activeApiKey, name);
        } catch (batchDeleteError) {
          logService.error(`Failed to delete file ${name} during batch deletion:`, batchDeleteError);
        }
      }
      setFiles((prev) => prev.filter((f) => !f.name || !selectedFileNames.has(f.name)));
      setSelectedFileNames(new Set());
      setIsBatchDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [activeApiKey, selectedFileNames]);

  const handleConfirmInsert = useCallback(() => {
    if (!selectedFileNames.size || !onAddFiles) return;
    const selectedList = files.filter((f) => f.name && selectedFileNames.has(f.name));
    onAddFiles(selectedList);
    onClose();
  }, [files, onAddFiles, onClose, selectedFileNames]);

  const handleRowDoubleClick = useCallback(
    (file: GeminiFile) => {
      if (onAddFiles) {
        onAddFiles([file]);
        onClose();
      }
    },
    [onAddFiles, onClose],
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        contentClassName="w-full max-w-3xl sm:max-w-4xl h-[85vh] max-h-[760px] bg-[var(--theme-bg-primary)] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--theme-border-primary)]"
        noPadding
        ariaLabel={t('cloudFilesModalTitle')}
      >
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Cloud size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--theme-text-primary)] leading-tight flex items-center gap-2">
                  <span>{t('cloudFilesModalTitle')}</span>
                  {isRefreshing && <Loader2 size={14} className="animate-spin text-blue-500" />}
                </h2>
                <p className="text-xs text-[var(--theme-text-tertiary)]">{t('cloudFilesStorageLimitHint')}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void loadFiles(true)}
                disabled={isLoading || isRefreshing}
                className="p-1.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title={t('refresh')}
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS} aria-label={t('close')}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="bg-[var(--theme-bg-tertiary)]/40 p-2.5 rounded-xl border border-[var(--theme-border-secondary)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--theme-text-secondary)] font-medium">
                {interpolate(t('cloudFilesStorageQuota'), {
                  used: formatFileSize(totalBytesUsed) || '0 B',
                  total: '20 GB',
                  percent: quotaPercent.toFixed(1),
                })}
              </span>
              <span className="text-[11px] text-[var(--theme-text-tertiary)]">
                {interpolate(t('cloudFilesTotalCount'), { count: files.length.toString() })}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[var(--theme-bg-tertiary)] rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  quotaPercent > 90 ? 'bg-rose-500' : quotaPercent > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(1, Math.min(100, quotaPercent))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0">
          <form onSubmit={handleDirectAdd} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={directInputId}
                onChange={(e) => setDirectInputId(e.target.value)}
                placeholder={t('cloudFilesInputPlaceholder')}
                className="w-full pl-3 pr-8 py-1.5 text-xs rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-mono"
              />
              {directInputId && (
                <button
                  type="button"
                  onClick={() => setDirectInputId('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!directInputId.trim() || isAddingDirect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-xs cursor-pointer flex-shrink-0"
            >
              {isAddingDirect ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.5} />}
              <span>{t('cloudFilesVerifyAdd')}</span>
            </button>
          </form>

          {directAddError && (
            <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
              <AlertCircle size={13} />
              <span>{directAddError}</span>
            </p>
          )}
          {directAddSuccess && (
            <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
              <Check size={13} />
              <span>{directAddSuccess}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[var(--theme-bg-secondary)] p-1 rounded-xl border border-[var(--theme-border-secondary)] text-xs font-medium">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('cloudFilesFilterAll')}
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('video')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                categoryFilter === 'video'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('cloudFilesFilterVideo')}
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('audio')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                categoryFilter === 'audio'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('cloudFilesFilterAudio')}
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('document')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                categoryFilter === 'document'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('cloudFilesFilterDocument')}
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('image')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                categoryFilter === 'image'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs font-semibold'
                  : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {t('cloudFilesFilterImage')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-[var(--theme-text-tertiary)] gap-3">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="text-sm font-medium">{t('cloudFilesRefreshing')}</p>
            </div>
          ) : fetchError ? (
            <div className="h-full flex flex-col items-center justify-center py-12 px-6 text-center max-w-lg mx-auto">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3.5 ${
                  isPermissionOrProxyError || isNoKeyWarning
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-rose-500/10 text-rose-500'
                }`}
              >
                {isPermissionOrProxyError ? <CloudOff size={24} /> : <AlertCircle size={24} />}
              </div>

              <h3 className="text-sm font-semibold text-[var(--theme-text-primary)] mb-2">
                {isNoKeyWarning ? fetchError : isPermissionOrProxyError ? t('cloudFilesPermissionDenied') : fetchError}
              </h3>

              {isPermissionOrProxyError && (
                <p className="text-xs text-[var(--theme-text-secondary)] leading-relaxed mb-4">
                  {t('cloudFilesPermissionDeniedHint')}
                </p>
              )}

              {!isNoKeyWarning && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void loadFiles(true)}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>{t('cloudFilesRetry')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowErrorDetails((prev) => !prev)}
                    className="text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] underline transition-colors cursor-pointer"
                  >
                    {t('cloudFilesDetailsToggle')}
                  </button>
                </div>
              )}

              {showErrorDetails && fetchError && (
                <div className="mt-4 p-3 w-full rounded-xl bg-[var(--theme-bg-tertiary)]/60 border border-[var(--theme-border-secondary)] text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium text-[var(--theme-text-secondary)] font-mono">
                      Raw error
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyId(fetchError, e)}
                      title={t('cloudFilesCopyId')}
                      className="text-[var(--theme-text-tertiary)] hover:text-blue-500 p-1 cursor-pointer"
                    >
                      {copiedFileName === fetchError ? (
                        <CheckCheck size={12} className="text-emerald-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-[var(--theme-text-secondary)] whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
                    {fetchError}
                  </pre>
                </div>
              )}
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-[var(--theme-text-tertiary)] gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-secondary)]">
                <Cloud size={24} />
              </div>
              <p className="text-sm font-medium text-[var(--theme-text-primary)]">{t('cloudFilesEmpty')}</p>
            </div>
          ) : (
            <div className="border border-[var(--theme-border-secondary)] rounded-xl overflow-hidden bg-[var(--theme-bg-secondary)]/20">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/60 text-[var(--theme-text-secondary)] select-none">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={handleSelectAllToggle}
                        className="rounded border-[var(--theme-border-secondary)] text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-semibold">{t('cloudFilesColName')}</th>
                    <th className="py-2.5 px-3 font-semibold w-28">{t('cloudFilesColStatus')}</th>
                    <th className="py-2.5 px-3 font-semibold w-28">{t('cloudFilesColExpires')}</th>
                    <th className="py-2.5 px-3 font-semibold w-24 text-right">{t('cloudFilesColSize')}</th>
                    <th className="py-2.5 px-3 font-semibold w-16 text-center">{t('cloudFilesColActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-border-secondary)]">
                  {filteredFiles.map((file) => {
                    const fileName = file.name ?? '';
                    const isSelected = selectedFileNames.has(fileName);
                    const hoursLeft = getRemainingHours(file.expirationTime);
                    const isExpired = hoursLeft !== null && hoursLeft <= 0;
                    const duration = file.videoMetadata?.videoDuration;

                    return (
                      <tr
                        key={fileName || file.uri}
                        onClick={() => fileName && toggleSelectFile(fileName)}
                        onDoubleClick={() => handleRowDoubleClick(file)}
                        className={`group cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-500/10 hover:bg-blue-500/15' : 'hover:bg-[var(--theme-bg-secondary)]/50'
                        }`}
                      >
                        <td
                          className="py-2.5 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (fileName) toggleSelectFile(fileName);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => fileName && toggleSelectFile(fileName)}
                            className="rounded border-[var(--theme-border-secondary)] text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3 max-w-[240px] sm:max-w-xs">
                          <div className="flex items-center gap-2.5">
                            {getFileIcon(file.mimeType, file.displayName || file.name)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[var(--theme-text-primary)] truncate">
                                {file.displayName || file.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-tertiary)] font-mono">
                                <span className="truncate">{file.name}</span>
                                {fileName && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopyId(fileName, e)}
                                    title={t('cloudFilesCopyId')}
                                    className="text-[var(--theme-text-tertiary)] hover:text-blue-500 transition-colors cursor-pointer"
                                  >
                                    {copiedFileName === fileName ? (
                                      <CheckCheck size={12} className="text-emerald-500" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                )}
                                {typeof duration === 'string' && duration && (
                                  <span className="ml-1 px-1 py-0.5 rounded bg-[var(--theme-bg-tertiary)] text-[10px]">
                                    {duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {file.state === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              ACTIVE
                            </span>
                          ) : file.state === 'PROCESSING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                              <Loader2 size={10} className="animate-spin" />
                              PROCESSING
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              {file.state || 'FAILED'}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
                              <Clock size={12} />
                              {t('cloudFilesExpired')}
                            </span>
                          ) : hoursLeft !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                hoursLeft <= 2 ? 'text-amber-500' : 'text-[var(--theme-text-tertiary)]'
                              }`}
                            >
                              <Clock size={12} />
                              {interpolate(t('cloudFilesExpiresIn'), { hours: hoursLeft.toString() })}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--theme-text-tertiary)]">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-[var(--theme-text-secondary)]">
                          {formatFileSize(Number(file.sizeBytes) || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFileToDelete(file);
                            }}
                            title={t('cloudFilesDelete')}
                            className="p-1.5 rounded-lg text-[var(--theme-text-tertiary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--theme-text-secondary)]">
              {interpolate(t('cloudFilesSelectedCount'), { count: selectedFileNames.size.toString() })}
            </span>
            {selectedFileNames.size > 0 && (
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-medium cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{interpolate(t('cloudFilesBatchDelete'), { count: selectedFileNames.size.toString() })}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-xl transition-colors border border-[var(--theme-border-secondary)] cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmInsert}
              disabled={selectedFileNames.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              <span>{interpolate(t('cloudFilesInsertSelected'), { count: selectedFileNames.size.toString() })}</span>
            </button>
          </div>
        </div>
      </Modal>

      {fileToDelete && (
        <ConfirmationModal
          isOpen={!!fileToDelete}
          onClose={() => setFileToDelete(null)}
          onConfirm={() => void handleDeleteSingle()}
          title={t('cloudFilesDelete')}
          message={t('cloudFilesDeleteConfirm')}
          confirmLabel={isDeleting ? t('cloudFilesRefreshing') : t('delete')}
          isDanger
        />
      )}

      {isBatchDeleteModalOpen && (
        <ConfirmationModal
          isOpen={isBatchDeleteModalOpen}
          onClose={() => setIsBatchDeleteModalOpen(false)}
          onConfirm={() => void handleBatchDelete()}
          title={t('cloudFilesDelete')}
          message={interpolate(t('cloudFilesDeleteBatchConfirm'), {
            count: selectedFileNames.size.toString(),
          })}
          confirmLabel={isDeleting ? t('cloudFilesRefreshing') : t('delete')}
          isDanger
        />
      )}
    </>
  );
};
