import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { McpToolApprovalDialog } from './McpToolApprovalDialog';
import { useMcpApprovalStore } from '@/stores/mcpApprovalStore';
import type { McpApprovalDecision } from '@/features/mcp/toolApproval';

const openApproval = (args: Record<string, unknown> = {}) =>
  new Promise<McpApprovalDecision>((resolve) => {
    useMcpApprovalStore
      .getState()
      .openApproval({ serverId: 's1', serverName: 'FS Server', toolName: 'write_file', args }, resolve);
  });

describe('McpToolApprovalDialog', () => {
  beforeEach(() => {
    useMcpApprovalStore.setState({ pending: null });
  });

  it('renders nothing without a pending request', () => {
    const { container } = render(<McpToolApprovalDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows server, tool and args, and resolves the chosen decision', async () => {
    const promise = openApproval({ path: '/tmp/x' });
    render(<McpToolApprovalDialog />);

    expect(screen.getByText(/FS Server/)).toBeInTheDocument();
    expect(screen.getByText(/write_file/)).toBeInTheDocument();
    expect(screen.getByText(/\/tmp\/x/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mcp-approval-session'));
    await expect(promise).resolves.toBe('allow-session');
  });

  it('deny button resolves deny', async () => {
    const promise = openApproval();
    render(<McpToolApprovalDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    await expect(promise).resolves.toBe('deny');
  });
});
