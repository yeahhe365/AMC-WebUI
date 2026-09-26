import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AnimatedRows } from './AnimatedRows';

interface RecordedAnimation {
  element: HTMLElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: Animation;
  cancel: Mock<() => void>;
}

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
let animations: RecordedAnimation[];
let reducedMotion: boolean;

beforeEach(() => {
  animations = [];
  reducedMotion = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation {
      const cancel = vi.fn<() => void>();
      const animation = { onfinish: null, cancel } as unknown as Animation;
      animations.push({ element: this, keyframes, options, animation, cancel });
      return animation;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.rowKey === undefined) return new DOMRect(0, 0, 200, 102);
    const tree = this.closest('[role="tree"]') as HTMLElement;
    const index = Array.from(tree.querySelectorAll('[data-row-key]')).indexOf(this);
    return new DOMRect(0, index * 34, 200, 32);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
});

function renderRows(
  keys: readonly string[],
  options: { ready?: boolean; resetKey?: string; suffix?: string } = {},
) {
  return (
    <div style={{ position: 'relative' }}>
      <AnimatedRows
        className="rows"
        label="Sessions"
        rowKeys={keys}
        ready={options.ready ?? true}
        resetKey={options.resetKey ?? 'manual'}
      >
        {keys.map((key) => (
          <li key={key} data-row-key={key} role="treeitem" style={{ opacity: 1 }}>
            {key}
            {options.suffix}
          </li>
        ))}
      </AnimatedRows>
    </div>
  );
}

function arm(): HTMLElement {
  const tree = screen.getByRole('tree');
  fireEvent.pointerDown(tree);
  return tree;
}

function finish(animation: Animation): void {
  animation.onfinish?.call(animation, new Event('finish') as AnimationPlaybackEvent);
}

describe('AnimatedRows', () => {
  it('settles initial arrivals and glides a subsequent reorder', () => {
    const view = render(renderRows(['a']));
    view.rerender(renderRows(['a', 'b']));
    expect(animations).toEqual([]);

    arm();
    view.rerender(renderRows(['b', 'a']));
    expect(animations.map((call) => [call.element.textContent, call.options.duration])).toEqual([
      ['b', 200],
      ['a', 200],
    ]);
    expect(animations[0]?.keyframes).toEqual([
      { transform: 'translate(0px, 34px)', opacity: 1 },
      { transform: 'translate(0, 0)', opacity: 1 },
    ]);
    for (const call of animations) finish(call.animation);
  });

  it('fades removed rows while surviving rows fill the gap', () => {
    const view = render(renderRows(['a', 'b', 'c']));
    const tree = arm();
    view.rerender(renderRows(['b', 'c', 'd']));
    expect(within(tree).queryByText('a')).toBeNull();
    expect(animations.map((call) => [call.element.textContent, call.options.duration])).toEqual([
      ['b', 200],
      ['c', 200],
      ['d', 100],
      ['a', 100],
    ]);
    const leaving = animations[3] as RecordedAnimation;
    expect(leaving.element.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(leaving.element.style.position).toBe('absolute');
    expect(leaving.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    finish(leaving.animation);
    expect(leaving.element.isConnected).toBe(false);
  });

  it('respects ready=false and resetKey change to settle immediately without animating', () => {
    const view = render(renderRows(['a', 'b']));
    arm();
    // ready=false (e.g. during drag)
    view.rerender(renderRows(['b', 'a'], { ready: false }));
    expect(animations).toEqual([]);

    // resetKey changed (e.g. view switch or filter)
    view.rerender(renderRows(['a', 'b'], { resetKey: 'reset-1' }));
    expect(animations).toEqual([]);
  });

  it('settles without animations when prefers-reduced-motion is active', () => {
    reducedMotion = true;
    const view = render(renderRows(['a', 'b']));
    arm();
    view.rerender(renderRows(['b', 'a']));
    expect(animations).toEqual([]);
  });
});
