import { useState, useMemo, useEffect } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type ChatMessage } from '@/types';

interface UseAppTitleProps {
  isLoading: boolean;
  messages: ChatMessage[];
  language: SupportedLanguage;
  sessionTitle: string;
}

const GENERATION_TITLE_REFRESH_MS = 1000;

// Browser-tab chrome strings; kept local because they interpolate time and
// concatenate with session titles (not plain t() lookups).
const GENERATING_LABELS: Record<SupportedLanguage, string> = {
  en: 'Generating',
  zh: '生成中',
  ja: '生成中',
  ko: '생성 중',
  es: 'Generando',
  fr: 'Génération',
  de: 'Generierung',
};

const NEW_CHAT_LABELS: Record<SupportedLanguage, string> = {
  en: 'New Chat',
  zh: '新聊天',
  ja: '新しいチャット',
  ko: '새 채팅',
  es: 'Nuevo chat',
  fr: 'Nouvelle discussion',
  de: 'Neuer Chat',
};

export const useAppTitle = ({ isLoading, messages, language, sessionTitle }: UseAppTitleProps) => {
  const [generationTime, setGenerationTime] = useState(0);

  const currentGenerationStartTime = useMemo(() => {
    if (!isLoading) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if ((message.role === 'model' || message.role === 'error') && message.isLoading) {
        return message.generationStartTime ? new Date(message.generationStartTime).getTime() : null;
      }
    }

    return null;
  }, [messages, isLoading]);

  useEffect(() => {
    let intervalId: number;

    if (currentGenerationStartTime) {
      const update = () => {
        setGenerationTime(Math.max(0, Math.floor((Date.now() - currentGenerationStartTime) / 1000)));
      };
      update();
      intervalId = window.setInterval(update, GENERATION_TITLE_REFRESH_MS);
    }

    return () => clearInterval(intervalId);
  }, [currentGenerationStartTime]);

  useEffect(() => {
    const updateTitle = () => {
      let statusPrefix = '';
      if (isLoading) {
        const timeDisplay = ` (${currentGenerationStartTime ? generationTime : 0}s)`;
        statusPrefix = `${GENERATING_LABELS[language]}${timeDisplay}... | `;
      }

      const suffix = sessionTitle === 'AMC WebUI' ? '' : ' • AMC WebUI';
      const cleanTitle = sessionTitle === 'New Chat' ? NEW_CHAT_LABELS[language] : sessionTitle || NEW_CHAT_LABELS.en;
      document.title = `${statusPrefix}${cleanTitle}${suffix}`;
    };

    updateTitle();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateTitle();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionTitle, isLoading, language, generationTime, currentGenerationStartTime]);
};
