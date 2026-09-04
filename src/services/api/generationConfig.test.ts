import { describe, it, expect, vi } from 'vitest';
import {
  appendFunctionDeclarationsToTools,
  buildGenerationConfig as buildGenerationConfigFromSettings,
  toCountTokensConfig,
} from './generationConfig';
import { DEFAULT_APP_SETTINGS, DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { MediaResolution, type ThinkingLevel } from '@/types';

vi.mock('@/utils/model/modelCapabilities', async () => {
  const actual = await vi.importActual<typeof import('@/utils/model/modelCapabilities')>(
    '@/utils/model/modelCapabilities',
  );

  return {
    ...actual,
    isGemini3Model: vi.fn((id: string) => id?.includes('gemini-3') && !id?.includes('transcribe')),
    isGeminiRoboticsModel: vi.fn((id: string) => id?.includes('gemini-robotics-er')),
    isGemmaModel: vi.fn((id: string) => id?.toLowerCase().includes('gemma')),
  };
});

type LegacyGenerationConfigTestOptions = {
  modelId: string;
  systemInstruction: string;
  config: {
    temperature?: number;
    topP?: number;
    topK?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  };
  showThoughts: boolean;
  thinkingBudget: number;
  isGoogleSearchEnabled?: boolean;
  isCodeExecutionEnabled?: boolean;
  isUrlContextEnabled?: boolean;
  thinkingLevel?: ThinkingLevel;
  aspectRatio?: string;
  isDeepSearchEnabled?: boolean;
  imageSize?: string;
  safetySettings?: typeof DEFAULT_APP_SETTINGS.safetySettings;
  mediaResolution?: MediaResolution;
  isLocalPythonEnabled?: boolean;
  imageOutputMode?: 'IMAGE_TEXT' | 'IMAGE_ONLY';
};

const buildGenerationConfig = (
  optionsOrModelId:
    Parameters<typeof buildGenerationConfigFromSettings>[0] | LegacyGenerationConfigTestOptions | string,
  systemInstruction = '',
  config: LegacyGenerationConfigTestOptions['config'] = {},
  showThoughts = false,
  thinkingBudget = 0,
  isGoogleSearchEnabled?: boolean,
  isCodeExecutionEnabled?: boolean,
  isUrlContextEnabled?: boolean,
  thinkingLevel?: ThinkingLevel,
  aspectRatio?: string,
  isDeepSearchEnabled?: boolean,
  imageSize?: string,
  safetySettings?: typeof DEFAULT_APP_SETTINGS.safetySettings,
  mediaResolution?: MediaResolution,
  isLocalPythonEnabled?: boolean,
  imageOutputMode?: 'IMAGE_TEXT' | 'IMAGE_ONLY',
) => {
  if (typeof optionsOrModelId === 'object' && 'settings' in optionsOrModelId) {
    return buildGenerationConfigFromSettings(optionsOrModelId);
  }

  const options =
    typeof optionsOrModelId === 'string'
      ? {
          modelId: optionsOrModelId,
          systemInstruction,
          config,
          showThoughts,
          thinkingBudget,
          isGoogleSearchEnabled,
          isCodeExecutionEnabled,
          isUrlContextEnabled,
          thinkingLevel,
          aspectRatio,
          isDeepSearchEnabled,
          imageSize,
          safetySettings,
          mediaResolution,
          isLocalPythonEnabled,
          imageOutputMode,
        }
      : optionsOrModelId;

  return buildGenerationConfigFromSettings({
    settings: {
      ...DEFAULT_APP_SETTINGS,
      modelId: options.modelId,
      systemInstruction: options.systemInstruction,
      temperature: options.config.temperature ?? DEFAULT_APP_SETTINGS.temperature,
      topP: options.config.topP ?? DEFAULT_APP_SETTINGS.topP,
      topK: options.config.topK ?? DEFAULT_APP_SETTINGS.topK,
      showThoughts: options.showThoughts,
      thinkingBudget: options.thinkingBudget,
      isGoogleSearchEnabled: options.isGoogleSearchEnabled,
      isCodeExecutionEnabled: options.isCodeExecutionEnabled,
      isUrlContextEnabled: options.isUrlContextEnabled,
      thinkingLevel: options.thinkingLevel,
      isDeepSearchEnabled: options.isDeepSearchEnabled,
      safetySettings: options.safetySettings,
      mediaResolution: options.mediaResolution,
      isLocalPythonEnabled: options.isLocalPythonEnabled,
    },
    config: {
      responseMimeType: options.config.responseMimeType,
      responseSchema: options.config.responseSchema,
    },
    aspectRatio: options.aspectRatio,
    imageSize: options.imageSize,
    isLocalPythonEnabled: options.isLocalPythonEnabled,
    imageOutputMode: options.imageOutputMode,
  });
};

describe('buildGenerationConfig', () => {
  const baseConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 64,
  };

  it('accepts object options for generation config construction', async () => {
    const config = await buildGenerationConfig({
      modelId: 'gemini-3-flash-preview',
      systemInstruction: 'sys',
      config: baseConfig,
      showThoughts: true,
      thinkingBudget: 0,
      isGoogleSearchEnabled: true,
      isCodeExecutionEnabled: false,
      isUrlContextEnabled: true,
      thinkingLevel: 'LOW',
    });

    expect(config).toEqual(
      expect.objectContaining({
        temperature: 1,
        topP: 0.95,
        topK: 64,
        systemInstruction: 'sys',
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'LOW' },
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      }),
    );
  });

  it('derives generation config from aggregated chat settings', async () => {
    const config = await buildGenerationConfig({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        modelId: 'gemini-3-flash-preview',
        systemInstruction: 'sys',
        temperature: 1,
        topP: 0.95,
        topK: 64,
        showThoughts: true,
        thinkingBudget: 0,
        isGoogleSearchEnabled: true,
        isCodeExecutionEnabled: false,
        isUrlContextEnabled: true,
        thinkingLevel: 'LOW',
      },
    });

    expect(config).toEqual(
      expect.objectContaining({
        temperature: 1,
        topP: 0.95,
        topK: 64,
        systemInstruction: 'sys',
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'LOW' },
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      }),
    );
  });

  it('returns image config with imageSize for gemini-3-pro-image-preview', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-pro-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:1',
      false,
      '2K',
    );
    expect(config.responseModalities).toEqual(['TEXT', 'IMAGE']);
    expect(config.imageConfig!.imageSize).toBe('2K');
  });

  it('normalizes stale imageSize values for gemini-3-pro-image-preview', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-pro-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:1',
      false,
      '512',
    );

    expect(config.imageConfig!.imageSize).toBe('1K');
  });

  it('defaults imageSize to 1K for gemini-3-pro-image-preview', async () => {
    const config = await buildGenerationConfig('gemini-3-pro-image-preview', 'sys', baseConfig, false, 0);
    expect(config.imageConfig!.imageSize).toBe('1K');
  });

  it('includes thinkingConfig for gemini-3.1-flash-image-preview', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      'HIGH',
      '1:1',
      false,
      '2K',
    );
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });
  });

  it('defaults gemini-3.1-flash-image-preview to MINIMAL thinking', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:1',
      false,
      '2K',
    );
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'MINIMAL',
    });
  });

  it('uses image search grounding for gemini-3.1-flash-image-preview when search is enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      true,
      false,
      false,
      undefined,
      '1:1',
      false,
      '2K',
    );

    expect(config.tools).toEqual([
      {
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      },
    ]);
  });

  it('does not enable search for Gemini image models when only deep search is enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:1',
      true,
      '2K',
    );

    expect(config.tools).toBeUndefined();
  });

  it('supports image-only output mode for Gemini image models', async () => {
    const config = await (
      buildGenerationConfig as unknown as (
        modelId: string,
        systemInstruction: string,
        config: typeof baseConfig,
        showThoughts: boolean,
        thinkingBudget: number,
        isGoogleSearchEnabled?: boolean,
        isCodeExecutionEnabled?: boolean,
        isUrlContextEnabled?: boolean,
        thinkingLevel?: ThinkingLevel,
        aspectRatio?: string,
        isDeepSearchEnabled?: boolean,
        imageSize?: string,
        safetySettings?: unknown,
        mediaResolution?: unknown,
        isLocalPythonEnabled?: boolean,
        imageOutputMode?: string,
      ) => Promise<any>
    )(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:1',
      false,
      '2K',
      undefined,
      undefined,
      false,
      'IMAGE_ONLY',
    );

    expect(config.responseModalities).toEqual(['IMAGE']);
    expect(config.imageConfig).toEqual({
      aspectRatio: '1:1',
      imageSize: '2K',
    });
  });

  it('drops unsupported panoramic ratios for gemini-3-pro-image-preview', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-pro-image-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      '1:4',
    );

    expect(config.imageConfig).not.toHaveProperty('aspectRatio');
    expect(config.imageConfig!.imageSize).toBe('1K');
  });

  it('includes thinkingConfig for Gemini 3 models', async () => {
    const config = await buildGenerationConfig('gemini-3-flash-preview', 'sys', baseConfig, false, 0);
    expect(config.thinkingConfig).toBeDefined();
    expect(config.thinkingConfig!.includeThoughts).toBe(true);
  });

  it('prefers thinkingLevel over thinkingBudget for Gemini 3 even when budget is set', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.6-flash',
      'sys',
      baseConfig,
      true,
      8000,
      false,
      false,
      false,
      'MEDIUM',
    );
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'MEDIUM',
    });
  });

  it('uses thinkingLevel when budget is 0 for Gemini 3', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'sys',
      baseConfig,
      true,
      0,
      false,
      false,
      false,
      'LOW',
    );
    expect(config.thinkingConfig!.thinkingLevel).toBe('LOW');
    expect(config.thinkingConfig!.includeThoughts).toBe(true);
  });

  it('normalizes unsupported MINIMAL thinking level for Gemini 3.1 Pro', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-pro-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      'MINIMAL',
    );
    expect(config.thinkingConfig!.thinkingLevel).toBe('LOW');
  });

  it('defaults thinkingLevel to HIGH for Gemini 3', async () => {
    const config = await buildGenerationConfig('gemini-3-flash-preview', 'sys', baseConfig, false, 0);
    expect(config.thinkingConfig!.thinkingLevel).toBe('HIGH');
  });

  it('downgrades ULTRA_HIGH to HIGH for non-Gemini 3 global media resolution', async () => {
    const config = await buildGenerationConfig(
      'gemini-2.5-flash',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH,
    );

    expect(config.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_HIGH);
  });

  it('no longer sends a thinking budget for Gemini 2.5 models', async () => {
    const config = await buildGenerationConfig('gemini-2.5-flash', 'sys', baseConfig, false, 8000);
    expect(config.thinkingConfig).toBeUndefined();
  });

  it('includes thinkingBudget config for Gemini Robotics-ER 2', async () => {
    const config = await buildGenerationConfig('gemini-robotics-er-2-preview', 'sys', baseConfig, false, 1024);
    expect(config.thinkingConfig).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
  });

  it('preserves auto thinking for Gemini Robotics-ER 2', async () => {
    const config = await buildGenerationConfig('gemini-robotics-er-2-preview', 'sys', baseConfig, false, -1);
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });
  });

  it('uses thinkingLevel when budget is 0 for Gemini Robotics-ER 2', async () => {
    const config = await buildGenerationConfig(
      'gemini-robotics-er-2-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      'LOW',
    );
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'LOW',
    });
  });

  it('adds googleSearch tool when enabled', async () => {
    const config = await buildGenerationConfig('gemini-3-flash-preview', 'sys', baseConfig, false, 0, true);
    expect(config.tools).toContainEqual({ googleSearch: {} });
  });

  it('adds googleSearch tool when deepSearch is enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      true,
    );
    expect(config.tools).toContainEqual({ googleSearch: {} });
  });

  it('adds codeExecution tool when enabled and localPython not passed', async () => {
    const config = await buildGenerationConfig('gemini-2.5-flash', 'sys', baseConfig, false, 0, false, true);
    expect(config.tools).toContainEqual({ codeExecution: {} });
  });

  it('does not add codeExecution tool for Gemini image-generation models when enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3.1-flash-image-preview',
      'sys',
      baseConfig,
      true,
      0,
      false,
      true,
      false,
      'HIGH',
    );

    expect(config.tools?.some((tool) => 'codeExecution' in tool)).toBeFalsy();
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });
  });

  it('skips codeExecution for non-image models when localPython is explicitly enabled', async () => {
    // gemini-2.5-flash is a non-G3 model that hits the standard path
    // isCodeExecutionEnabled=true at param 6, isLocalPythonEnabled=true at param 14
    const config = await buildGenerationConfig(
      'gemini-2.5-flash',
      'sys',
      baseConfig,
      false,
      0,
      false,
      true,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      true,
    );
    const hasCodeExec = config.tools?.some((tool) => 'codeExecution' in tool);
    expect(hasCodeExec).toBeFalsy();
  });

  it('adds urlContext tool when enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      true,
    );
    expect(config.tools).toContainEqual({ urlContext: {} });
  });

  it('appends deep search prompt to systemInstruction', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'Original',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      true,
    );
    expect(config.systemInstruction).toContain('Original');
    expect(config.systemInstruction).not.toBe('Original');
  });

  it('appends local python prompt to systemInstruction when enabled', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'Original',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(config.systemInstruction).toContain('Original');
    expect(config.systemInstruction).toContain('Call the `run_local_python` tool');
    expect(config.systemInstruction).toContain('plt.savefig("chart.png")');
  });

  it('uses HIGH thinking level for Gemma reasoning mode', async () => {
    const config = await buildGenerationConfig('gemma-4-31b-it', 'sys', baseConfig, true, 0);
    expect(config.systemInstruction).toBe('sys');
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'HIGH',
    });
  });

  it('uses MINIMAL thinking level for Gemma fast mode', async () => {
    const config = await buildGenerationConfig('gemma-4-31b-it', 'sys', baseConfig, false, 0);
    expect(config.systemInstruction).toBe('sys');
    expect(config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: 'MINIMAL',
    });
  });

  it('applies global mediaResolution for Gemma multimodal requests', async () => {
    const config = await buildGenerationConfig(
      'gemma-4-31b-it',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      MediaResolution.MEDIA_RESOLUTION_HIGH,
    );

    expect(config.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_HIGH);
  });

  it('does not add codeExecution for Gemma models', async () => {
    const config = await buildGenerationConfig('gemma-4-31b-it', 'sys', baseConfig, false, 0, false, true, false);

    const hasCodeExec = config.tools?.some((tool) => 'codeExecution' in tool);
    expect(hasCodeExec).toBeFalsy();
  });

  it('does not add urlContext for Gemma models', async () => {
    const config = await buildGenerationConfig('gemma-4-31b-it', 'sys', baseConfig, false, 0, false, false, true);

    const hasUrlContext = config.tools?.some((tool) => 'urlContext' in tool);
    expect(hasUrlContext).toBeFalsy();
  });

  it('does not add googleMaps for Gemma models', async () => {
    const config = await buildGenerationConfigFromSettings({
      settings: {
        ...DEFAULT_CHAT_SETTINGS,
        modelId: 'gemma-4-31b-it',
        isGoogleMapsEnabled: true,
      },
    });

    const hasGoogleMaps = config.tools?.some((tool) => 'googleMaps' in tool);
    expect(hasGoogleMaps).toBeFalsy();
  });

  it('sets systemInstruction to undefined when empty', async () => {
    const config = await buildGenerationConfig('gemini-3-flash-preview', '', baseConfig, false, 0);
    expect(config.systemInstruction).toBeUndefined();
  });

  it('applies global mediaResolution for non-Gemini-3 non-Gemma models', async () => {
    const config = await buildGenerationConfig(
      'gemini-2.5-flash',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      MediaResolution.MEDIA_RESOLUTION_HIGH,
    );
    expect(config.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_HIGH);
  });

  it('does not set global mediaResolution for Gemini 3 models', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'sys',
      baseConfig,
      false,
      0,
      false,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      MediaResolution.MEDIA_RESOLUTION_HIGH,
    );
    expect(config.mediaResolution).toBeUndefined();
  });

  it('preserves structured output config when tools are present', async () => {
    const config = await buildGenerationConfig(
      'gemini-3-flash-preview',
      'sys',
      {
        ...baseConfig,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            winner: { type: 'STRING' },
          },
        },
      },
      false,
      0,
      true,
    );
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseSchema).toEqual({
      type: 'OBJECT',
      properties: {
        winner: { type: 'STRING' },
      },
    });
  });
});

