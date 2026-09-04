import { installTestAnimationFrameController, type TestAnimationFrameController } from '@/test/browser/animationFrames';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioVisualizer } from './AudioVisualizer';

const VISUALIZER_BAR_COUNT = 48;

const createFakeAnalyser = (sampleValue: number): AnalyserNode =>
  ({
    fftSize: 2048,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(sampleValue),
  }) as unknown as AnalyserNode;

describe('AudioVisualizer', () => {
  const renderer = setupTestRenderer();
  let animationFrames: TestAnimationFrameController;
  let getComputedStyleSpy: ReturnType<typeof vi.spyOn>;
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let roundRect: ReturnType<typeof vi.fn>;
  let setTransform: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    animationFrames = installTestAnimationFrameController();
    roundRect = vi.fn();
    setTransform = vi.fn();

    getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (propertyName: string) => (propertyName === '--theme-bg-accent' ? '#22c55e' : ''),
    } as CSSStyleDeclaration);

    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      setTransform,
      roundRect,
      set fillStyle(_value: string) {},
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getComputedStyleSpy.mockRestore();
    getContextSpy.mockRestore();
  });

  it('reads the theme accent color once and reuses it across animation frames', () => {
    renderer.root.render(<AudioVisualizer analyser={createFakeAnalyser(0.5)} />);

    expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);

    animationFrames.flushNextFrame(16);
    animationFrames.flushNextFrame(16);
    animationFrames.flushNextFrame(16);

    expect(getComputedStyleSpy).toHaveBeenCalledTimes(1);
  });

  it('draws one bar per slot while the input carries signal', () => {
    renderer.root.render(<AudioVisualizer analyser={createFakeAnalyser(0.5)} />);
    roundRect.mockClear();

    animationFrames.flushNextFrame(16);

    expect(roundRect).toHaveBeenCalledTimes(VISUALIZER_BAR_COUNT);
  });

  it('draws nothing while the input is silent', () => {
    renderer.root.render(<AudioVisualizer analyser={createFakeAnalyser(0)} />);
    roundRect.mockClear();

    animationFrames.flushNextFrame(16);

    expect(roundRect).not.toHaveBeenCalled();
  });

  it('scales drawing to the device pixel ratio instead of drawing in raw pixels', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    renderer.root.render(<AudioVisualizer analyser={createFakeAnalyser(0.5)} />);
    setTransform.mockClear();

    animationFrames.flushNextFrame(16);

    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });
});
