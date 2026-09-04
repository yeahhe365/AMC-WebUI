import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/types';
import { setupTestRenderer } from '@/test/render/renderer';
import { MessageListFooter } from './MessageListFooter';

const createModelMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-model',
  role: 'model',
  content: 'Answer',
  timestamp: new Date('2026-05-08T00:00:00.000Z'),
  ...overrides,
});

describe('MessageListFooter', () => {
  const renderer = setupTestRenderer();

  it('uses a bounded loading spacer tied to the measured composer height', () => {
    renderer.render(<MessageListFooter messages={[createModelMessage({ isLoading: true })]} chatInputHeight={144} />);

    const spacer = renderer.container.firstElementChild as HTMLDivElement | null;

    expect(spacer?.style.height).toContain('52svh');
    expect(spacer?.style.height).toContain('164px');
    expect(spacer?.style.maxHeight).toContain('24rem');
    expect(spacer?.style.maxHeight).toContain('164px');
    expect(spacer?.style.height).not.toBe('85vh');
    expect(spacer?.style.transition).toContain('height 180ms ease-out');
    expect(spacer?.style.overflowAnchor).toBe('none');
  });

  it('rounds the spacer up to a stable whole pixel when the input height is fractional', () => {
    renderer.render(<MessageListFooter messages={[createModelMessage()]} chatInputHeight={160.8} />);

    const spacer = renderer.container.firstElementChild as HTMLDivElement | null;

    expect(spacer?.style.height).toBe('181px');
  });
});
