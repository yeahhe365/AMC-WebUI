import { beforeEach, describe, expect, it } from 'vitest';
import { selectServersForTurn, useMcpRuntimeStore } from './mcpRuntimeStore';
import type { McpServerConfig } from '../../shared/mcpServerConfig';

const server = (id: string): McpServerConfig => ({
  id,
  name: id.toUpperCase(),
  enabled: true,
  transport: 'http',
  url: `https://${id}.example.com`,
});

describe('useMcpRuntimeStore', () => {
  beforeEach(() => {
    useMcpRuntimeStore.setState({ masterEnabled: true, selectedServerIds: null });
  });

  it('starts with everything enabled and no narrowing', () => {
    const state = useMcpRuntimeStore.getState();
    expect(state.masterEnabled).toBe(true);
    expect(state.selectedServerIds).toBeNull();
  });

  it('toggleMaster flips the global switch without touching the selection', () => {
    useMcpRuntimeStore.setState({ masterEnabled: true, selectedServerIds: ['b'] });
    useMcpRuntimeStore.getState().toggleMaster();
    expect(useMcpRuntimeStore.getState().masterEnabled).toBe(false);
    expect(useMcpRuntimeStore.getState().selectedServerIds).toEqual(['b']);
    useMcpRuntimeStore.getState().toggleMaster();
    expect(useMcpRuntimeStore.getState().masterEnabled).toBe(true);
  });

  it('wakeWithServer re-enables MCP with only the clicked server active', () => {
    useMcpRuntimeStore.setState({ masterEnabled: false, selectedServerIds: ['a', 'b'] });
    useMcpRuntimeStore.getState().wakeWithServer('c');
    const state = useMcpRuntimeStore.getState();
    expect(state.masterEnabled).toBe(true);
    expect(state.selectedServerIds).toEqual(['c']);
  });

  it('selectAllServers restores everything and wakes MCP if it was off', () => {
    useMcpRuntimeStore.setState({ masterEnabled: true, selectedServerIds: ['b'] });
    useMcpRuntimeStore.getState().selectAllServers();
    expect(useMcpRuntimeStore.getState()).toMatchObject({ masterEnabled: true, selectedServerIds: null });

    useMcpRuntimeStore.setState({ masterEnabled: false, selectedServerIds: null });
    useMcpRuntimeStore.getState().selectAllServers();
    expect(useMcpRuntimeStore.getState()).toMatchObject({ masterEnabled: true, selectedServerIds: null });
  });

  it('toggleServer seeds the selection from the full set then excludes the id', () => {
    useMcpRuntimeStore.getState().toggleServer('a', ['a', 'b']);
    expect(useMcpRuntimeStore.getState().selectedServerIds).toEqual(['b']);

    // Re-adding the excluded id restores "everything" semantics (null).
    useMcpRuntimeStore.getState().toggleServer('a', ['a', 'b']);
    expect(useMcpRuntimeStore.getState().selectedServerIds).toBeNull();
  });

  it('selectServersForTurn applies master switch and narrowing', () => {
    const servers = [server('a'), server('b'), { ...server('c'), enabled: false }];

    expect(selectServersForTurn(servers, { masterEnabled: false, selectedServerIds: null })).toEqual([]);
    expect(selectServersForTurn(servers, { masterEnabled: true, selectedServerIds: null }).map((s) => s.id)).toEqual([
      'a',
      'b',
    ]);
    expect(selectServersForTurn(servers, { masterEnabled: true, selectedServerIds: ['b'] }).map((s) => s.id)).toEqual([
      'b',
    ]);
  });

  it('persists master switch and server selection', () => {
    useMcpRuntimeStore.setState({ masterEnabled: false, selectedServerIds: ['server-1'] });
    const state = useMcpRuntimeStore.getState();
    expect(state.masterEnabled).toBe(false);
    expect(state.selectedServerIds).toEqual(['server-1']);
  });
});
