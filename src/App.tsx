import React, { Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './hooks/app/useApp';
import { WindowProvider } from './contexts/WindowContext';
import { I18nProvider } from './contexts/I18nContext';
import { MainContent } from './components/layout/MainContent';
import { PiPPlaceholder } from './components/layout/PiPPlaceholder';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { PwaUpdateBanner } from './components/pwa/PwaUpdateBanner';
import { ToastViewport } from './components/shared/toast/ToastViewport';
import { lazyNamedComponent } from './utils/lazyNamedComponent';

const LazyMcpToolApprovalDialog = lazyNamedComponent(
  () => import('./components/mcp/McpToolApprovalDialog'),
  'McpToolApprovalDialog',
);
const LazyMcpShareInstallGate = lazyNamedComponent(
  () => import('./components/mcp/McpShareInstallGate'),
  'McpShareInstallGate',
);
const LazyGlobalCommandPalette = lazyNamedComponent(
  () => import('./components/command/GlobalCommandPalette'),
  'GlobalCommandPalette',
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </ErrorBoundary>
  );
};

const AppContent: React.FC = () => {
  const app = useApp();
  const { currentTheme, eventsState, pipState, uiState, chatState } = app;
  const { handleAppDragEnter, handleAppDragOver, handleAppDragLeave, handleAppDrop } = chatState;

  // 把文件拖放提升到 App 根：侧边栏/侧面板等区域也能接收文件拖入。
  // 仅处理 Files 类型，避免影响侧边栏的会话拖拽排序和文本选区拖拽。
  const isFileDrag = (event: React.DragEvent<HTMLElement>) => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files' || types[i].toLowerCase() === 'files') return true;
    }
    return false;
  };
  const isModalEvent = (event: React.DragEvent<HTMLElement>) =>
    event.target instanceof Element && !!event.target.closest('[data-modal-backdrop="true"]');

  const dragHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLDivElement>) => {
      if (isFileDrag(event)) handleAppDragEnter(event);
    },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (isFileDrag(event)) handleAppDragOver(event);
    },
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
      if (isFileDrag(event)) handleAppDragLeave(event);
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event) || isModalEvent(event)) return;
      handleAppDrop(event);
    },
  };

  return (
    <div
      className={`relative flex h-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] theme-${currentTheme.id} overflow-hidden`}
      onTouchStart={uiState.handleTouchStart}
      onTouchEnd={uiState.handleTouchEnd}
      {...dragHandlers}
    >
      {pipState.isPipActive && pipState.pipContainer && pipState.pipWindow ? (
        <>
          {createPortal(
            <WindowProvider window={pipState.pipWindow} document={pipState.pipWindow.document}>
              <div
                className={`theme-${currentTheme.id} h-full w-full flex relative bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]`}
                onTouchStart={uiState.handleTouchStart}
                onTouchEnd={uiState.handleTouchEnd}
                {...dragHandlers}
              >
                <MainContent app={app} />
              </div>
            </WindowProvider>,
            pipState.pipContainer,
          )}
          <PiPPlaceholder onClosePip={pipState.togglePip} />
        </>
      ) : (
        <WindowProvider>
          <MainContent app={app} />
        </WindowProvider>
      )}
      {eventsState.needRefresh && !eventsState.updateDismissed ? (
        <PwaUpdateBanner
          onRefresh={() => {
            void eventsState.handleRefreshApp();
          }}
          onDismiss={eventsState.dismissUpdateBanner}
        />
      ) : null}
      <ToastViewport />
      <Suspense fallback={null}>
        <LazyMcpToolApprovalDialog />
      </Suspense>
      <Suspense fallback={null}>
        <LazyMcpShareInstallGate />
      </Suspense>
      <Suspense fallback={null}>
        <LazyGlobalCommandPalette
          onNewChat={chatState.startNewChat}
          onOpenExportModal={() => app.setIsExportModalOpen(true)}
          onClearCurrentChat={chatState.handleClearCurrentChat}
        />
      </Suspense>
    </div>
  );
};

export default App;
