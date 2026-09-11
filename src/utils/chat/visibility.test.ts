import { describe, it, expect } from 'vitest';
import { getMcpToolPairs, isMcpInternalMessage, pruneDanglingInternalToolMessages } from './visibility';

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

describe('pruneDanglingInternalToolMessages', () => {
  it('keeps complete tool call and response pairs', () => {
    const msgs = [
      { id: 'u0', role: 'user', content: 'hello' },
      { id: 't1_call', role: 'model', isInternalToolMessage: true, toolParentMessageId: 'm1' },
      { id: 't1_resp', role: 'user', isInternalToolMessage: true, toolParentMessageId: 'm1' },
      { id: 'm1', role: 'model', content: 'done' },
    ] as any;
    const pruned = pruneDanglingInternalToolMessages(msgs);
    expect(pruned.map((m: any) => m.id)).toEqual(['u0', 't1_call', 't1_resp', 'm1']);
  });

  it('prunes an un-responded internal tool call at the end of an aborted turn', () => {
    const msgs = [
      { id: 'u0', role: 'user', content: 'hello' },
      { id: 't1_call', role: 'model', isInternalToolMessage: true, toolParentMessageId: 'm1' },
      { id: 't1_resp', role: 'user', isInternalToolMessage: true, toolParentMessageId: 'm1' },
      { id: 't2_call', role: 'model', isInternalToolMessage: true, toolParentMessageId: 'm1' }, // aborted before response
      { id: 'm1', role: 'model', content: '', stoppedByUser: true },
    ] as any;
    const pruned = pruneDanglingInternalToolMessages(msgs, 'm1');
    expect(pruned.map((m: any) => m.id)).toEqual(['u0', 't1_call', 't1_resp', 'm1']);
  });

  it('prunes an orphan internal tool response if preceding call is missing', () => {
    const msgs = [
      { id: 'u0', role: 'user', content: 'hello' },
      { id: 't1_resp', role: 'user', isInternalToolMessage: true, toolParentMessageId: 'm1' }, // orphan
      { id: 'm1', role: 'model', content: 'done' },
    ] as any;
    const pruned = pruneDanglingInternalToolMessages(msgs);
    expect(pruned.map((m: any) => m.id)).toEqual(['u0', 'm1']);
  });
});
