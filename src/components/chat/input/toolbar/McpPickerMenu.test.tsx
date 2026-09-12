import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpPickerMenu } from './McpPickerMenu';
import { renderWithProviders } from '@/test/render/providerRenderer';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMcpRuntimeStore } from '@/stores/mcpRuntimeStore';

const seedSettings = () => {
  useSettingsStore.setState({
    appSettings: {
      ...useSettingsStore.getState().appSettings,
      mcpServers: [
        { id: 'alpha', name: 'Alpha Server', enabled: true, transport: 'http', url: 'https://a.example.com' },
        { id: 'beta', name: 'Beta Server', enabled: true, transport: 'http', url: 'https://b.example.com' },
      ],
    } as never,
  });
};

describe('McpPickerMenu', () => {
  beforeEach(() => {
    useMcpRuntimeStore.setState({ masterEnabled: true, selectedServerIds: null });
    seedSettings();
  });

  const openMenu = () => {
    renderWithProviders(<McpPickerMenu />);
    fireEvent.click(screen.getByTestId('mcp-picker-button'));
  };

  it('lists a context label, the master switch, and every enabled server', () => {
    openMenu();
    expect(screen.getByText('MCP servers for new messages')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-picker-master')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('mcp-picker-all')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Alpha Server')).toBeInTheDocument();
    expect(screen.getByText('Beta Server')).toBeInTheDocument();
  });

  it('narrows selection when a server is toggled off and shows the active count badge', async () => {
    openMenu();
    fireEvent.click(screen.getByTestId('mcp-picker-server-alpha'));

    await waitFor(() => expect(useMcpRuntimeStore.getState().selectedServerIds).toEqual(['beta']));
    act(() => {
      screen.getAllByTestId('mcp-picker-button').forEach((el) => el.blur());
    });
    expect(screen.getByTestId('mcp-picker-count')).toHaveTextContent('1');
  });

  it('master switch disables MCP entirely for the next turn', async () => {
    openMenu();
    fireEvent.click(screen.getByTestId('mcp-picker-master'));
    await waitFor(() => expect(useMcpRuntimeStore.getState().masterEnabled).toBe(false));
    expect(screen.getByTestId('mcp-picker-server-alpha')).toHaveAttribute('aria-checked', 'false');
  });

  it('hides the badge and renders no MCP row prefix when switched off', () => {
    useMcpRuntimeStore.setState({ masterEnabled: false });
    openMenu();
    expect(screen.queryByTestId('mcp-picker-count')).toBeNull();
    // Server rows must not carry the redundant "MCP" prefix label.
    expect(screen.queryByText('MCP')).toBeNull();
  });

  it('wakes the master switch with only the clicked server from the off state', async () => {
    useMcpRuntimeStore.setState({ masterEnabled: false, selectedServerIds: null });
    openMenu();
    fireEvent.click(screen.getByTestId('mcp-picker-server-beta'));

    await waitFor(() => {
      const state = useMcpRuntimeStore.getState();
      expect(state.masterEnabled).toBe(true);
      expect(state.selectedServerIds).toEqual(['beta']);
    });
  });

  it('keeps the all-servers row persistent and stateful across narrowing', async () => {
    openMenu();
    const allRow = screen.getByTestId('mcp-picker-all');
    expect(allRow).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('mcp-picker-server-alpha'));
    await waitFor(() => expect(useMcpRuntimeStore.getState().selectedServerIds).toEqual(['beta']));

    expect(allRow).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(allRow);
    await waitFor(() => expect(useMcpRuntimeStore.getState().selectedServerIds).toBeNull());
    expect(allRow).toHaveAttribute('aria-checked', 'true');
  });

  it('wakes MCP entirely when all-servers is clicked from the off state', async () => {
    useMcpRuntimeStore.setState({ masterEnabled: false });
    openMenu();

    fireEvent.click(screen.getByTestId('mcp-picker-all'));
    await waitFor(() => {
      const state = useMcpRuntimeStore.getState();
      expect(state.masterEnabled).toBe(true);
      expect(state.selectedServerIds).toBeNull();
    });
  });

  it('renders virtual MCP servers with built-in badge and allows toggling', async () => {
    const { registerVirtualMcpServer, clearVirtualMcpServers } = await import('@/features/mcp/virtualMcpRegistry');
    const unregister = registerVirtualMcpServer({
      id: 'v_provider',
      name: 'Provider Manager',
      description: 'Test virtual server',
      listTools: async () => [],
      callTool: async () => ({}),
    });

    try {
      openMenu();
      expect(screen.getByText('Provider Manager')).toBeInTheDocument();
      expect(screen.getByTestId('mcp-picker-server-v_provider')).toBeInTheDocument();
      expect(screen.getByText('Built-in')).toBeInTheDocument();
    } finally {
      unregister();
      clearVirtualMcpServers();
    }
  });

  it('omits the all-servers row when only a single server is available', () => {
    useSettingsStore.setState({
      appSettings: {
        ...useSettingsStore.getState().appSettings,
        mcpServers: [
          { id: 'solo', name: 'Solo Server', enabled: true, transport: 'http', url: 'https://solo.example.com' },
        ],
      } as never,
    });

    openMenu();
    expect(screen.getByText('Solo Server')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-picker-all')).toBeNull();
  });

  it('displays the total count badge when all servers are active and unchecks all when clicked', async () => {
    openMenu();
    // Initially all 2 servers are active, count badge is 2
    expect(screen.getByTestId('mcp-picker-count')).toHaveTextContent('2');

    // Click all-servers row when allActive: toggles to unselect all
    const allRow = screen.getByTestId('mcp-picker-all');
    expect(allRow).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(allRow);

    await waitFor(() => expect(useMcpRuntimeStore.getState().selectedServerIds).toEqual([]));
    expect(allRow).toHaveAttribute('aria-checked', 'false');
    // Shows empty hint when master is enabled but 0 servers are selected
    expect(screen.getByTestId('mcp-picker-empty-hint')).toBeInTheDocument();

    // Clicking all-servers again selects all servers
    fireEvent.click(allRow);
    await waitFor(() => expect(useMcpRuntimeStore.getState().selectedServerIds).toBeNull());
    expect(allRow).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('mcp-picker-empty-hint')).toBeNull();
  });

  it('renders disabled button with clear tooltip when no servers are available', () => {
    useSettingsStore.setState({
      appSettings: {
        ...useSettingsStore.getState().appSettings,
        mcpServers: [],
      } as never,
    });

    renderWithProviders(<McpPickerMenu />);
    const button = screen.getByTestId('mcp-picker-button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'No MCP servers configured or enabled');
  });

  it('renders grouping headers when both external and virtual servers exist', async () => {
    const { registerVirtualMcpServer, clearVirtualMcpServers } = await import('@/features/mcp/virtualMcpRegistry');
    const unregister = registerVirtualMcpServer({
      id: 'v_grouped',
      name: 'Grouped Virtual',
      description: 'Group test virtual server',
      listTools: async () => [],
      callTool: async () => ({}),
    });

    try {
      openMenu();
      expect(screen.getByText('External MCP Servers')).toBeInTheDocument();
      expect(screen.getByText('Built-in Virtual Services')).toBeInTheDocument();
      expect(screen.getByText('Grouped Virtual')).toBeInTheDocument();
    } finally {
      unregister();
      clearVirtualMcpServers();
    }
  });
});
