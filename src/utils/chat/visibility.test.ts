import { describe, it, expect } from 'vitest';
import { getMcpToolPairs, isMcpInternalMessage } from './visibility';

describe('visibility mcp helpers', () => {
  it('identifies MCP internal pairs', () => {
    const msgs = [
      {
        id: 'm1',
        isInternalToolMessage: true,
        apiParts: [{ functionCall: { name: 'mcp_x', args: {} } }],
        toolParentMessageId: 'p1',
      } as any,
      {
        id: 'u1',
        isInternalToolMessage: true,
        apiParts: [{ functionResponse: { name: 'mcp_x', response: {} } }],
        toolParentMessageId: 'p1',
      } as any,
    ];
    expect(getMcpToolPairs(msgs).length).toBe(1);
    expect(getMcpToolPairs(msgs)[0].parentId).toBe('p1');
    expect(getMcpToolPairs(msgs)[0].calls.length).toBe(1);
    expect(getMcpToolPairs(msgs)[0].responses.length).toBe(1);
  });

  it('isMcpInternalMessage true only when both flags present', () => {
    expect(isMcpInternalMessage({ isInternalToolMessage: true, toolParentMessageId: 'p1' } as any)).toBe(true);
    expect(isMcpInternalMessage({ isInternalToolMessage: true } as any)).toBe(false);
    expect(isMcpInternalMessage({ toolParentMessageId: 'p1' } as any)).toBe(false);
    expect(isMcpInternalMessage({} as any)).toBe(false);
  });

  it('groups by parentId', () => {
    const msgs = [
      {
        id: 'm1',
        isInternalToolMessage: true,
        apiParts: [{ functionCall: { name: 'a', args: {} } }],
        toolParentMessageId: 'p1',
      } as any,
      {
        id: 'm2',
        isInternalToolMessage: true,
        apiParts: [{ functionCall: { name: 'b', args: {} } }],
        toolParentMessageId: 'p2',
      } as any,
    ];
    const pairs = getMcpToolPairs(msgs);
    expect(pairs.length).toBe(2);
  });

  it('ignores non-internal messages', () => {
    const msgs = [
      {
        id: 'm1',
        isInternalToolMessage: false,
        apiParts: [{ functionCall: { name: 'a', args: {} } }],
        toolParentMessageId: 'p1',
      } as any,
      { id: 'm2', role: 'model', content: 'hi' } as any,
    ];
    expect(getMcpToolPairs(msgs).length).toBe(0);
  });
});
