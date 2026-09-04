import { describe, expect, it } from 'vitest';
import { extractMcpResultSegments, summarizeMcpResultForModel } from './mcpResultSummary';

describe('summarizeMcpResultForModel', () => {
  it('replaces image parts with a text placeholder and keeps text parts', () => {
    const summarized = summarizeMcpResultForModel({
      content: [
        { type: 'text', text: 'Screenshot taken' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    }) as { content: Array<{ type: string; text?: string }> };

    expect(summarized.content[0]).toEqual({ type: 'text', text: 'Screenshot taken' });
    expect(summarized.content[1]).toEqual({ type: 'text', text: '[Image delivered to user]' });
    expect(JSON.stringify(summarized)).not.toContain('AAAA');
  });

  it('labels audio and blob resources without leaking base64', () => {
    const summarized = summarizeMcpResultForModel({
      content: [
        { type: 'audio', data: 'QUJD', mimeType: 'audio/wav' },
        { type: 'resource', resource: { uri: 'file:///x.bin', blob: 'ZZZ', mimeType: 'application/octet-stream' } },
      ],
    }) as { content: Array<{ type: string; text?: string }> };

    expect(summarized.content[0].text).toBe('[Audio delivered to user]');
    expect(summarized.content[1].text).toContain('[Binary resource file:///x.bin delivered to user]');
    expect(JSON.stringify(summarized)).not.toContain('QUJD');
    expect(JSON.stringify(summarized)).not.toContain('ZZZ');
  });

  it('keeps textual resource contents for the model', () => {
    const summarized = summarizeMcpResultForModel({
      content: [{ type: 'resource', resource: { uri: 'file:///a.md', text: '# hi', mimeType: 'text/markdown' } }],
    }) as { content: Array<{ type: string; text?: string }> };

    expect(summarized.content[0].text).toBe('# hi');
  });

  it('passes through results without a content envelope untouched', () => {
    const plain = { foo: 'bar' };
    expect(summarizeMcpResultForModel(plain)).toBe(plain);
    expect(summarizeMcpResultForModel('raw')).toBe('raw');
  });
});

describe('extractMcpResultSegments', () => {
  it('builds image and text segments from a call tool result', () => {
    const segments = extractMcpResultSegments({
      content: [
        { type: 'text', text: 'done' },
        { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' },
      ],
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ kind: 'text', text: 'done' });
    expect(segments[1]).toEqual({ kind: 'image', src: 'data:image/jpeg;base64,AAAA' });
  });

  it('falls back to a single JSON segment when no content envelope exists', () => {
    const segments = extractMcpResultSegments({ result: { ok: 1 } });
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('json');
    expect((segments[0] as { text: string }).text).toContain('"ok": 1');
  });
});
