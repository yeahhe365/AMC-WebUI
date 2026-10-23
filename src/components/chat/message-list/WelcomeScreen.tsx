import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { EASTER_EGG_QUOTES, getEasterEggTypingDelay } from './welcomeEasterEgg';
import { FileText, Lightbulb, ListChecks, Settings2, ArrowUpRight } from 'lucide-react';
import { useChatDraftStore } from '@/stores/chatDraftStore';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsUiStore } from '@/stores/settingsUiStore';

const STARTER_PROMPTS = [
  { title: 'welcomeStarterExplain', prompt: 'welcomePromptExplain', icon: Lightbulb },
  { title: 'welcomeStarterWrite', prompt: 'welcomePromptWrite', icon: FileText },
  { title: 'welcomeStarterPlan', prompt: 'welcomePromptPlan', icon: ListChecks },
] as const;

const WelcomeEasterEggText: React.FC<{ text: string }> = ({ text }) => {
  const unusedQuotesRef = useRef<readonly string[]>(EASTER_EGG_QUOTES);
  const [activeQuote, setActiveQuote] = useState<{ sourceText: string; quote: string | null; typedText: string }>({
    sourceText: text,
    quote: null,
    typedText: '',
  });
  const isShowingCurrentQuote = activeQuote.sourceText === text && activeQuote.quote;
  const displayedText = isShowingCurrentQuote ? activeQuote.typedText : text;
  const accessibleText = isShowingCurrentQuote ? activeQuote.quote! : text;

  useEffect(() => {
    if (!isShowingCurrentQuote || activeQuote.typedText.length >= activeQuote.quote!.length) {
      return undefined;
    }

    const delay = getEasterEggTypingDelay(activeQuote.quote!, activeQuote.typedText.length);

    const timeout = setTimeout(() => {
      setActiveQuote((prev) => {
        if (prev.sourceText !== text || prev.quote !== activeQuote.quote) {
          return prev;
        }

        return {
          ...prev,
          typedText: prev.quote!.slice(0, prev.typedText.length + 1),
        };
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [activeQuote.quote, activeQuote.typedText, isShowingCurrentQuote, text]);

  const showNextQuote = () => {
    let unusedQuotes = activeQuote.sourceText === text ? unusedQuotesRef.current : EASTER_EGG_QUOTES;

    if (unusedQuotes.length === 0) {
      unusedQuotes = EASTER_EGG_QUOTES.filter((quoteItem) => quoteItem !== activeQuote.quote);
    }

    const randomIndex = Math.floor(Math.random() * unusedQuotes.length);
    const nextQuote = unusedQuotes[randomIndex];
    unusedQuotesRef.current = unusedQuotes.filter((_, index) => index !== randomIndex);
    setActiveQuote({ sourceText: text, quote: nextQuote, typedText: '' });
  };

  const handleClick = () => {
    showNextQuote();
  };

  return (
    <button
      type="button"
      aria-label={accessibleText}
      aria-live="polite"
      className={`flex w-full h-full items-center justify-center min-h-[1.5em] appearance-none border-0 bg-transparent p-0 text-inherit tracking-tight select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] rounded-md ${
        isShowingCurrentQuote ? 'font-mono' : 'font-sans'
      }`}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          showNextQuote();
        }
      }}
    >
      {displayedText}
      {isShowingCurrentQuote && activeQuote.typedText.length < activeQuote.quote!.length && (
        <span className="inline-block w-[0.6em] h-[1em] bg-[var(--theme-text-primary)] ml-1 align-text-bottom animate-cursor-blink" />
      )}
    </button>
  );
};

interface WelcomeScreenProps {
  activeSessionId?: string | null;
  showStarterPrompts?: boolean;
  onSelectPrompt?: (prompt: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  activeSessionId,
  showStarterPrompts = false,
  onSelectPrompt,
}) => {
  const { t } = useI18n();
  const hasDraft = useChatDraftStore((state) => !!(activeSessionId && state.drafts[activeSessionId]?.inputText.trim()));
  const isEditing = useChatStore((state) => !!state.editingMessageId);
  const fillPrompt = (prompt: string) => {
    const current = useChatStore.getState();
    if (!activeSessionId || current.activeSessionId !== activeSessionId || current.editingMessageId) return;
    if (useChatDraftStore.getState().drafts[activeSessionId]?.inputText.trim()) return;
    onSelectPrompt?.(prompt);
  };
  const openConnectionSettings = () => {
    useSettingsUiStore.getState().setActiveTab('gemini');
    useUIStore.getState().setIsSettingsModalOpen(true);
  };
  return (
    <div className="flex flex-col h-full w-full overflow-y-auto custom-scrollbar px-4 py-6 sm:py-10">
      <div className="my-auto mx-auto w-full max-w-3xl shrink-0 flex flex-col items-center gap-3 sm:gap-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-center welcome-message-animate tracking-tight min-h-[3rem] flex items-center justify-center text-[var(--theme-text-primary)]">
          <WelcomeEasterEggText text={t('welcomeGreeting')} />
        </h1>
        <p className="max-w-md text-center text-sm leading-relaxed text-[var(--theme-text-secondary)]">
          {t('welcomeSubtitle')}
        </p>
        {showStarterPrompts && onSelectPrompt && (
          <div className="w-full max-w-xl space-y-2 mt-1 sm:mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {STARTER_PROMPTS.map(({ title, prompt, icon: Icon }) => (
                <button
                  key={title}
                  type="button"
                  disabled={!activeSessionId || hasDraft || isEditing}
                  onClick={() => fillPrompt(t(prompt))}
                  className="flex items-center gap-3 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 px-3 py-2.5 sm:py-4 text-left text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-[var(--theme-border-focus)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon size={18} className="shrink-0 text-[var(--theme-text-secondary)]" />
                  <span className="min-w-0 flex-1">{t(title)}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-[var(--theme-text-tertiary)]" />
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-center text-[var(--theme-text-tertiary)]">
              {t(hasDraft ? 'welcomeDraftPreserved' : 'welcomeStarterHint')}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={openConnectionSettings}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
        >
          <Settings2 size={15} />
          {t('welcomeConfigureConnection')}
          <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
};
