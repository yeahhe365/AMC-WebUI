import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualMcpServerCard } from './VirtualMcpServerCard';
import type { VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';

describe('VirtualMcpServerCard', () => {
  const dummyServer: VirtualMcpServer = {
    id: 'amc_provider_manager',
    name: 'AMC Provider Manager',
    description: 'Configure and test third-party providers.',
    listTools: async () => [
      {
        name: 'list_templates',
        description: 'List built-in provider templates.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'create_connection',
        description: 'Create a provider connection.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID' },
          },
          required: ['templateId'],
        },
      },
    ],
    callTool: async () => ({ status: 'ok' }),
  };

  const t = (k: string) => k;

  it('renders server header and tools count', async () => {
    render(
      <VirtualMcpServerCard
        server={dummyServer}
        isExpanded={false}
        isEnabled={true}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
        t={t}
      />,
    );

    expect(screen.getByText('AMC Provider Manager')).toBeInTheDocument();
    expect(screen.getByText(/settingsMcpVirtualBadge/)).toBeInTheDocument();
    expect(screen.getByText(/settingsMcpStatusConnected/)).toBeInTheDocument();
  });

  it('renders tools list and allows toggling schema when expanded', async () => {
    const { findByText } = render(
      <VirtualMcpServerCard
        server={dummyServer}
        isExpanded={true}
        isEnabled={true}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
        t={t}
      />,
    );

    const toolName = await findByText('list_templates');
    expect(toolName).toBeInTheDocument();
    expect(await findByText('create_connection')).toBeInTheDocument();

    const schemaButton = screen.getAllByRole('button', { name: /JSON Schema/i })[1];
    fireEvent.click(schemaButton);

    expect(await findByText('templateId')).toBeInTheDocument();
  });

  it('marks allowlisted tools auto-approved and everything else as requiring approval', async () => {
    // Approval is the default, so only the allowlisted tool shows "auto-approved".
    const serverWithApproval: VirtualMcpServer = {
      ...dummyServer,
      autoApproveTools: ['list_templates'],
    };

    const { findByText } = render(
      <VirtualMcpServerCard
        server={serverWithApproval}
        isExpanded={true}
        isEnabled={true}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
        t={t}
      />,
    );

    expect(await findByText('settingsMcpAutoApproveEnabled')).toBeInTheDocument();
    expect(await findByText('settingsMcpAutoApproveDisabled')).toBeInTheDocument();
  });

  it('keeps a legacy deny-list entry gated even when the tool is allowlisted', async () => {
    const serverWithBoth: VirtualMcpServer = {
      ...dummyServer,
      autoApproveTools: ['list_templates', 'create_connection'],
      disabledAutoApproveTools: ['create_connection'],
    };

    const { findAllByText } = render(
      <VirtualMcpServerCard
        server={serverWithBoth}
        isExpanded={true}
        isEnabled={true}
        onToggleExpanded={vi.fn()}
        onToggleEnabled={vi.fn()}
        t={t}
      />,
    );

    // One allowlisted tool stays auto-approved; the deny-listed one still asks.
    expect(await findAllByText('settingsMcpAutoApproveEnabled')).toHaveLength(1);
    expect(await findAllByText('settingsMcpAutoApproveDisabled')).toHaveLength(1);
  });
});
