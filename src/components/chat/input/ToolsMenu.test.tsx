import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { setupStoreStateReset } from '@/test/stores/reset';
import { ToolsMenu } from './ToolsMenu';
import { createChatToolToggleStatesFromFlags } from '@/test/chat-tools/fixtures';

const toolUtilityActions = {
  onCountTokens: () => {},
};

describe('ToolsMenu', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  it('keeps local Python available for native audio models', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-3.1-flash-live-preview"
          toolStates={createChatToolToggleStatesFromFlags({ localPython: true })}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    const toolsButton = document.querySelector('button[aria-label="Tools"]') as HTMLButtonElement | null;
    expect(toolsButton).not.toBeNull();

    act(() => {
      toolsButton?.click();
    });

    expect(document.body.textContent).toContain('Pyodide');
    expect(document.body.textContent).not.toContain('Code Execution');
    expect(document.body.textContent).not.toContain('Deep Search');
  });

  it('hides code execution tooling for Gemini image-generation models', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-3.1-flash-image-preview"
          toolStates={createChatToolToggleStatesFromFlags()}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    const toolsButton = document.querySelector('button[aria-label="Tools"]') as HTMLButtonElement | null;
    expect(toolsButton).not.toBeNull();

    act(() => {
      toolsButton?.click();
    });

    expect(document.body.textContent).toContain('Web Search');
    expect(document.body.textContent).not.toContain('Code Execution');
    expect(document.body.textContent).toContain('Token Calculator');
    expect(document.body.textContent).not.toContain('Deep Search');
    expect(document.body.textContent).not.toContain('Pyodide');
    expect(document.body.textContent).not.toContain('URL Context');
    expect(document.body.textContent).not.toContain('Add YouTube Video');
  });

  it('hides all unsupported built-in tools for Gemma models', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemma-3-27b-it"
          toolStates={createChatToolToggleStatesFromFlags({ localPython: true })}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    const toolsButton = document.querySelector('button[aria-label="Tools"]') as HTMLButtonElement | null;
    expect(toolsButton).not.toBeNull();

    act(() => {
      toolsButton?.click();
    });

    // Gemma supports no API tools — no grounding, no function calling — so
    // only the provider-agnostic helpers remain.
    expect(document.body.textContent).not.toContain('Web Search');
    expect(document.body.textContent).not.toContain('Deep Search');
    expect(document.body.textContent).not.toContain('Maps');
    expect(document.body.textContent).not.toContain('Pyodide');
    expect(document.body.textContent).not.toContain('Code Execution');
    expect(document.body.textContent).not.toContain('URL Context');
    expect(document.body.textContent).toContain('Token Calculator');
  });

  it('hides Gemini built-in tools on third-party provider routes', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-2.5-flash"
          providerId="openai"
          toolStates={createChatToolToggleStatesFromFlags({ googleSearch: true, codeExecution: true })}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    const toolsButton = document.querySelector('button[aria-label="Tools"]') as HTMLButtonElement | null;
    expect(toolsButton).not.toBeNull();

    act(() => {
      toolsButton?.click();
    });

    // Third-party request builders never read the Gemini tool settings, so
    // offering them would only produce dead toggles.
    expect(document.body.textContent).not.toContain('Web Search');
    expect(document.body.textContent).not.toContain('Maps');
    expect(document.body.textContent).not.toContain('Code Execution');
    expect(document.body.textContent).not.toContain('Deep Search');
    expect(document.body.textContent).not.toContain('URL Context');
    expect(document.body.textContent).not.toContain('Pyodide');
    expect(document.body.textContent).not.toContain('Token Calculator');
  });

  it('shows a combination notice when local Python and built-in tools are enabled on non-Gemini-3 models', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-2.5-pro"
          toolStates={createChatToolToggleStatesFromFlags({ googleSearch: true, localPython: true })}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    expect(document.body.textContent).toContain("This model can't combine built-in tools with Pyodide in one request.");
  });

  it('does not show a combination notice for Gemini 3 models', () => {
    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-3.1-pro-preview"
          toolStates={createChatToolToggleStatesFromFlags({ googleSearch: true, localPython: true })}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    expect(document.body.textContent).not.toContain(
      "This model can't combine built-in tools with Pyodide in one request.",
    );
  });

  it('renders enabled tool badges as native buttons', () => {
    const onToggleGoogleSearch = vi.fn();

    act(() => {
      renderer.root.render(
        <ToolsMenu
          currentModelId="gemini-3.1-pro-preview"
          toolStates={{
            ...createChatToolToggleStatesFromFlags({ googleSearch: true }),
            googleSearch: {
              isEnabled: true,
              onToggle: onToggleGoogleSearch,
            },
          }}
          toolUtilityActions={toolUtilityActions}
          disabled={false}
        />,
      );
    });

    const activeBadge = document.body.querySelector<HTMLButtonElement>('button[aria-label="Disable Web Search"]');
    expect(activeBadge).not.toBeNull();
    expect(document.body.querySelector('[role="button"][aria-label="Disable Web Search"]')).toBeNull();

    act(() => {
      activeBadge?.click();
    });

    expect(onToggleGoogleSearch).toHaveBeenCalledTimes(1);
  });
});
