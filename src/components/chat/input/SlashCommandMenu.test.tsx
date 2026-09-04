import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { setupTestRenderer } from '@/test/render/renderer';
import { SlashCommandMenu } from './SlashCommandMenu';
import type { SlashCommand } from '@/types/slashCommands';

const createCommands = (): SlashCommand[] =>
  Array.from({ length: 8 }, (_, index) => ({
    name: `command-${index}`,
    description: `Command ${index}`,
    icon: 'Sparkles',
    action: () => {},
  }));

describe('SlashCommandMenu', () => {
  const renderer = setupTestRenderer();

  it('keeps clipping on the frame and scrolling on a dedicated inner container', () => {
    act(() => {
      renderer.root.render(
        <SlashCommandMenu isOpen={true} commands={createCommands()} onSelect={() => {}} selectedIndex={4} />,
      );
    });

    const frame = renderer.container.querySelector('[data-slash-command-frame="true"]');
    const scrollContainer = renderer.container.querySelector('[data-slash-command-scroll="true"]');

    expect(frame).not.toBeNull();
    expect(scrollContainer).not.toBeNull();
    expect(frame?.className.toString()).toContain('overflow-hidden');
    expect(scrollContainer?.className.toString()).toContain('overflow-y-auto');
    expect(scrollContainer?.className.toString()).not.toContain('overflow-hidden');
  });

  it('selects with a quiet row instead of an accent bar and icon tile', () => {
    act(() => {
      renderer.root.render(
        <SlashCommandMenu isOpen={true} commands={createCommands()} onSelect={() => {}} selectedIndex={0} />,
      );
    });

    const html = renderer.container.innerHTML;
    const frame = renderer.container.querySelector('[data-slash-command-frame="true"]');

    // Group headers use tracking-wide (architecture forbids widest), but quiet row invariants remain
    expect(html).toContain('tracking-wide');
    expect(html).not.toContain('tracking-widest');
    expect(html).not.toContain('w-1 h-6');
    expect(html).not.toContain('w-8 h-8');
    expect(frame?.className.toString()).not.toContain('shadow-2xl');
  });
});
