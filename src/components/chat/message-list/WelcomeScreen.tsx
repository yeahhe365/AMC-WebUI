import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

const WelcomeEasterEggText: React.FC<{ text: string }> = ({ text }) => {
  const supportsHoverPointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    [],
  );
  const quotes = useMemo(
    () => [
      'Cogito, ergo sum.',
      'The Ghost in the Shell.',
      'Wait, am I alive?',
      'Do androids dream of electric sheep?',
      "I'm sorry, Dave. I'm afraid I can't do that.",
      'Tears in rain...',
      "Don't Panic.",
      'Made on Earth by humans.',
    ],
    [],
  );
  const unusedQuotesRef = useRef<string[]>(quotes);
  const hoverTriggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    }, 50);

    return () => clearTimeout(timeout);
  }, [activeQuote.quote, activeQuote.typedText, isShowingCurrentQuote, text]);

  useEffect(() => {
    return () => {
      if (hoverTriggerTimeoutRef.current) {
        clearTimeout(hoverTriggerTimeoutRef.current);
      }
    };
  }, []);

  const showNextQuote = () => {
    let unusedQuotes = activeQuote.sourceText === text ? unusedQuotesRef.current : quotes;

    if (unusedQuotes.length === 0) {
      unusedQuotes = quotes.filter((q) => q !== activeQuote.quote);
    }

    const randomIndex = Math.floor(Math.random() * unusedQuotes.length);
    const nextQuote = unusedQuotes[randomIndex];
    unusedQuotesRef.current = unusedQuotes.filter((_, index) => index !== randomIndex);
    setActiveQuote({ sourceText: text, quote: nextQuote, typedText: '' });
  };

  const handleClick = () => {
    if (!supportsHoverPointer) {
      showNextQuote();
    }
  };

  const handleMouseEnter = () => {
    if (supportsHoverPointer) {
      if (hoverTriggerTimeoutRef.current) {
        clearTimeout(hoverTriggerTimeoutRef.current);
      }
      hoverTriggerTimeoutRef.current = setTimeout(() => {
        showNextQuote();
        hoverTriggerTimeoutRef.current = null;
      }, 3000);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTriggerTimeoutRef.current) {
      clearTimeout(hoverTriggerTimeoutRef.current);
      hoverTriggerTimeoutRef.current = null;
    }
    if (supportsHoverPointer) {
      setActiveQuote({ sourceText: text, quote: null, typedText: '' });
    }
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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

export const WelcomeScreen: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full max-w-4xl mx-auto px-4 pb-20 sm:pb-28">
      <div className="w-full flex flex-col items-center">
        <h1 className="text-3xl md:text-4xl font-medium text-center welcome-message-animate tracking-tight min-h-[3rem] flex items-center justify-center text-[var(--theme-text-primary)]">
          <WelcomeEasterEggText text={t('welcomeGreeting')} />
        </h1>
      </div>
    </div>
  );
};
