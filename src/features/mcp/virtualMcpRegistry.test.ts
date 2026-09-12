import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVirtualMcpServers,
  findVirtualMcpServer,
  getVirtualMcpServers,
  registerVirtualMcpServer,
  type VirtualMcpServer,
} from './virtualMcpRegistry';

describe('virtualMcpRegistry', () => {
  beforeEach(() => {
    clearVirtualMcpServers();
  });

  const createDummyServer = (id: string): VirtualMcpServer => ({
    id,
    name: `Server ${id}`,
    description: `Test server ${id}`,
    listTools: async () => [{ name: 'test_tool', description: 'Test tool' }],
    callTool: vi.fn(),
  });

  it('registers and retrieves virtual servers', () => {
    const server = createDummyServer('test-1');
    const unregister = registerVirtualMcpServer(server);

    expect(getVirtualMcpServers()).toHaveLength(1);
    expect(findVirtualMcpServer('test-1')).toBe(server);

    unregister();
    expect(getVirtualMcpServers()).toHaveLength(0);
    expect(findVirtualMcpServer('test-1')).toBeUndefined();
  });

  it('replaces an existing registration when registering the same id', () => {
    const serverA = createDummyServer('test-1');
    const serverB = { ...createDummyServer('test-1'), name: 'Updated' };

    registerVirtualMcpServer(serverA);
    registerVirtualMcpServer(serverB);

    const servers = getVirtualMcpServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('Updated');
  });

  it('clears all virtual servers', () => {
    registerVirtualMcpServer(createDummyServer('test-1'));
    registerVirtualMcpServer(createDummyServer('test-2'));
    expect(getVirtualMcpServers()).toHaveLength(2);

    clearVirtualMcpServers();
    expect(getVirtualMcpServers()).toHaveLength(0);
  });
});
