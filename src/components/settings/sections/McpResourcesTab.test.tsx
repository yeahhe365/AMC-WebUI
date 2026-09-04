import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpResourcesTab } from './McpResourcesTab';
import { McpPromptsTab } from './McpPromptsTab';
import * as mcpApi from '@/services/api/mcpApi';
import type { McpServerConfig } from '@/types';

const t = (key: string) => key;

const server: McpServerConfig = {
  id: 's1',
  name: 'S1',
  enabled: true,
  transport: 'http',
  url: 'https://x.example.com/mcp',
};

describe('McpResourcesTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state without resources', () => {
    render(<McpResourcesTab server={server} resources={[]} templates={[]} t={t} />);
    expect(screen.getByText('settingsMcpEmptyResources')).toBeInTheDocument();
  });

  it('expands a row, reads the resource and shows the text preview', async () => {
    const readSpy = vi.spyOn(mcpApi, 'fetchMcpResource').mockResolvedValue({
      result: { contents: [{ uri: 'file:///a.md', text: 'hello world', mimeType: 'text/markdown' }] },
    });
    render(
      <McpResourcesTab
        server={server}
        resources={[{ uri: 'file:///a.md', name: 'A', mimeType: 'text/markdown' }]}
        templates={[]}
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId('mcp-resource-row-file:///a.md'));
    fireEvent.click(screen.getByRole('button', { name: 'settingsMcpResourcesRead' }));

    await waitFor(() => expect(screen.getByText('hello world')).toBeInTheDocument());
    expect(readSpy).toHaveBeenCalledWith(server, 'file:///a.md');
  });

  it('shows the binary placeholder when no textual content exists', async () => {
    vi.spyOn(mcpApi, 'fetchMcpResource').mockResolvedValue({
      result: { contents: [{ uri: 'file:///x.bin' }] },
    });
    render(<McpResourcesTab server={server} resources={[{ uri: 'file:///x.bin', name: 'X' }]} templates={[]} t={t} />);
    fireEvent.click(screen.getByTestId('mcp-resource-row-file:///x.bin'));
    fireEvent.click(screen.getByRole('button', { name: 'settingsMcpResourcesRead' }));
    await waitFor(() => expect(screen.getByText('settingsMcpResourceBinary')).toBeInTheDocument());
  });

  it('surfaces read errors inline', async () => {
    vi.spyOn(mcpApi, 'fetchMcpResource').mockRejectedValue(new Error('boom'));
    render(<McpResourcesTab server={server} resources={[{ uri: 'file:///e', name: 'E' }]} templates={[]} t={t} />);
    fireEvent.click(screen.getByTestId('mcp-resource-row-file:///e'));
    fireEvent.click(screen.getByRole('button', { name: 'settingsMcpResourcesRead' }));
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
  });
});

describe('McpPromptsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const prompt: mcpApi.McpPromptDefinition = {
    name: 'greet',
    description: 'Greets someone',
    arguments: [{ name: 'name', required: true }],
  };

  it('fills arguments, fetches the prompt and renders the message text', async () => {
    const getSpy = vi.spyOn(mcpApi, 'fetchMcpPrompt').mockResolvedValue({
      result: { messages: [{ role: 'user', content: { type: 'text', text: 'Hello Ada' } }] },
    });
    render(<McpPromptsTab server={server} prompts={[prompt]} t={t} />);

    fireEvent.click(screen.getByTestId('mcp-prompt-row-greet'));
    fireEvent.change(screen.getByLabelText(/name/), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'settingsMcpPromptsUse' }));

    await waitFor(() => expect(screen.getByText('Hello Ada')).toBeInTheDocument());
    expect(getSpy).toHaveBeenCalledWith(server, 'greet', { name: 'Ada' });
  });

  it('falls back to clipboard when inserting with no active session', async () => {
    vi.spyOn(mcpApi, 'fetchMcpPrompt').mockResolvedValue({
      result: { messages: [{ content: { type: 'text', text: 'PROMPT TEXT' } }] },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const draftSetter = vi.fn();
    vi.doMock('@/stores/chatDraftStore', () => ({
      useChatDraftStore: { getState: () => ({ setDraftText: draftSetter }) },
    }));

    render(<McpPromptsTab server={server} prompts={[prompt]} t={t} />);
    fireEvent.click(screen.getByTestId('mcp-prompt-row-greet'));
    fireEvent.click(screen.getByRole('button', { name: 'settingsMcpPromptsUse' }));
    await screen.findByText('PROMPT TEXT');
    fireEvent.click(screen.getByTestId('mcp-prompt-insert'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('PROMPT TEXT'));
  });
});
