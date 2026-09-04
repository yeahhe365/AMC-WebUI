import { describe, expect, it } from 'vitest';
import { GEMINI_PROVIDER_ID } from '@/types';
import { CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES, isServerCodeExecutionMode } from './codeExecution';

describe('code execution settings helpers', () => {
  it('treats Gemini code execution as server-side only when local Python is disabled', () => {
    expect(isServerCodeExecutionMode({ isCodeExecutionEnabled: true, isLocalPythonEnabled: false })).toBe(true);
    expect(isServerCodeExecutionMode({ isCodeExecutionEnabled: true, isLocalPythonEnabled: true })).toBe(false);
    expect(isServerCodeExecutionMode({ isCodeExecutionEnabled: false, isLocalPythonEnabled: false })).toBe(false);
  });

  it('keeps the text file limit aligned with the Gemini code execution policy', () => {
    expect(CODE_EXECUTION_TEXT_FILE_LIMIT_BYTES).toBe(2 * 1024 * 1024);
  });

  it('never treats a third-party session as server-side code execution even if the toggle stayed on', () => {
    expect(
      isServerCodeExecutionMode({
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: false,
        providerId: 'openai',
      }),
    ).toBe(false);
  });

  it('explicit gemini-native providerId keeps code execution active', () => {
    expect(
      isServerCodeExecutionMode({
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: false,
        providerId: GEMINI_PROVIDER_ID,
      }),
    ).toBe(true);
  });

  it('keeps Gemini-native mode behavior unchanged when providerId is absent', () => {
    expect(
      isServerCodeExecutionMode({
        isCodeExecutionEnabled: true,
        isLocalPythonEnabled: false,
      }),
    ).toBe(true);
  });
});
