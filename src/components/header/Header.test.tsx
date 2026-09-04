import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

vi.mock('./HeaderModelSelector', () => ({
  HeaderModelSelector: () => <div data-testid="header-model-selector" />,
}));

describe('Header', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('uses localized PiP labels from the translation layer', async () => {
    await act(async () => {
      renderer.root.render(
        <Header
          onNewChat={vi.fn()}
          newChatHref="/"
          onOpenScenariosModal={vi.fn()}
          onToggleHistorySidebar={vi.fn()}
          isLoading={false}
          currentModelName="Gemini 3 Flash"
          availableModels={[]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isHistorySidebarOpen={false}
          onLoadLiveArtifactsPrompt={vi.fn()}
          isLiveArtifactsPromptActive={false}
          isPipSupported={true}
          isPipActive={false}
          onTogglePip={vi.fn()}
          themeId="pearl"
          newChatShortcut=""
          pipShortcut=""
        />,
      );
    });

    const pipButton = renderer.container.querySelector('button[aria-label="Enter Picture-in-Picture"]');
    expect(pipButton).not.toBeNull();
    expect(pipButton?.getAttribute('title')).toBe('Enter Picture-in-Picture');
  });

  it('keeps the Live Artifacts helper hit target stable while pressing', async () => {
    await act(async () => {
      renderer.root.render(
        <Header
          onNewChat={vi.fn()}
          newChatHref="/"
          onOpenScenariosModal={vi.fn()}
          onToggleHistorySidebar={vi.fn()}
          isLoading={false}
          currentModelName="Gemini 3 Flash"
          availableModels={[]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isHistorySidebarOpen={false}
          onLoadLiveArtifactsPrompt={vi.fn()}
          isLiveArtifactsPromptActive={false}
          isPipSupported={true}
          isPipActive={false}
          onTogglePip={vi.fn()}
          themeId="pearl"
          newChatShortcut=""
          pipShortcut=""
        />,
      );
    });

    const liveArtifactsButton = renderer.container.querySelector('button[aria-label="Load Live Artifacts prompt"]');

    expect(liveArtifactsButton).not.toBeNull();
    expect(liveArtifactsButton?.className).toContain('w-9');
    expect(liveArtifactsButton?.className).toContain('h-9');
    // Keep a fixed 36px hit target; no hover grow that shifts layout.
    expect(liveArtifactsButton?.className).not.toContain('hover:scale-105');
  });

  it('uses compact vertical chrome for the top header', async () => {
    await act(async () => {
      renderer.root.render(
        <Header
          onNewChat={vi.fn()}
          newChatHref="/"
          onOpenScenariosModal={vi.fn()}
          onToggleHistorySidebar={vi.fn()}
          isLoading={false}
          currentModelName="Gemini 3 Flash"
          availableModels={[]}
          selectedModelId="gemini-3-flash-preview"
          onSelectModel={vi.fn()}
          isSwitchingModel={false}
          isHistorySidebarOpen={false}
          onLoadLiveArtifactsPrompt={vi.fn()}
          isLiveArtifactsPromptActive={false}
          isPipSupported={true}
          isPipActive={false}
          onTogglePip={vi.fn()}
          themeId="pearl"
          newChatShortcut=""
          pipShortcut=""
        />,
      );
    });

    const header = renderer.container.querySelector('header');

    expect(header?.className).toContain('py-[0.4rem]');
    expect(header?.className).toContain('sm:py-[0.52rem]');
    expect(header?.className).not.toContain('border-b');
    expect(header?.className.split(/\s+/)).not.toContain('p-2');
    expect(header?.className.split(/\s+/)).not.toContain('sm:p-3');
  });
});
