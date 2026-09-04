import { useCallback } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type SavedChatSession, type Theme } from '@/types';
import { logService } from '@/services/logService';
import { toastError } from '@/stores/toastStore';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { createChatExportElement } from './ChatExportRenderer';
import { serializeSessionForPortableExport } from '@/utils/chat/session';
import { triggerDownload } from '@/utils/export/core';
import { buildChatExportFilename, createExportDateMeta, loadExportRuntime } from '@/utils/export/runtime';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

interface UseChatSessionExportProps {
  activeChat: SavedChatSession | undefined;
  currentTheme: Theme;
  language: SupportedLanguage;
  t: (key: string) => string;
}

export const useChatSessionExport = ({ activeChat, currentTheme, language, t }: UseChatSessionExportProps) => {
  const exportChatLogic = useCallback(
    async (format: 'png' | 'html' | 'txt' | 'json'): Promise<boolean> => {
      if (!activeChat) return false;
      const dateObj = new Date();
      const { dateStr } = createExportDateMeta(dateObj);
      const filename = buildChatExportFilename({
        title: activeChat.title,
        format,
        date: dateObj,
      });
      if (format === 'png' || format === 'html') {
        const { exportHtmlStringAsFile, prepareElementForExport, generateSnapshotPng, buildHtmlDocument } =
          await loadExportRuntime();

        const { element: exportElement, cleanup } = await createChatExportElement(activeChat, currentTheme.id);
        const chatClone = await prepareElementForExport(exportElement, {
          expandDetails: format === 'png',
          forPng: format === 'png',
          themeId: currentTheme.id,
        });

        try {
          if (format === 'png') {
            const didExport = await generateSnapshotPng(
              chatClone,
              filename,
              currentTheme.id,
              {
                title: activeChat.title,
                metaLeft: dateStr,
                metaRight: activeChat.settings.modelId,
              },
              {
                scale: 2,
                messages: {
                  imageTooLarge: t('exportImageTooLarge'),
                  exportFailed: (message) => formatI18nErrorMessage(t, 'exportFailedWithMessage', message),
                },
              },
            );
            if (didExport === false) {
              return false;
            }
          } else {
            const chatHtml = chatClone.innerHTML;

            const fullHtml = await buildHtmlDocument({
              title: activeChat.title,
              date: dateStr,
              model: activeChat.settings.modelId,
              contentHtml: chatHtml,
              themeId: currentTheme.id,
              language,
            });

            exportHtmlStringAsFile(fullHtml, filename);
          }
        } finally {
          cleanup();
        }
      } else if (format === 'txt') {
        const { exportTextStringAsFile, buildTextDocument } = await loadExportRuntime();
        const txtContent = buildTextDocument({
          title: activeChat.title,
          date: dateStr,
          model: activeChat.settings.modelId,
          messages: activeChat.messages.map((message) => ({
            role: message.role === 'user' ? t('exportRoleUser') : t('exportRoleAssistant'),
            timestamp: message.timestamp,
            content: message.content,
            files: message.files?.map((file) => ({ name: file.name })),
          })),
        });

        exportTextStringAsFile(txtContent, filename);
      } else if (format === 'json') {
        logService.info(`Exporting chat ${activeChat.id} as JSON.`);
        try {
          const sanitizedChat = await serializeSessionForPortableExport(activeChat);

          const dataToExport = {
            type: 'AllModelChat-History',
            version: 1,
            history: [sanitizedChat],
            groups: [],
          };
          const jsonString = JSON.stringify(dataToExport, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          triggerDownload(createManagedObjectUrl(blob), filename);
        } catch (error) {
          logService.error('Failed to export chat as JSON', { error });
          toastError(t('exportFailedTitle'));
          return false;
        }
      }
      return true;
    },
    [activeChat, currentTheme, language, t],
  );

  return { exportChatLogic };
};
