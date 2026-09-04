import { beforeEach, expect, it } from 'vitest';
import { useMcpStatusStore } from './mcpStatusStore';

beforeEach(() => {
  useMcpStatusStore.setState({ states: {} });
});

it('sets and gets status', () => {
  useMcpStatusStore.getState().setStatus('s1', { state: 'connected', lastCheckedAt: Date.now() });
  expect(useMcpStatusStore.getState().getStatus('s1')?.state).toBe('connected');
});
it('deriveStatus maps error to error', async () => {
  const { deriveStatus } = await import('@/features/mcp/mcpStatus');
  expect(deriveStatus(null, 'boom', true).state).toBe('error');
  expect(deriveStatus({ tools: [] } as any, null, false).state).toBe('disabled');
});