describe('toCountTokensConfig', () => {
  it('keeps system instructions and tools but drops generationConfig for Gemini Developer API token counting', () => {
    expect(
      toCountTokensConfig({
        systemInstruction: 'You are concise.',
        tools: [{ googleSearch: {} }],
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 256,
        },
        temperature: 0.2,
      }),
    ).toEqual({
      systemInstruction: 'You are concise.',
      tools: [{ googleSearch: {} }],
    });
  });
});

describe('appendFunctionDeclarationsToTools', () => {
  it('enables server-side tool invocation circulation for built-in-only Gemini 3 configs', () => {
    const config = appendFunctionDeclarationsToTools(
      'gemini-3-flash-preview',
      { tools: [{ googleSearch: {} }, { codeExecution: {} }] },
      [],
    );

    expect(config.toolConfig).toEqual({
      includeServerSideToolInvocations: true,
    });
  });

  it('keeps custom function declarations alongside built-in tools for Gemini 3 models', () => {
    const config = appendFunctionDeclarationsToTools('gemini-3-flash-preview', { tools: [{ googleSearch: {} }] }, [
      {
        name: 'run_local_python',
        description: 'Execute Python locally.',
      },
    ]);

    expect(config.tools).toEqual([
      { googleSearch: {} },
      {
        functionDeclarations: [
          {
            name: 'run_local_python',
            description: 'Execute Python locally.',
          },
        ],
      },
    ]);
    expect(config.toolConfig).toEqual({
      includeServerSideToolInvocations: true,
    });
  });

  it('keeps custom function declarations alongside built-in tools for Gemini Robotics models', () => {
    const config = appendFunctionDeclarationsToTools(
      'gemini-robotics-er-2-preview',
      { tools: [{ googleSearch: {} }] },
      [
        {
          name: 'run_local_python',
          description: 'Execute Python locally.',
        },
      ],
    );

    expect(config.tools).toEqual([
      { googleSearch: {} },
      {
        functionDeclarations: [
          {
            name: 'run_local_python',
            description: 'Execute Python locally.',
          },
        ],
      },
    ]);
    expect(config.toolConfig).toEqual({
      includeServerSideToolInvocations: true,
    });
  });

  it('does not attach mediaResolution or tools for Gemini 3.5 Transcribe', async () => {
    const config = await buildGenerationConfig({
      modelId: 'gemini-3.5-transcribe',
      systemInstruction: 'Transcribe this audio',
      config: { temperature: 1, topP: 0.95, topK: 64 },
      showThoughts: false,
      thinkingBudget: 0,
      isGoogleSearchEnabled: true,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
    });

    expect(config.mediaResolution).toBeUndefined();
    expect(config.tools).toBeUndefined();
    expect(config.thinkingConfig).toBeUndefined();
  });

  it('includes advanced generation parameters (maxOutputTokens, stopSequences, penalties, seed)', async () => {
    const config = await buildGenerationConfigFromSettings({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        modelId: 'gemini-2.5-flash',
        maxOutputTokens: 2048,
        stopSequences: ['STOP', 'END'],
        presencePenalty: 0.5,
        frequencyPenalty: 0.8,
        seed: 42,
      },
    });

    expect(config.maxOutputTokens).toBe(2048);
    expect(config.stopSequences).toEqual(['STOP', 'END']);
    expect(config.presencePenalty).toBe(0.5);
    expect(config.frequencyPenalty).toBe(0.8);
    expect(config.seed).toBe(42);
  });
});
