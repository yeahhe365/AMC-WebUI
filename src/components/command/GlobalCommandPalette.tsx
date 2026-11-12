import React, { useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { useModelPreferencesStore } from '@/stores/modelPreferencesStore';
import { useMultimodalSearchStore } from '@/stores/multimodalSearchStore';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { sortSessionsByRecency } from './sessionRecency';
import { toast } from 'sonner';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/shared/Command';
import {
  Plus,
  MessageSquare,
  Download,
  Pin,
  Trash2,
  Cpu,
  Globe,
  Brain,
  Code2,
  MapPinned,
  Link as LinkIcon,
  Settings,
  FolderKanban,
  BarChart2,
  Check,
  Sparkles,
  Library,
} from 'lucide-react';
import { isMacPlatform } from '@/utils/platform/platform';

export interface GlobalCommandPaletteProps {
  onNewChat?: () => void;
  onOpenExportModal?: () => void;
  onClearCurrentChat?: () => void;
}

const COMMON_MODELS = [
  { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', provider: 'Google', badge: 'Fast' },
  { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon', provider: 'Google', badge: 'Frontier' },
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon', provider: 'Google', badge: 'Frontier' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic', badge: 'Fast & Smart' },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', provider: 'OpenAI', badge: 'Omni' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'Google', badge: 'Next-Gen' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google', badge: 'Pro' },
  { id: 'deepseek-flash', name: 'DeepSeek Flash', provider: 'DeepSeek', badge: 'Reasoning' },
];

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  onNewChat,
  onOpenExportModal,
  onClearCurrentChat,
}) => {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const modKey = isMac ? '⌘' : 'Ctrl';

  const isOpen = useUIStore((state) => state.isCommandPaletteOpen);
  const setIsOpen = useUIStore((state) => state.setIsCommandPaletteOpen);
  const setIsSettingsModalOpen = useUIStore((state) => state.setIsSettingsModalOpen);
  const setIsLogViewerOpen = useUIStore((state) => state.setIsLogViewerOpen);
  const setActiveView = useUIStore((state) => state.setActiveView);
  const toggleHistorySidebar = useUIStore((state) => state.toggleHistorySidebar);

  const savedSessions = useChatStore((state) => state.savedSessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId);
  const setCurrentChatSettings = useChatStore((state) => state.setCurrentChatSettings);
  const customModels = useModelPreferencesStore((state) => state.customModels);

  const availableModels = useMemo(() => {
    if (customModels && customModels.length > 0) {
      const visibleModels = customModels.filter((model) => model.visibleInSelector !== false);
      const pinned = visibleModels.filter((model) => model.isPinned);
      const unpinned = visibleModels.filter((model) => !model.isPinned);
      const combined = [...pinned, ...unpinned];
      return combined.slice(0, 8).map((model) => ({
        id: model.id,
        name: model.name || model.id,
        provider: model.connectionName || model.providerId || (model as { provider?: string }).provider || 'AI',
        badge: model.isPinned ? 'Pinned' : model.capabilities?.thinking ? 'Reasoning' : 'Model',
      }));
    }
    return COMMON_MODELS;
  }, [customModels]);

  // Global keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
      // ⌘K or ⌘⇧P or Ctrl+K or Ctrl+Shift+P
      if (
        (isCmdOrCtrl && event.key.toLowerCase() === 'k') ||
        (isCmdOrCtrl && event.shiftKey && event.key.toLowerCase() === 'p')
      ) {
        const target = event.target as HTMLElement | null;
        const isContentEditable = target?.isContentEditable || false;
        const isInputOrTextarea = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
        // Allow shortcut if not inside an input, or if explicitly pressing Shift+P
        if (!isInputOrTextarea && !isContentEditable) {
          event.preventDefault();
          setIsOpen((previousOpen) => !previousOpen);
        } else if (event.shiftKey && event.key.toLowerCase() === 'p') {
          event.preventDefault();
          setIsOpen((previousOpen) => !previousOpen);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMac, setIsOpen]);

  const runCommand = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const handleSelectSession = (sessionId: string) => {
    runCommand(() => {
      setActiveSessionId(sessionId);
      const session = savedSessions.find((sessionItem) => sessionItem.id === sessionId);
      toast.success(session?.title || t('commandSwitchedSession'));
    });
  };

  const handleSelectModel = (modelId: string, modelName: string) => {
    runCommand(() => {
      if (typeof setCurrentChatSettings === 'function') {
        setCurrentChatSettings((prev) => ({ ...prev, modelId }));
      }
      toast.success(interpolate(t('commandSwitchedModel'), { name: modelName }));
    });
  };

  const recentSessions = sortSessionsByRecency(savedSessions).slice(0, 8);
  const activeSession = savedSessions.find((session) => session.id === activeSessionId);
  const activeModelId = activeSession?.settings?.modelId || '';

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
      <CommandInput placeholder={interpolate(t('commandPalettePlaceholder'), { key: modKey })} />
      <CommandList>
        <CommandEmpty>{t('commandPaletteEmpty')}</CommandEmpty>

        <CommandGroup heading={t('commandGroupCommon')}>
          <CommandItem
            value={`new chat ${t('commandNewChat')}`}
            onSelect={() =>
              runCommand(() => {
                if (onNewChat) onNewChat();
                else setActiveSessionId(null);
                toast.success(t('commandCreatedSession'));
              })
            }
          >
            <Plus className="text-[var(--theme-text-link)]" />
            <span>{t('commandNewChat')}</span>
            <CommandShortcut>{modKey}⇧O</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`toggle sidebar ${t('commandToggleSidebar')}`}
            onSelect={() => runCommand(() => toggleHistorySidebar())}
          >
            <FolderKanban className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandToggleSidebar')}</span>
            <CommandShortcut>{modKey}B</CommandShortcut>
          </CommandItem>

          {onOpenExportModal && (
            <CommandItem value={`export chat ${t('commandExportChat')}`} onSelect={() => runCommand(onOpenExportModal)}>
              <Download className="text-[var(--theme-text-secondary)]" />
              <span>{t('commandExportChat')}</span>
              <CommandShortcut>{modKey}E</CommandShortcut>
            </CommandItem>
          )}

          {onClearCurrentChat && (
            <CommandItem
              value={`clear current chat ${t('commandClearChat')}`}
              onSelect={() => runCommand(onClearCurrentChat)}
            >
              <Trash2 className="text-[var(--theme-icon-error)]" />
              <span>{t('commandClearChat')}</span>
              <CommandShortcut>/clear</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {recentSessions.length > 0 && (
          <>
            <CommandGroup heading={t('commandGroupRecent')}>
              {recentSessions.map((session) => (
                <CommandItem
                  key={session.id}
                  value={`session ${session.title} ${session.id}`}
                  onSelect={() => handleSelectSession(session.id)}
                >
                  <MessageSquare className="text-[var(--theme-text-secondary)] shrink-0" />
                  <span className="truncate flex-1">{session.title || t('newChat')}</span>
                  {session.id === activeSessionId && (
                    <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)] shrink-0" />
                  )}
                  {session.isPinned && <Pin className="h-3 w-3 text-[var(--theme-text-link)] shrink-0 ml-1.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading={t('commandGroupModels')}>
          {availableModels.map((model) => {
            const isSelected = activeModelId.includes(model.id) || activeModelId.includes(model.name.toLowerCase());
            return (
              <CommandItem
                key={model.id}
                value={`model ${model.name} ${model.provider} ${model.badge}`}
                onSelect={() => handleSelectModel(model.id, model.name)}
              >
                <Cpu className="text-[var(--theme-text-secondary)] shrink-0" />
                <span className="font-medium text-[var(--theme-text-primary)]">{model.name}</span>
                <span className="text-[11px] text-[var(--theme-text-tertiary)] ml-1.5">({model.provider})</span>
                {isSelected ? (
                  <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)] shrink-0" />
                ) : (
                  <span className="ml-auto text-[10px] text-[var(--theme-text-tertiary)] font-mono">{model.badge}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('commandGroupTools')}>
          <CommandItem
            value={`web search online ${t('commandWebSearch')}`}
            onSelect={() =>
              runCommand(() => {
                toast.info(t('commandWebSearchTip'));
              })
            }
          >
            <Globe className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandWebSearch')}</span>
            <CommandShortcut>/online</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`deep thinking reasoning ${t('commandDeepThinking')}`}
            onSelect={() =>
              runCommand(() => {
                toast.info(t('commandDeepThinkingTip'));
              })
            }
          >
            <Brain className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandDeepThinking')}</span>
            <CommandShortcut>/deep</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`code execution python ${t('commandCodeExecution')}`}
            onSelect={() =>
              runCommand(() => {
                toast.info(t('commandCodeExecutionTip'));
              })
            }
          >
            <Code2 className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandCodeExecution')}</span>
            <CommandShortcut>/code</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`google maps location ${t('commandMapsLocation')}`}
            onSelect={() =>
              runCommand(() => {
                toast.info(t('commandMapsLocationTip'));
              })
            }
          >
            <MapPinned className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandMapsLocation')}</span>
            <CommandShortcut>/maps</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`url context web extract ${t('commandUrlContext')}`}
            onSelect={() =>
              runCommand(() => {
                toast.info(t('commandUrlContextTip'));
              })
            }
          >
            <LinkIcon className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandUrlContext')}</span>
            <CommandShortcut>/url</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`image search media multimodal find ${t('multimodalSearchTitle')}`}
            onSelect={() =>
              runCommand(() => {
                useMultimodalSearchStore.getState().openModal();
              })
            }
          >
            <Sparkles className="text-[var(--theme-text-secondary)]" />
            <span>{t('multimodalSearchTitle')}</span>
            <CommandShortcut>/find</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t('commandGroupNav')}>
          <CommandItem
            value={`open settings ${t('commandOpenSettings')}`}
            onSelect={() =>
              runCommand(() => {
                setIsSettingsModalOpen(true);
              })
            }
          >
            <Settings className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandOpenSettings')}</span>
            <CommandShortcut>{modKey},</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`switch to library ${t('commandOpenLibrary')}`}
            onSelect={() =>
              runCommand(() => {
                setActiveView('library');
                toast.success(t('commandSwitchedLibrary'));
              })
            }
          >
            <Library className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandOpenLibrary')}</span>
            <CommandShortcut>/library</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`open log viewer ${t('commandOpenLogViewer')}`}
            onSelect={() =>
              runCommand(() => {
                setIsLogViewerOpen(true);
              })
            }
          >
            <BarChart2 className="text-[var(--theme-text-secondary)]" />
            <span>{t('commandOpenLogViewer')}</span>
            <CommandShortcut>{modKey}⌥L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
