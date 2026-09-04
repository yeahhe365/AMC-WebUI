import React from 'react';
import { Wand2, PictureInPicture, PictureInPicture2 } from 'lucide-react';

import { IconNewChat, IconSidebarToggle, IconScenarios } from '@/components/icons';
import { useI18n } from '@/contexts/I18nContext';
import { getCachedModelCapabilities } from '@/stores/modelCapabilitiesStore';
import { type ModelOption, type ChatProviderId } from '@/types';

import { HeaderModelSelector } from './HeaderModelSelector';

interface HeaderProps {
  onNewChat: () => void;
  /** 新聊天链接（携带 ?from 来源会话）；Cmd/Ctrl+点击以新标签页打开时继承设置。 */
  newChatHref: string;
  onOpenScenariosModal: () => void;
  onToggleHistorySidebar: () => void;
  isLoading: boolean;
  currentModelName: string;
  availableModels: ModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string, providerId?: ChatProviderId) => void;
  isSwitchingModel: boolean;
  isHistorySidebarOpen: boolean;
  onLoadLiveArtifactsPrompt: () => void;
  isLiveArtifactsPromptActive: boolean;
  isLiveArtifactsPromptBusy?: boolean;
  isPipSupported: boolean;
  isPipActive: boolean;
  onTogglePip: () => void;
  themeId: string;
  newChatShortcut: string;
  pipShortcut: string;
}

export const Header: React.FC<HeaderProps> = ({
  onNewChat,
  newChatHref,
  onOpenScenariosModal,
  onToggleHistorySidebar,
  isLoading,
  currentModelName,
  availableModels,
  selectedModelId,
  onSelectModel,
  isSwitchingModel,
  isHistorySidebarOpen,
  onLoadLiveArtifactsPrompt,
  isLiveArtifactsPromptActive,
  isLiveArtifactsPromptBusy = false,
  isPipSupported,
  isPipActive,
  onTogglePip,
  themeId,
  newChatShortcut,
  pipShortcut,
}) => {
  const { t } = useI18n();
  const headerButtonBase =
    'w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition-all duration-150 ease-[cubic-bezier(0.19,1,0.22,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-bg-primary)] focus-visible:ring-[var(--theme-border-focus)]';
  const headerButtonInactive =
    'bg-transparent text-[var(--theme-icon-settings)] hover:bg-[var(--theme-bg-tertiary)]/70 hover:text-[var(--theme-text-primary)] active:scale-95';
  const headerButtonActive =
    'text-[var(--theme-text-link)] bg-[var(--theme-bg-accent)]/10 hover:bg-[var(--theme-bg-accent)]/20';

  const liveArtifactsPromptAriaLabel = isLiveArtifactsPromptActive
    ? t('liveArtifactsPromptActiveAria')
    : t('liveArtifactsPromptInactiveAria');
  const liveArtifactsPromptTitle = isLiveArtifactsPromptActive
    ? t('liveArtifactsPromptActiveTitle')
    : t('liveArtifactsPromptInactiveTitle');

  const iconSize = 18;
  const strokeWidth = 2;

  const { permissions } = getCachedModelCapabilities(selectedModelId || '');

  // Only show Live Artifacts for standard chat models (not specialized audio/image models).
  const showTextTools = permissions.canGenerateSuggestions;

  return (
    <header
      className={`${themeId === 'pearl' ? 'bg-[var(--theme-bg-primary)]' : 'bg-[var(--theme-bg-secondary)]'} px-2 py-[0.4rem] sm:px-3 sm:py-[0.52rem] flex items-center justify-between gap-2 sm:gap-3 flex-shrink-0 relative z-20`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleHistorySidebar}
          className={`${headerButtonBase} ${headerButtonInactive} md:hidden`}
          aria-label={isHistorySidebarOpen ? t('historySidebarClose') : t('historySidebarOpen')}
          title={isHistorySidebarOpen ? t('historySidebarCloseShort') : t('historySidebarOpenShort')}
        >
          <IconSidebarToggle size={iconSize} strokeWidth={strokeWidth} />
        </button>

        <HeaderModelSelector
          currentModelName={currentModelName}
          availableModels={availableModels}
          selectedModelId={selectedModelId}
          onSelectModel={onSelectModel}
          isSwitchingModel={isSwitchingModel}
          isLoading={isLoading}
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2.5 justify-end flex-shrink-0">
        {showTextTools && (
          <button
            onClick={onLoadLiveArtifactsPrompt}
            disabled={isLoading || isLiveArtifactsPromptBusy}
            className={`${headerButtonBase} ${isLiveArtifactsPromptActive ? headerButtonActive : headerButtonInactive}`}
            aria-label={liveArtifactsPromptAriaLabel}
            title={liveArtifactsPromptTitle}
          >
            <Wand2 size={iconSize} strokeWidth={strokeWidth} />
          </button>
        )}

        <button
          onClick={onOpenScenariosModal}
          className={`${headerButtonBase} ${headerButtonInactive}`}
          aria-label={t('scenariosManageAria')}
          title={t('scenariosManageTitle')}
        >
          <IconScenarios size={iconSize} strokeWidth={strokeWidth} />
        </button>

        {isPipSupported && (
          <button
            onClick={onTogglePip}
            className={`${headerButtonBase} ${headerButtonInactive}`}
            aria-label={isPipActive ? t('pipExit') : t('pipEnter')}
            title={(isPipActive ? t('pipExit') : t('pipEnter')) + (pipShortcut ? ` (${pipShortcut})` : '')}
          >
            {isPipActive ? (
              <PictureInPicture2 size={iconSize} strokeWidth={strokeWidth} />
            ) : (
              <PictureInPicture size={iconSize} strokeWidth={strokeWidth} />
            )}
          </button>
        )}

        <a
          href={newChatHref}
          onClick={(e) => {
            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
              e.preventDefault();
              onNewChat();
            }
          }}
          className={`${headerButtonBase} ${headerButtonInactive} md:hidden no-underline`}
          aria-label={t('headerNewChatAria')}
          title={t('newChat') + (newChatShortcut ? ` (${newChatShortcut})` : '')}
        >
          <IconNewChat size={iconSize} strokeWidth={strokeWidth} />
        </a>
      </div>
    </header>
  );
};
