import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPLETION_SOUND_COOLDOWN_MS, type CompletionSoundVariant } from './browserCompletionFeedback';

class FakeAudioParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillatorNode {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
}

const createdContexts: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createGain = vi.fn(() => new FakeGainNode());

  constructor() {
    createdContexts.push(this);
  }
}

// The module caches its AudioContext and a cooldown timestamp in module state,
// so every test loads a fresh instance and stubs window.AudioContext first.
const loadModule = async () => {
  vi.resetModules();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  return import('./browserCompletionFeedback');
};

// Each test must start on a clock safely past the previous one's cooldown.
let clockOffsetMs = 0;

describe('playCompletionSound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clockOffsetMs += COMPLETION_SOUND_COOLDOWN_MS * 10;
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + clockOffsetMs);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  const play = async (variant: CompletionSoundVariant) => {
    const { playCompletionSound } = await loadModule();
    await playCompletionSound(variant);
    return createdContexts[createdContexts.length - 1]!;
  };

  it('renders the success chime as two notes with an octave overtone each', async () => {
    const context = await play('success');

    expect(context.createOscillator).toHaveBeenCalledTimes(4); // 2 notes x 2 voices
    const oscillators = context.createOscillator.mock.results.map(({ value }) => value as FakeOscillatorNode);
    expect(oscillators.map((osc) => osc.frequency.setValueAtTime.mock.calls[0][0])).toEqual([
      659.25, 1318.5, 523.25, 1046.5,
    ]);
    expect(oscillators[0].type).toBe('sine');
  });

  it('renders the error variant with a lower, triangle-wave tone', async () => {
    const context = await play('error');

    const oscillators = context.createOscillator.mock.results.map(({ value }) => value as FakeOscillatorNode);
    expect(oscillators[0].type).toBe('triangle');
    expect(oscillators[0].frequency.setValueAtTime.mock.calls[0][0]).toBe(329.63);
  });

  it('skips a second play inside the cooldown window', async () => {
    const first = await play('success');
    expect(first.createOscillator).toHaveBeenCalledTimes(4);

    // Same module instance => same shared context; the second play must add
    // no new voices.
    const { playCompletionSound } = await import('./browserCompletionFeedback');
    await playCompletionSound('error');
    expect(first.createOscillator).toHaveBeenCalledTimes(4);

    const afterCooldown = COMPLETION_SOUND_COOLDOWN_MS + 1;
    vi.advanceTimersByTime(afterCooldown);
    await playCompletionSound('error');
    expect(first.createOscillator).toHaveBeenCalledTimes(8);
  });
});
