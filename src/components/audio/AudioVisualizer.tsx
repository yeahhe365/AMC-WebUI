import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
}

const VISUALIZER_BAR_COUNT = 48;
const BAR_GAP_RATIO = 0.35;
const HEIGHT_FILL_RATIO = 0.9;
const MIN_BAR_HEIGHT = 2;
const FALLBACK_CANVAS_WIDTH = 300;
const FALLBACK_CANVAS_HEIGHT = 64;

/**
 * The accent colour lives in a CSS variable, which canvas cannot read directly.
 * Re-reading every frame would thrash style resolution, so it refreshes once a
 * second at most — enough for theme switches, cheap enough for 60fps drawing.
 */
const ACCENT_REFRESH_FRAME_INTERVAL = 60;

const readAccentColor = (): string => {
  const style = getComputedStyle(document.body);
  return style.getPropertyValue('--theme-bg-accent').trim() || '#3b82f6';
};

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return;

    const sampleBuffer = new Float32Array(analyser.fftSize);
    const samplesPerBar = Math.max(1, Math.floor(sampleBuffer.length / VISUALIZER_BAR_COUNT));
    let accentColor = readAccentColor();
    let frameIndex = 0;

    const renderFrame = () => {
      animationFrameIdRef.current = requestAnimationFrame(renderFrame);
      frameIndex += 1;

      if (frameIndex % ACCENT_REFRESH_FRAME_INTERVAL === 0) {
        accentColor = readAccentColor();
      }

      // Size the backing store to the device pixel ratio so bars stay crisp
      // instead of being upscaled from a fixed 300x64 bitmap.
      const devicePixelRatio = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || FALLBACK_CANVAS_WIDTH;
      const cssHeight = canvas.clientHeight || FALLBACK_CANVAS_HEIGHT;
      const pixelWidth = Math.round(cssWidth * devicePixelRatio);
      const pixelHeight = Math.round(cssHeight * devicePixelRatio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      canvasContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      canvasContext.clearRect(0, 0, cssWidth, cssHeight);
      canvasContext.fillStyle = accentColor;

      analyser.getFloatTimeDomainData(sampleBuffer);

      const slotWidth = cssWidth / VISUALIZER_BAR_COUNT;
      const barWidth = Math.max(1, slotWidth * (1 - BAR_GAP_RATIO));
      let barX = 0;

      for (let barIndex = 0; barIndex < VISUALIZER_BAR_COUNT; barIndex += 1) {
        const sampleStart = barIndex * samplesPerBar;
        let peakAmplitude = 0;

        for (let sampleIndex = sampleStart; sampleIndex < sampleStart + samplesPerBar; sampleIndex += 1) {
          const amplitude = Math.abs(sampleBuffer[sampleIndex] ?? 0);
          if (amplitude > peakAmplitude) {
            peakAmplitude = amplitude;
          }
        }

        const barHeight = peakAmplitude * cssHeight * HEIGHT_FILL_RATIO;
        if (barHeight > MIN_BAR_HEIGHT) {
          canvasContext.beginPath();
          canvasContext.roundRect(barX, (cssHeight - barHeight) / 2, barWidth, barHeight, barWidth / 2);
          canvasContext.fill();
        }

        barX += slotWidth;
      }
    };

    renderFrame();

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      animationFrameIdRef.current = null;
    };
  }, [analyser]);

  return (
    <div className="w-full h-16 flex items-center justify-center bg-[var(--theme-bg-tertiary)]/20 rounded-xl overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
