import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalCommandPalette } from './GlobalCommandPalette';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';

describe('GlobalCommandPalette', () => {
  beforeEach(() => {
    useUIStore.setState({
      isCommandPaletteOpen: true,
      isSettingsModalOpen: false,
    });
    useChatStore.setState({
      savedSessions: [
        {
          id: 'session-1',
          title: 'Vue Migration Plan',
          timestamp: Date.now(),
          messages: [],
          settings: { modelId: 'claude-3-5-sonnet' } as never,
          isPinned: false,
          groupId: null,
        },
        {
          id: 'session-2',
          title: 'React 19 Hooks',
          timestamp: Date.now(),
          messages: [],
          settings: { modelId: 'gpt-4o' } as never,
          isPinned: true,
          groupId: null,
        },
      ],
      activeSessionId: 'session-1',
      setCurrentChatSettings: vi.fn((updater) => {
        useChatStore.setState((state) => ({
          savedSessions: state.savedSessions.map((s) =>
            s.id === state.activeSessionId
              ? { ...s, settings: typeof updater === 'function' ? updater(s.settings) : updater }
              : s,
          ),
        }));
      }) as never,
    });
  });

  it('renders command palette with search input and groups when open', () => {
    render(<GlobalCommandPalette />);

    expect(screen.getByPlaceholderText(/搜索会话/)).toBeInTheDocument();
    expect(screen.getByText('常用操作')).toBeInTheDocument();
    expect(screen.getByText('新建聊天')).toBeInTheDocument();
    expect(screen.getByText('Vue Migration Plan')).toBeInTheDocument();
    expect(screen.getByText('React 19 Hooks')).toBeInTheDocument();
    expect(screen.getByText('切换 AI 模型')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('allows clicking a session item to switch session and close palette', () => {
    render(<GlobalCommandPalette />);

    const sessionItem = screen.getByText('React 19 Hooks');
    fireEvent.click(sessionItem);

    expect(useChatStore.getState().activeSessionId).toBe('session-2');
    expect(useUIStore.getState().isCommandPaletteOpen).toBe(false);
  });

  it('allows switching model by selecting a model item', () => {
    render(<GlobalCommandPalette />);

    const gptItem = screen.getByText('GPT-4o');
    fireEvent.click(gptItem);

    const session = useChatStore.getState().savedSessions.find((s) => s.id === 'session-1');
    expect(session?.settings?.modelId).toBe('gpt-4o');
    expect(useUIStore.getState().isCommandPaletteOpen).toBe(false);
  });

  it('opens settings when clicking open settings command', () => {
    render(<GlobalCommandPalette />);

    const settingsItem = screen.getByText('打开设置面板');
    fireEvent.click(settingsItem);

    expect(useUIStore.getState().isSettingsModalOpen).toBe(true);
    expect(useUIStore.getState().isCommandPaletteOpen).toBe(false);
  });
});
