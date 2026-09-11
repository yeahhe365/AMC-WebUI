import React, { Suspense } from 'react';
import { ChatArea } from './ChatArea';
import { AppModals } from '@/components/modals/AppModals';
import type { AppViewModel } from '@/hooks/app/useApp';
import { useChatStore } from '@/stores/chatStore';
import { useMainContentViewModel } from './useMainContentViewModel';
import { ChatRuntimeProvider } from './chat-runtime/ChatRuntimeContext';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { isDarkThemeId } from '@/utils/themeMode';

const LazyHistorySidebar = lazyNamedComponent(() => import('@/components/sidebar/HistorySidebar'), 'HistorySidebar');
const LazySidePanel = lazyNamedComponent(() => import('./SidePanel'), 'SidePanel');
const LazyMediaNavPanel = lazyNamedComponent(() => import('@/components/media-nav/MediaNavPanel'), 'MediaNavPanel');
const LazyLibraryView = lazyNamedComponent(() => import('@/components/library/LibraryView'), 'LibraryView');

interface MainContentProps {
  app: AppViewModel;
}

const HistorySidebarFallback: React.FC<{ isOpen: boolean; themeId: string }> = ({ isOpen, themeId }) => (
  <aside
    aria-hidden="true"
    className={`h-full flex-shrink-0 ${isDarkThemeId(themeId) ? 'bg-[var(--theme-bg-primary)]' : 'bg-[var(--theme-bg-secondary)]'} absolute md:static top-0 left-0 z-50 overflow-hidden border-r border-[var(--theme-border-primary)] ${
      isOpen ? 'w-64 md:w-[16.2rem] translate-x-0' : 'w-64 md:w-[52.2px] -translate-x-full md:translate-x-0'
    }`}
  />
);

export const MainContent: React.FC<MainContentProps> = ({ app }) => {
  const {
    sidebarProps,
    appModalsProps,
    sidePanelContent,
    handleCloseSidePanel,
    sidePanelKey,
    overlayVisible,
    currentThemeId,
    closeHistorySidebar,
    activeView,
    setActiveView,
  } = useMainContentViewModel({ app });

  return (
    <>
      <div
        onClick={closeHistorySidebar}
        onTouchEnd={(e) => {
          if (overlayVisible) {
            e.preventDefault();
            closeHistorySidebar();
          }
        }}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300 md:hidden ${
          overlayVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <Suspense fallback={<HistorySidebarFallback isOpen={sidebarProps.isOpen} themeId={currentThemeId} />}>
        <LazyHistorySidebar {...sidebarProps} />
      </Suspense>

      {activeView === 'library' ? (
        <Suspense
          fallback={<div className="flex-1 h-full flex items-center justify-center bg-[var(--theme-bg-primary)]" />}
        >
          <LazyLibraryView
            onNewChat={(initialFiles) => {
              setActiveView('chat');
              app.chatState.startNewChat();
              if (initialFiles && initialFiles.length > 0) {
                useChatStore.getState().setSelectedFiles(initialFiles);
              }
            }}
            onSelectSession={sidebarProps.onSelectSession}
            onClose={() => {
              if (
                typeof window !== 'undefined' &&
                window.history.state?.view === 'library' &&
                window.history.length > 1
              ) {
                window.history.back();
              } else {
                setActiveView('chat');
              }
            }}
            themeId={currentThemeId}
          />
        </Suspense>
      ) : (
        <ChatRuntimeProvider app={app}>
          <ChatArea />
        </ChatRuntimeProvider>
      )}

      <Suspense fallback={null}>
        <LazyMediaNavPanel />
      </Suspense>

      {sidePanelContent && (
        <Suspense fallback={null}>
          <LazySidePanel
            key={sidePanelKey}
            content={sidePanelContent}
            onClose={handleCloseSidePanel}
            themeId={currentThemeId}
          />
        </Suspense>
      )}

      <AppModals {...appModalsProps} />
    </>
  );
};
