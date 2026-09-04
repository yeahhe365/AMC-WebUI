import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getModelIcon } from './ModelIcon';

describe('getModelIcon', () => {
  it('renders brand icons at the larger shared size', () => {
    const geminiMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' }),
    );

    // 统一 22×22 外框容器（Brand 与 Provider 一致，解决大小不一）
    expect(geminiMarkup).toContain('width:22px');
    expect(geminiMarkup).toContain('height:22px');
  });

  it('uses the Gemini SVG brand icon for Gemini general models', () => {
    const geminiMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' }),
    );

    expect(geminiMarkup).toContain('data-model-brand-icon="gemini"');
    expect(geminiMarkup).toContain('alt="Gemini"');
  });

  it('uses the Gemma SVG brand icon for Gemma models', () => {
    const gemmaMarkup = renderToStaticMarkup(getModelIcon({ id: 'gemma-4-31b-it', name: 'Gemma 4 31B IT' }));

    expect(gemmaMarkup).toContain('data-model-brand-icon="gemma"');
    expect(gemmaMarkup).toContain('alt="Gemma"');
  });

  it('uses the Gemini SVG brand icon for TTS models', () => {
    const ttsMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' }),
    );

    expect(ttsMarkup).toContain('data-model-brand-icon="gemini"');
  });

  it('uses the Nano Banana SVG brand icon for Gemini image models', () => {
    const geminiImageMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' }),
    );

    expect(geminiImageMarkup).toContain('data-model-brand-icon="nanobanana"');
    expect(geminiImageMarkup).toContain('alt="Nano Banana"');
  });

  it('uses the Gemini SVG brand icon for Gemini Robotics models', () => {
    const roboticsMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-robotics-er-2-preview', name: 'Gemini Robotics-ER 2 Preview' }),
    );

    expect(roboticsMarkup).toContain('data-model-brand-icon="gemini"');
  });

  it('uses the Nano Banana SVG for Nano Banana Lite image models', () => {
    const liteMarkup = renderToStaticMarkup(
      getModelIcon({ id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana Lite' }),
    );

    expect(liteMarkup).toContain('data-model-brand-icon="nanobanana"');
  });
});
