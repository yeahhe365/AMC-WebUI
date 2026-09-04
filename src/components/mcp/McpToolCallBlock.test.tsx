import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpToolCallBlock } from './McpToolCallBlock';
import { toMcpFunctionName } from '@/features/mcp/mcpToolNames';
import { rememberDiscoveredTools, resetToolDisplayRegistry } from '@/features/mcp/toolDisplayNames';
import { useMcpApprovalStore } from '@/stores/mcpApprovalStore';
import { appendMcpToolProgress, beginMcpToolRun, finishMcpToolRun } from '@/stores/mcpToolRuntimeStore';

const renderSuccessBlock = () =>
  render(
    <McpToolCallBlock
      call={{ name: 'mcp_s1_tool_a_abc123', args: { a: 'x'.repeat(5000) } } as any}
      responsePart={{ functionResponse: { name: 'mcp_s1_tool_a_abc123', response: { result: 'ok' } } }}
      status="success"
    />,
  );

describe('McpToolCallBlock', () => {
  beforeEach(() => {
    resetToolDisplayRegistry();
    useMcpApprovalStore.setState({ pending: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('renders args table and response with truncation after expanding', () => {
    renderSuccessBlock();

    // Finished calls collapse by default; the header toggles them open.
    expect(screen.queryByText(/Truncated/)).toBeNull();
    fireEvent.click(screen.getByText(/mcp_s1_tool_a/));
    expect(screen.getByText(/Truncated/)).toBeInTheDocument();
  });

  it('keeps invoking calls expanded and finished calls collapsed', () => {
    const { rerender } = render(
      <McpToolCallBlock call={{ name: 'live', args: { q: 1 } } as any} responsePart={null} status="invoking" />,
    );
    // While running, the detail pane is open without any interaction.
    expect(screen.getAllByText(/"q": 1/).length).toBeGreaterThan(0);

    rerender(
      <McpToolCallBlock
        call={{ name: 'live', args: { q: 1 } } as any}
        responsePart={{ functionResponse: { name: 'live', response: { ok: true } } }}
        status="success"
      />,
    );
    // Completing collapses the block automatically.
    expect(screen.queryByText(/"ok": true/)).toBeNull();
  });

  it('marks calls left without a response as cancelled', () => {
    render(<McpToolCallBlock call={{ name: 'stopped', args: {} } as any} responsePart={null} status="cancelled" />);
    expect(screen.getByTestId('mcp-tool-cancelled')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent('Cancelled');
  });

  it('shows a readable server : tool title once discovery info is known', () => {
    const wireName = toMcpFunctionName('filesystem', 'read_file');
    rememberDiscoveredTools({
      servers: [
        {
          serverId: 'filesystem',
          serverName: 'Filesystem',
          tools: [{ name: 'read_file', description: '' }],
        },
      ],
      errors: [],
    });

    render(
      <McpToolCallBlock
        call={{ name: wireName, args: {} } as any}
        responsePart={{ functionResponse: { name: wireName, response: { ok: true } } }}
        status="success"
      />,
    );
    expect(screen.getByText('Filesystem : read_file')).toBeInTheDocument();
  });

  it('shows running with live elapsed seconds for invoking calls', () => {
    vi.useFakeTimers();
    render(<McpToolCallBlock call={{ name: 'live', args: {} } as any} responsePart={null} status="invoking" />);

    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent('Running');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent('2s');
  });

  it('flags awaiting approval instead of a plain spinner when a matching request is pending', () => {
    const wireName = toMcpFunctionName('s1', 'secret_tool');
    rememberDiscoveredTools({
      servers: [{ serverId: 's1', serverName: 'S1', tools: [{ name: 'secret_tool', description: '' }] }],
      errors: [],
    });
    useMcpApprovalStore.setState({
      pending: {
        request: { serverId: 's1', serverName: 'S1', toolName: 'secret_tool', args: {} },
        resolve: vi.fn(),
      },
    } as never);

    render(
      <McpToolCallBlock
        call={{ name: wireName, args: { path: '/tmp' } } as any}
        responsePart={null}
        status="invoking"
      />,
    );
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent('Awaiting approval');
  });

  it('lets a manual override survive status transitions', () => {
    const { rerender } = render(
      <McpToolCallBlock call={{ name: 'manual', args: {} } as any} responsePart={null} status="invoking" />,
    );
    // User collapses while running; completing must not force it back open.
    fireEvent.click(screen.getByText('manual'));
    expect(screen.queryByText(/Copy/)).toBeNull();

    rerender(
      <McpToolCallBlock
        call={{ name: 'manual', args: {} } as any}
        responsePart={{ functionResponse: { name: 'manual', response: { ok: true } } }}
        status="success"
      />,
    );
    expect(screen.queryByText(/"ok": true/)).toBeNull();
  });

  it('renders image content inline as an image element', () => {
    render(
      <McpToolCallBlock
        call={{ name: 'shot', args: {} } as any}
        responsePart={{
          functionResponse: {
            name: 'shot',
            response: {
              content: [
                { type: 'text', text: 'Screenshot taken' },
                { type: 'image', data: 'AAAA', mimeType: 'image/png' },
              ],
            },
          },
        }}
        status="success"
      />,
    );
    fireEvent.click(screen.getByText('shot'));
    const img = screen.getByAltText('tool-result-image');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(screen.getByText('Screenshot taken')).toBeInTheDocument();
  });

  it('falls back to JSON view for responses without content envelope', () => {
    render(
      <McpToolCallBlock
        call={{ name: 'plain', args: {} } as any}
        responsePart={{ functionResponse: { name: 'plain', response: { ok: true } } }}
        status="success"
      />,
    );
    fireEvent.click(screen.getByText('plain'));
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('shows live progress lines and a percent bar for the running call', () => {
    const argsRef = { target: 'page' };
    const runId = beginMcpToolRun(argsRef);

    render(<McpToolCallBlock call={{ name: 'crawler', args: argsRef } as any} responsePart={null} status="invoking" />);
    expect(screen.queryByTestId('mcp-tool-progress-log')).toBeNull();

    act(() => {
      appendMcpToolProgress(runId, { message: 'fetched page 1', progress: 1, total: 4 });
    });
    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('fetched page 1 (1/4)');

    act(() => {
      appendMcpToolProgress(runId, { message: 'fetched page 2', progress: 2, total: 4 });
    });
    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('fetched page 2 (2/4)');
    // 50% of the bar width is filled.
    expect(screen.getByTestId('mcp-tool-progress-fill')).toHaveStyle({ width: '50%' });

    finishMcpToolRun(runId, 'success');
  });

  it('retains the finished log collapsed, expanded by default on error', () => {
    const argsRef = { keep: true };
    const runId = beginMcpToolRun(argsRef);
    appendMcpToolProgress(runId, { message: 'step done' });
    finishMcpToolRun(runId, 'success');

    const { rerender } = render(
      <McpToolCallBlock
        call={{ name: 'keeper', args: argsRef } as any}
        responsePart={{ functionResponse: { name: 'keeper', response: { ok: true } } }}
        status="success"
      />,
    );
    fireEvent.click(screen.getByText('keeper'));
    // Collapsed after success, but reachable through the toggle.
    expect(screen.queryByTestId('mcp-tool-progress-log')).toBeNull();
    fireEvent.click(screen.getByTestId('mcp-tool-log-toggle'));
    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('step done');

    const errorArgs = { boom: true };
    const errorRun = beginMcpToolRun(errorArgs);
    appendMcpToolProgress(errorRun, { message: 'halfway through' });
    finishMcpToolRun(errorRun, 'error');
    rerender(<McpToolCallBlock call={{ name: 'boomer', args: errorArgs } as any} responsePart={null} status="error" />);
    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('halfway through');
  });

  it('renders no log area when the server never sent progress', () => {
    render(<McpToolCallBlock call={{ name: 'silent', args: {} } as any} responsePart={null} status="invoking" />);
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent('Running');
    expect(screen.queryByTestId('mcp-tool-progress-log')).toBeNull();
    expect(screen.queryByTestId('mcp-tool-log-toggle')).toBeNull();
  });

  it('surfaces the latest step inline in the header while running', () => {
    const argsRef = { inline: true };
    const runId = beginMcpToolRun(argsRef);

    render(<McpToolCallBlock call={{ name: 'crawler', args: argsRef } as any} responsePart={null} status="invoking" />);
    expect(screen.queryByTestId('mcp-tool-current-step')).toBeNull();

    act(() => {
      appendMcpToolProgress(runId, { message: 'fetched page 1', progress: 1, total: 4 });
    });
    expect(screen.getByTestId('mcp-tool-current-step')).toHaveTextContent('fetched page 1 (1/4)');
    // Header bar shows determinate progress without expanding the card.
    expect(screen.getByTestId('mcp-tool-progress-fill')).toHaveStyle({ width: '25%' });

    act(() => {
      appendMcpToolProgress(runId, { message: 'fetched page 2', progress: 2, total: 4 });
    });
    expect(screen.getByTestId('mcp-tool-current-step')).toHaveTextContent('fetched page 2 (2/4)');

    finishMcpToolRun(runId, 'success');
  });

  it('falls back to an indeterminate shimmer when the server reports no total', () => {
    const argsRef = { shimmer: true };
    const runId = beginMcpToolRun(argsRef);

    render(<McpToolCallBlock call={{ name: 'watcher', args: argsRef } as any} responsePart={null} status="invoking" />);
    act(() => {
      appendMcpToolProgress(runId, { message: 'polling upstream' });
    });

    expect(screen.queryByTestId('mcp-tool-progress-fill')).toBeNull();
    expect(screen.getByTestId('mcp-tool-progress-shimmer')).toBeInTheDocument();

    finishMcpToolRun(runId, 'success');
  });

  it('summarizes finished runs in the header with duration and step count', () => {
    const argsRef = { summarize: true };
    const runId = beginMcpToolRun(argsRef);
    act(() => {
      appendMcpToolProgress(runId, { message: 'step one' });
      appendMcpToolProgress(runId, { message: 'step two' });
    });
    act(() => {
      finishMcpToolRun(runId, 'success');
    });

    const { rerender } = render(
      <McpToolCallBlock call={{ name: 'summer', args: argsRef } as any} responsePart={null} status="success" />,
    );
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent(/· 2 steps/);
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent(/\d+\.\ds ·/);
    // Settled cards no longer show the stale per-second timer.
    expect(screen.getByTestId('mcp-tool-status')).not.toHaveTextContent(/Done \d/);

    const errorArgs = { summarizeError: true };
    const errorRun = beginMcpToolRun(errorArgs);
    act(() => {
      appendMcpToolProgress(errorRun, { message: 'halfway' });
      appendMcpToolProgress(errorRun, { message: 'still going' });
    });
    act(() => {
      finishMcpToolRun(errorRun, 'error');
    });
    rerender(<McpToolCallBlock call={{ name: 'summer', args: errorArgs } as any} responsePart={null} status="error" />);
    expect(screen.getByTestId('mcp-tool-status')).toHaveTextContent(/failed at step 2/);
  });

  it('stamps each log line with its relative arrival time', () => {
    const argsRef = { stamped: true };
    const runId = beginMcpToolRun(argsRef);

    render(<McpToolCallBlock call={{ name: 'timer', args: argsRef } as any} responsePart={null} status="invoking" />);
    act(() => {
      appendMcpToolProgress(runId, { message: 'first tick' });
    });

    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('+0s');
    expect(screen.getByTestId('mcp-tool-progress-log')).toHaveTextContent('first tick');

    finishMcpToolRun(runId, 'success');
  });
});
