import { describe, expect, it, vi } from 'vitest';
import { composeSystemInstruction, stripLegacyFeatureMarkers } from './promptCompositor';

vi.mock('./promptRegistry', async () => {
  const actual = await vi.importActual<typeof import('./promptRegistry')>('./promptRegistry');
  return {
    ...actual,
    loadLiveArtifactsSystemPrompt: vi.fn(async (_lang, mode = 'inline') => `[MOCK_LA_${mode.toUpperCase()}]`),
    loadBboxSystemPrompt: vi.fn(async () => '[MOCK_BBOX]'),
    loadHdGuideSystemPrompt: vi.fn(async () => '[MOCK_HD_GUIDE]'),
    loadDeepSearchSystemPrompt: vi.fn(async () => '[MOCK_DEEP_SEARCH]'),
    loadLocalPythonSystemPrompt: vi.fn(async () => '[MOCK_LOCAL_PYTHON]'),
  };
});

describe('stripLegacyFeatureMarkers', () => {
  it('returns plain user instruction unchanged', () => {
    expect(stripLegacyFeatureMarkers('You are a helpful assistant.')).toBe('You are a helpful assistant.');
  });

  it('strips legacy Live Artifacts protocol if the entire instruction is the protocol', () => {
    expect(stripLegacyFeatureMarkers('[Live Artifacts Inline Protocol - zh]\nSome rules...')).toBe('');
  });

  it('strips legacy BBox marker if the entire instruction is bbox prompt', () => {
    expect(stripLegacyFeatureMarkers('**任务：** 请作为一位计算机视觉专家\nDetails...')).toBe('');
  });

  it('preserves user instruction when followed by legacy Live Artifacts protocol', () => {
    expect(
      stripLegacyFeatureMarkers('You are a financial analyst.\n\n[Live Artifacts Inline Protocol - zh]\nSome rules...'),
    ).toBe('You are a financial analyst.');
  });

  it('preserves user instruction when followed by legacy BBox prompt', () => {
    expect(
      stripLegacyFeatureMarkers('Answer in traditional Chinese.\n\n**任务：** 请作为一位计算机视觉专家\nDetails...'),
    ).toBe('Answer in traditional Chinese.');
  });

  it('handles empty or null values', () => {
    expect(stripLegacyFeatureMarkers('')).toBe('');
    expect(stripLegacyFeatureMarkers(null)).toBe('');
    expect(stripLegacyFeatureMarkers(undefined)).toBe('');
  });
});

describe('composeSystemInstruction', () => {
  it('returns undefined when no prompt or mode is active', async () => {
    const result = await composeSystemInstruction({});
    expect(result).toBeUndefined();
  });

  it('returns only the user instruction when no tools/modes are enabled', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'You are a helpful assistant.',
    });
    expect(result).toBe('You are a helpful assistant.');
  });

  it('layers user instruction before Live Artifacts protocol', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'You are a helpful assistant.',
      isLiveArtifactsEnabled: true,
      liveArtifactsPromptMode: 'inline',
    });
    expect(result).toBe('You are a helpful assistant.\n\n[MOCK_LA_INLINE]');
  });

  it('uses custom Live Artifacts prompt override when provided', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'You are a helpful assistant.',
      isLiveArtifactsEnabled: true,
      customLiveArtifactsPrompt: 'Custom Artifact Rules',
    });
    expect(result).toBe('You are a helpful assistant.\n\nCustom Artifact Rules');
  });

  it('layers user instruction, vision mode, and tool directives in order', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'Custom Persona',
      visionPromptMode: 'bbox',
      isDeepSearchEnabled: true,
      isLocalPythonEnabled: true,
    });
    expect(result).toBe('Custom Persona\n\n[MOCK_BBOX]\n\n[MOCK_DEEP_SEARCH]\n\n[MOCK_LOCAL_PYTHON]');
  });

  it('omits deep search prompt for Gemma models', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'Custom Persona',
      isDeepSearchEnabled: true,
      isGemmaModel: true,
    });
    expect(result).toBe('Custom Persona');
  });

  it('omits Live Artifacts when media locate directives are active, but preserves user instruction', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'My Custom Prompt',
      isLiveArtifactsEnabled: true,
      locateDirectives: ['[PDF_LOCATE: page 5]', '[VIDEO_LOCATE: 01:23]'],
    });
    // Live Artifacts is suppressed to avoid conflict with locate markers, but user instruction is preserved!
    expect(result).toBe('My Custom Prompt\n\n[PDF_LOCATE: page 5]\n\n[VIDEO_LOCATE: 01:23]');
    expect(result).not.toContain('[MOCK_LA_INLINE]');
  });

  it('includes Live Artifacts when locateDirectives is empty', async () => {
    const result = await composeSystemInstruction({
      userInstruction: 'My Custom Prompt',
      isLiveArtifactsEnabled: true,
      locateDirectives: [],
    });
    expect(result).toBe('My Custom Prompt\n\n[MOCK_LA_INLINE]');
  });

  it('supports HD Guide vision mode', async () => {
    const result = await composeSystemInstruction({
      visionPromptMode: 'hdGuide',
    });
    expect(result).toBe('[MOCK_HD_GUIDE]');
  });
});
