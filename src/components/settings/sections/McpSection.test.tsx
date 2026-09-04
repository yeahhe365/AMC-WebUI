import { act, type ComponentProps, useCallback, useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS } from '@/constants/settingsDefaults';
import { renderWithProviders, setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { useMcpStatusStore } from '@/stores/mcpStatusStore';
import type { AppSettings } from '@/types';
import { McpSection } from './McpSection';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMcpServerCapabilitiesMock = vi.hoisted(() => vi.fn());
const fetchMcpLogsMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/mcpApi', () => ({
  fetchMcpServerCapabilities: fetchMcpServerCapabilitiesMock,
  fetchMcpLogs: fetchMcpLogsMock,
}));

describe('McpSection', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.clearAllMocks();
    useMcpStatusStore.setState({ states: {} });
  });

  const renderMcpSection = async (overrides: Partial<ComponentProps<typeof McpSection>> = {}) => {
    await act(async () => {
      renderer.root.render(<McpSection settings={DEFAULT_APP_SETTINGS} onUpdate={vi.fn()} {...overrides} />);
    });
  };

  // McpSection is fully controlled: in production every edit flows through
  // onUpdate into persisted settings and re-renders the section. These bugs
  // only reproduce when updates feed back into the settings prop.
  const StatefulMcpSection = ({ initialSettings }: { initialSettings: AppSettings }) => {
    const [settings, setSettings] = useState(initialSettings);
    const handleUpdate = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    }, []);
    return <McpSection settings={settings} onUpdate={handleUpdate} />;
  };

  const renderStatefulMcpSection = async (initialSettings: AppSettings) => {
    await act(async () => {
      renderer.root.render(<StatefulMcpSection initialSettings={initialSettings} />);
    });
  };

  // Server cards collapse by default; editing controls live behind the
  // expand chevron keyed by the original server index.
  const expandServerCard = async (index: number) => {
    const toggle = renderer.container.querySelector(`[data-testid="mcp-card-expand-${index}"]`);
    expect(toggle).not.toBeNull();
    await act(async () => {
      fireEvent.click(toggle!);
    });
  };

  it('collapses server cards by default and expands from the header', async () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: false, transport: 'http', url: 'https://x/mcp' } as any],
    };
    await renderMcpSection({ settings });

    expect(renderer.container.querySelector('[data-testid="mcp-card-detail-0"]')).toBeNull();
    // Collapsed summary line surfaces the endpoint without expanding.
    expect(renderer.container.textContent).toContain('https://x/mcp');

    await expandServerCard(0);

    expect(renderer.container.querySelector('[data-testid="mcp-card-detail-0"]')).not.toBeNull();
    expect(within(renderer.container).getByLabelText('Name')).not.toBeNull();
  });

  it('expands a newly added server automatically', async () => {
    // Fully controlled component: use the stateful wrapper so the added
    // server feeds back into settings and actually renders a card.
    await renderStatefulMcpSection(DEFAULT_APP_SETTINGS);

    expect(renderer.container.querySelector('[data-testid="mcp-card-detail-0"]')).toBeNull();

    const addButton = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Add Server'),
    );
    await act(async () => {
      fireEvent.click(addButton!);
    });

    expect(renderer.container.querySelector('[data-testid="mcp-card-detail-0"]')).not.toBeNull();
  });

  it('updates only the edited server when multiple MCP servers share the same id', async () => {
    const onUpdate = vi.fn();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'duplicate',
          name: 'First Server',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
        {
          id: 'duplicate',
          name: 'Second Server',
          enabled: true,
          transport: 'stdio',
          command: 'node',
        },
      ],
    };

    await renderMcpSection({ settings, onUpdate });

    await expandServerCard(1);

    const nameInputs = Array.from(renderer.container.querySelectorAll<HTMLInputElement>('input')).filter(
      (input) => input.value === 'First Server' || input.value === 'Second Server',
    );
    expect(nameInputs).toHaveLength(1);

    await act(async () => {
      fireEvent.change(nameInputs[0], { target: { value: 'Renamed Second Server' } });
    });

    expect(onUpdate).toHaveBeenCalledWith('mcpServers', [
      settings.mcpServers[0],
      {
        ...settings.mcpServers[1],
        name: 'Renamed Second Server',
      },
    ]);
  });

  it('tests a server and shows discovered MCP capabilities', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [{ name: 'read_file' }],
      resources: [{ uri: 'file:///tmp/readme.md', name: 'README' }],
      resourceTemplates: [{ uriTemplate: 'file:///{path}', name: 'File' }],
      prompts: [{ name: 'summarize' }],
    });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'remote',
          name: 'Remote',
          enabled: true,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
        },
      ],
    };

    await renderMcpSection({ settings });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Test',
    );
    expect(testButton).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(fetchMcpServerCapabilitiesMock).toHaveBeenCalledWith(settings.mcpServers[0]);
    expect(renderer.container.textContent).toContain('Tools 1');
    expect(renderer.container.textContent).toContain('Resources 2');
    expect(renderer.container.textContent).toContain('Prompts 1');
  });

  it('keeps the Chinese add-server action on one line', async () => {
    const zhRenderer = renderWithProviders(<McpSection settings={DEFAULT_APP_SETTINGS} onUpdate={vi.fn()} />, {
      language: 'zh',
    });

    const addButton = Array.from(zhRenderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('添加服务器'),
    );

    expect(addButton).not.toBeUndefined();
    expect(addButton?.className).toContain('whitespace-nowrap');
    expect(addButton?.className).toContain('shrink-0');
  });

  it('adds a localized default server name in Chinese', async () => {
    const onUpdate = vi.fn();
    const zhRenderer = renderWithProviders(<McpSection settings={DEFAULT_APP_SETTINGS} onUpdate={onUpdate} />, {
      language: 'zh',
    });
    const addButton = Array.from(zhRenderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('添加服务器'),
    );

    await act(async () => {
      fireEvent.click(addButton!);
    });

    expect(onUpdate).toHaveBeenCalledWith('mcpServers', [
      expect.objectContaining({
        name: '新 MCP 服务器',
      }),
    ]);
  });

  it('keeps duplicate server ids from creating duplicate enabled control ids', async () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'duplicate',
          name: 'First Server',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
        {
          id: 'duplicate',
          name: 'Second Server',
          enabled: false,
          transport: 'stdio',
          command: 'node',
        },
      ],
    };

    await renderMcpSection({ settings });

    const enabledIds = Array.from(
      renderer.container.querySelectorAll<HTMLInputElement>('[data-mcp-server-card-actions] input[type="checkbox"]'),
    ).map((input) => input.id);

    expect(enabledIds).toHaveLength(2);
    expect(new Set(enabledIds).size).toBe(2);
    enabledIds.forEach((id) => {
      expect(renderer.container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    });
  });

  it('labels each server enable switch with its server name', async () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'first',
          name: 'First Server',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
        {
          id: 'second',
          name: 'Second Server',
          enabled: false,
          transport: 'stdio',
          command: 'node',
        },
      ],
    };

    await renderMcpSection({ settings });

    const switches = Array.from(
      renderer.container.querySelectorAll<HTMLInputElement>('[data-mcp-server-card-actions] input[type="checkbox"]'),
    );
    expect(switches).toHaveLength(2);
    expect(switches[0].getAttribute('aria-label')).toBe('First Server');
    expect(switches[1].getAttribute('aria-label')).toBe('Second Server');
  });

  it('toggles a server enabled state through the shared switch', async () => {
    const onUpdate = vi.fn();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'first',
          name: 'First Server',
          enabled: false,
          transport: 'stdio',
          command: 'npx',
        },
      ],
    };

    await renderMcpSection({ settings, onUpdate });

    const switchInput = renderer.container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(switchInput).not.toBeNull();

    await act(async () => {
      fireEvent.click(switchInput!);
    });

    expect(onUpdate).toHaveBeenCalledWith('mcpServers', [expect.objectContaining({ id: 'first', enabled: true })]);
  });

  it('copies the read-only server id to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'alpha',
          name: 'Alpha',
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
      ],
    };

    await renderMcpSection({ settings });
    await expandServerCard(0);

    const idInput = within(renderer.container).getByLabelText('Server ID') as HTMLInputElement;
    expect(idInput).toHaveProperty('readOnly', true);
    expect(idInput).toHaveValue('alpha');

    await act(async () => {
      fireEvent.click(within(renderer.container).getByLabelText('Copy server ID'));
    });

    expect(writeText).toHaveBeenCalledWith('alpha');
  });

  it('keeps capability test results when the card is collapsed and re-expanded', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [{ name: 'read_file' }],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'alpha',
          name: 'Alpha',
          enabled: true,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
        },
      ],
    };

    await renderStatefulMcpSection(settings);

    await expandServerCard(0);

    await act(async () => {
      fireEvent.click(within(renderer.container).getByRole('button', { name: 'Test' }));
    });

    expect(renderer.container.textContent).toContain('Tools 1');

    await expandServerCard(0);
    expect(renderer.container.querySelector('[data-testid="mcp-card-detail-0"]')).toBeNull();

    await expandServerCard(0);

    expect(renderer.container.textContent).toContain('Tools 1');
  });

  it('keeps capability test results on the tested server when an earlier server is removed', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [{ name: 'read_file' }],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    });
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'first',
          name: 'First Server',
          enabled: false,
          transport: 'stdio',
          command: 'node',
        },
        {
          id: 'second',
          name: 'Second Server',
          enabled: true,
          transport: 'http',
          url: 'https://mcp.example.com/mcp',
        },
      ],
    };

    await renderStatefulMcpSection(settings);

    await expandServerCard(1);

    const testButtons = within(renderer.container).getAllByRole('button', { name: 'Test' });
    // Only the expanded second card exposes a Test button.
    expect(testButtons).toHaveLength(1);

    await act(async () => {
      fireEvent.click(testButtons[0]);
    });
    expect(renderer.container.textContent).toContain('Tools 1');

    await act(async () => {
      fireEvent.click(within(renderer.container).getAllByLabelText('Remove MCP server')[0]);
    });

    expect(renderer.container.textContent).toContain('Second Server');
    expect(renderer.container.textContent).toContain('Tools 1');
  });

  it('shows connected dot after successful Test', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [{ name: 'a' }],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      errors: [],
    } as any);
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any],
    };
    await renderMcpSection({ settings });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Test',
    );
    expect(testButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(testButton!);
    });
    const dot = await within(renderer.container).findByTestId('mcp-status-dot-s1');
    expect(dot).toHaveAttribute('data-state', 'connected');
  });

  it('shows error dot and tooltip after failed Test', async () => {
    fetchMcpServerCapabilitiesMock.mockRejectedValue(new Error('boom'));
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any],
    };
    await renderMcpSection({ settings });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Test',
    );
    await act(async () => {
      fireEvent.click(testButton!);
    });
    const dot = await within(renderer.container).findByTestId('mcp-status-dot-s1');
    expect(dot).toHaveAttribute('data-state', 'error');
    expect(dot.getAttribute('title')).toContain('boom');
  });

  it('shows disabled dot when server is disabled and no status', async () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: false, transport: 'stdio', command: 'npx' } as any],
    };
    await renderMcpSection({ settings });
    const dot = within(renderer.container).getByTestId('mcp-status-dot-s1');
    expect(dot).toHaveAttribute('data-state', 'disabled');
  });

  it('shows connecting dot when enabled and no status yet', async () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: true, transport: 'stdio', command: 'npx' } as any],
    };
    await renderMcpSection({ settings });
    const dot = within(renderer.container).getByTestId('mcp-status-dot-s1');
    expect(dot).toHaveAttribute('data-state', 'connecting');
  });

  it('contains long server names in the card header', async () => {
    const longName = 'A very long MCP server name that should stay contained inside the card header';
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        {
          id: 'long-name',
          name: longName,
          enabled: true,
          transport: 'stdio',
          command: 'npx',
        },
      ],
    };

    await renderMcpSection({ settings });

    const serverLabel = Array.from(renderer.container.querySelectorAll('span')).find(
      (span) => span.textContent === longName,
    );
    const header = serverLabel?.closest('[data-mcp-server-card-header]');
    const actions = header?.querySelector('[data-mcp-server-card-actions]');

    expect(serverLabel?.className).toContain('truncate');
    expect(serverLabel?.parentElement?.className).toContain('min-w-0');
    expect(header?.className).toContain('sm:flex-row');
    expect(actions?.className).toContain('shrink-0');
  });

  it('renders tool table with enable toggle and updates disabledTools', async () => {
    const onUpdate = vi.fn();
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [
        { name: 'tool_a', description: 'A' },
        { name: 'tool_b', description: 'B' },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    } as any);
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any],
    };
    await renderMcpSection({ settings, onUpdate });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Test',
    );
    expect(testButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(await within(renderer.container).findByText('tool_a')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(renderer.container).getByLabelText('Disable tool_a'));
    });
    expect(onUpdate).toHaveBeenCalledWith(
      'mcpServers',
      expect.arrayContaining([expect.objectContaining({ disabledTools: ['tool_a'] })]),
    );
  });

  it('filters by transport http', async () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'HTTP', enabled: true, transport: 'http', url: 'https://x' } as any,
        { id: 's2', name: 'STDIO', enabled: true, transport: 'stdio', command: 'npx' } as any,
      ],
    };
    await renderMcpSection({ settings });
    const filterTrigger = renderer.container.querySelector<HTMLButtonElement>('#mcp-filter-select');
    expect(filterTrigger).not.toBeNull();
    fireEvent.click(filterTrigger!);
    const httpOption = Array.from(renderer.container.querySelectorAll('[role="option"]')).find(
      (option) => option.textContent === 'HTTP',
    );
    expect(httpOption).not.toBeUndefined();
    fireEvent.click(httpOption!);
    await act(async () => {});
    expect(renderer.container.textContent).toContain('HTTP');
    expect(renderer.container.textContent).not.toContain('STDIO');
  });

  it('searches by name deferred', async () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'HTTP', enabled: true, transport: 'http', url: 'https://x' } as any,
        { id: 's2', name: 'STDIO', enabled: true, transport: 'stdio', command: 'npx' } as any,
      ],
    };
    await renderMcpSection({ settings });
    const input = screen.getByPlaceholderText('Search servers') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http' } });
    await act(async () => {});
    expect(renderer.container.textContent).toContain('HTTP');
    expect(renderer.container.textContent).not.toContain('STDIO');
  });

  it('sorts up/down', async () => {
    const onUpdate = vi.fn();
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any,
        { id: 's2', name: 'S2', enabled: true, transport: 'http', url: 'https://y' } as any,
      ],
    };
    await renderMcpSection({ settings, onUpdate });

    await expandServerCard(1);

    const upButton = screen.getByLabelText('Move up - S2');
    fireEvent.click(upButton);
    expect(onUpdate).toHaveBeenCalledWith(
      'mcpServers',
      expect.arrayContaining([expect.objectContaining({ id: 's2' }), expect.objectContaining({ id: 's1' })]),
    );
    const reorderedIds = (onUpdate.mock.calls[0][1] as any[]).map((s: any) => s.id);
    expect(reorderedIds).toEqual(['s2', 's1']);
  });

  it('disables reorder buttons at the boundaries of the server list', async () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any,
        { id: 's2', name: 'S2', enabled: true, transport: 'http', url: 'https://y' } as any,
      ],
    };
    await renderMcpSection({ settings });

    await expandServerCard(0);
    const firstUp = screen.getByLabelText('Move up - S1') as HTMLButtonElement;
    const firstDown = screen.getByLabelText('Move down - S1') as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
    expect(firstDown.disabled).toBe(false);

    await expandServerCard(1);
    const lastUp = screen.getByLabelText('Move up - S2') as HTMLButtonElement;
    const lastDown = screen.getByLabelText('Move down - S2') as HTMLButtonElement;
    expect(lastUp.disabled).toBe(false);
    expect(lastDown.disabled).toBe(true);
  });

  it('renders the marketplace grid as a balanced set of external links', async () => {
    await renderMcpSection({ settings: DEFAULT_APP_SETTINGS });

    const toggle = Array.from(renderer.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Find more servers'),
    );
    expect(toggle).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(toggle!);
    });

    const grid = renderer.container.querySelector('[data-testid="mcp-marketplace-grid"]');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('sm:grid-cols-4');

    const links = Array.from(grid!.querySelectorAll('a'));
    expect(links).toHaveLength(8);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      // Each entry carries a monogram tile so the rows are visually scannable.
      expect(link.querySelector('span[aria-hidden]')?.textContent).toBeTruthy();
    }
  });

  it('renders logs tab and refreshes', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      errors: [],
    } as any);
    const fetchLogsMock = vi
      .fn()
      .mockResolvedValue({ logs: [{ level: 'info', message: 'hello', timestamp: Date.now() }] });
    fetchMcpLogsMock.mockImplementation(fetchLogsMock);
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [{ id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x' } as any],
    };
    await renderMcpSection({ settings });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Test',
    );
    expect(testButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(testButton!);
    });
    // after Test success, capabilities tabs appear; click Logs tab
    const logsTab = await within(renderer.container).findByRole('tab', { name: 'Logs' });
    await act(async () => {
      fireEvent.click(logsTab);
    });
    expect(await within(renderer.container).findByText('hello')).toBeInTheDocument();
    expect(fetchLogsMock).toHaveBeenCalledTimes(1);
    const refreshBtn = within(renderer.container).getByRole('button', { name: /Refresh/i });
    await act(async () => {
      fireEvent.click(refreshBtn);
    });
    expect(fetchLogsMock).toHaveBeenCalledTimes(2);
  });

  it('renders auto-approve toggle and disables when tool disabled', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [
        { name: 'tool_a', description: 'A' },
        { name: 'tool_b', description: 'B' },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    } as any);
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x', isTrusted: true } as any,
      ],
    };
    await renderStatefulMcpSection(settings);

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Test',
    );
    expect(testButton).not.toBeUndefined();
    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(await within(renderer.container).findByText('tool_a')).toBeInTheDocument();
    const autoApproveButton = within(renderer.container).getByLabelText('Auto-approve tool_a');
    expect(autoApproveButton).toBeInTheDocument();
    expect(autoApproveButton).not.toBeDisabled();

    const disableToggle = within(renderer.container).getByLabelText('Disable tool_a');
    await act(async () => {
      fireEvent.click(disableToggle);
    });

    expect(within(renderer.container).getByLabelText('Auto-approve tool_a')).toBeDisabled();
  });

  it('asks trust confirm when enabling non-trusted server', async () => {
    const onUpdate = vi.fn();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: false, transport: 'http', url: 'https://x', isTrusted: false } as any,
      ],
    };
    await renderMcpSection({ settings, onUpdate });

    const enableToggle = renderer.container.querySelector<HTMLInputElement>(
      '[data-testid="mcp-card-actions-0"] input[type="checkbox"]',
    );
    expect(enableToggle).not.toBeNull();
    expect(enableToggle?.checked).toBe(false);

    await act(async () => {
      fireEvent.click(enableToggle!);
    });

    // Trust dialog appears with a config preview; confirming enables + trusts.
    expect(screen.getByRole('dialog', { name: 'Trust this MCP server?' })).toBeInTheDocument();
    expect(screen.getByTestId('mcp-trust-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('mcp-trust-confirm'));
    });

    expect(onUpdate).toHaveBeenCalledWith(
      'mcpServers',
      expect.arrayContaining([expect.objectContaining({ isTrusted: true, enabled: true })]),
    );
  });

  it('does not enable non-trusted server when trust confirm cancelled', async () => {
    const onUpdate = vi.fn();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: false, transport: 'http', url: 'https://x', isTrusted: false } as any,
      ],
    };
    await renderMcpSection({ settings, onUpdate });

    const enableToggle = renderer.container.querySelector<HTMLInputElement>(
      '[data-testid="mcp-card-actions-0"] input[type="checkbox"]',
    );
    await act(async () => {
      fireEvent.click(enableToggle!);
    });

    expect(screen.getByRole('dialog', { name: 'Trust this MCP server?' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mcp-trust-cancel'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('filters tools via intra-tab search', async () => {
    fetchMcpServerCapabilitiesMock.mockResolvedValue({
      tools: [
        { name: 'tool_a', description: 'Alpha' },
        { name: 'tool_b', description: 'Beta' },
      ],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    } as any);
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      mcpServers: [
        { id: 's1', name: 'S1', enabled: true, transport: 'http', url: 'https://x', isTrusted: true } as any,
      ],
    };
    await renderMcpSection({ settings });

    await expandServerCard(0);

    const testButton = Array.from(renderer.container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Test',
    );
    await act(async () => {
      fireEvent.click(testButton!);
    });

    expect(await within(renderer.container).findByText('tool_a')).toBeInTheDocument();
    expect(within(renderer.container).getByText('tool_b')).toBeInTheDocument();

    const toolSearch = within(renderer.container).getByPlaceholderText('Search tools');
    await act(async () => {
      fireEvent.change(toolSearch, { target: { value: 'tool_a' } });
    });

    expect(within(renderer.container).getByText('tool_a')).toBeInTheDocument();
    expect(within(renderer.container).queryByText('tool_b')).not.toBeInTheDocument();
  });
});
