import { describe, it, expect, beforeEach } from 'vitest';
import { useVirtualMcpStore, isVirtualServerActiveForTurn } from './virtualMcpStore';
import { clearVirtualMcpServers, registerVirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';

describe('virtualMcpStore', () => {
  beforeEach(() => {
    clearVirtualMcpServers();
    useVirtualMcpStore.setState({ disabledServerIds: [] });
  });

  it('defaults to enabled for newly registered virtual servers', () => {
    registerVirtualMcpServer({
      id: 'test_server',
      name: 'Test Server',
      description: 'A test server',
      listTools: async () => [],
      callTool: async () => ({}),
    });

    const store = useVirtualMcpStore.getState();
    expect(store.isServerEnabled('test_server')).toBe(true);
    expect(store.getEnabledVirtualServers()).toHaveLength(1);
  });

  it('disables and enables servers', () => {
    registerVirtualMcpServer({
      id: 'test_server',
      name: 'Test Server',
      description: 'A test server',
      listTools: async () => [],
      callTool: async () => ({}),
    });

    const store = useVirtualMcpStore.getState();
    store.setServerEnabled('test_server', false);
    expect(store.isServerEnabled('test_server')).toBe(false);
    expect(store.getEnabledVirtualServers()).toHaveLength(0);

    store.setServerEnabled('test_server', true);
    expect(store.isServerEnabled('test_server')).toBe(true);
    expect(store.getEnabledVirtualServers()).toHaveLength(1);
  });

  it('evaluates turn activity based on runtime selection and master toggle', () => {
    expect(
      isVirtualServerActiveForTurn('test_server', { masterEnabled: false, selectedServerIds: null }, true),
    ).toBe(false);

    expect(
      isVirtualServerActiveForTurn('test_server', { masterEnabled: true, selectedServerIds: null }, false),
    ).toBe(false);

    expect(
      isVirtualServerActiveForTurn('test_server', { masterEnabled: true, selectedServerIds: null }, true),
    ).toBe(true);

    expect(
      isVirtualServerActiveForTurn('test_server', { masterEnabled: true, selectedServerIds: ['other_server'] }, true),
    ).toBe(false);

    expect(
      isVirtualServerActiveForTurn('test_server', { masterEnabled: true, selectedServerIds: ['test_server'] }, true),
    ).toBe(true);
  });
});
