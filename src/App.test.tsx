import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useMcpApprovalStore } from '@/stores/mcp/mcpApprovalStore';
import type { McpApprovalDecision } from '@/features/mcp/toolApproval';

const appHarness = vi.hoisted(() => ({ app: null as unknown }));

vi.mock('@/hooks/app/useApp', () => ({
  useApp: () => appHarness.app,
}));
vi.mock('@/components/layout/MainContent', () => ({
  MainContent: () => <div data-testid="main-content" />,
}));
vi.mock('@/components/layout/PiPPlaceholder', () => ({
  PiPPlaceholder: () => <div data-testid="pip-placeholder" />,
}));
vi.mock('@/components/pwa/PwaUpdateBanner', () => ({
  PwaUpdateBanner: () => null,
}));
vi.mock('@/components/command/GlobalCommandPalette', () => ({
  GlobalCommandPalette: () => null,
}));
vi.mock('@/components/search/MultimodalSearchModal', () => ({
  MultimodalSearchModal: () => null,
}));

const TOAST_REGION = 'section[aria-label^="Notifications"]';
const APPROVAL_DIALOG = '[role="alertdialog"]';

const createApp = (pip: { pipWindow: Window; pipContainer: HTMLElement } | null) => ({
  currentTheme: { id: 'test' },
  eventsState: { needRefresh: false, updateDismissed: false },
  pipState: {
    isPipActive: pip !== null,
    pipWindow: pip?.pipWindow ?? null,
    pipContainer: pip?.pipContainer ?? null,
    togglePip: vi.fn(),
  },
  uiState: { handleTouchStart: vi.fn(), handleTouchEnd: vi.fn() },
  chatState: {
    handleAppDragEnter: vi.fn(),
    handleAppDragOver: vi.fn(),
    handleAppDragLeave: vi.fn(),
    handleAppDrop: vi.fn(),
    startNewChat: vi.fn(),
    handleClearCurrentChat: vi.fn(),
  },
  setIsExportModalOpen: vi.fn(),
});

const requestApproval = () =>
  new Promise<McpApprovalDecision>((resolve) => {
    useMcpApprovalStore
      .getState()
      .openApproval({ serverId: 's1', serverName: 'FS Server', toolName: 'write_file', args: {} }, resolve);
  });

describe('App overlays across windows', () => {
  let pipDocument: Document;
  let pipContainer: HTMLElement;

  beforeEach(() => {
    useMcpApprovalStore.setState({ pending: null, pendingQueue: [] });
    pipDocument = document.implementation.createHTMLDocument('pip');
    pipContainer = pipDocument.createElement('div');
    pipDocument.body.appendChild(pipContainer);
  });

  afterEach(() => {
    appHarness.app = null;
  });

  it('keeps toasts and the tool-approval dialog in the Picture-in-Picture window while it is open', async () => {
    appHarness.app = createApp({ pipWindow: { document: pipDocument } as unknown as Window, pipContainer });
    const view = render(<App />);

    let decision!: Promise<McpApprovalDecision>;
    act(() => {
      decision = requestApproval();
    });

    await waitFor(() => expect(pipDocument.querySelector(APPROVAL_DIALOG)).not.toBeNull());
    expect(document.querySelector(APPROVAL_DIALOG)).toBeNull();
    expect(pipContainer.querySelector(TOAST_REGION)).not.toBeNull();
    expect(document.querySelector(TOAST_REGION)).toBeNull();

    // The point of all this: the user can answer from the window they are in.
    act(() => {
      pipDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(decision).resolves.toBe('deny');

    view.unmount();
  });

  it('keeps them in the main window when Picture-in-Picture is closed', async () => {
    appHarness.app = createApp(null);
    const view = render(<App />);

    act(() => {
      void requestApproval();
    });

    await waitFor(() => expect(document.querySelector(APPROVAL_DIALOG)).not.toBeNull());
    expect(pipDocument.querySelector(APPROVAL_DIALOG)).toBeNull();
    expect(document.querySelector(TOAST_REGION)).not.toBeNull();

    view.unmount();
  });
});
