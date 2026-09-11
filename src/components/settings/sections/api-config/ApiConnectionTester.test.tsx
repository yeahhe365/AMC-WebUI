import { act, type ComponentProps } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi } from 'vitest';
import { ApiConnectionTester } from './ApiConnectionTester';

describe('ApiConnectionTester', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  const renderTester = (overrides: Partial<ComponentProps<typeof ApiConnectionTester>> = {}) => {
    const props: ComponentProps<typeof ApiConnectionTester> = {
      onTest: vi.fn(),
      testStatus: 'idle',
      testMessage: null,
      isTestDisabled: false,
      ...overrides,
    };

    act(() => {
      renderer.root.render(<ApiConnectionTester {...props} />);
    });
  };

  it('renders test connection button in idle state', () => {
    renderTester();
    expect(renderer.container.textContent).toContain('Test Connection');
  });

  it('shows success message with latency and grade badge when connection succeeds', () => {
    renderTester({
      testStatus: 'success',
      latencyMs: 145,
      latencyGrade: 'fast',
    });

    expect(renderer.container.textContent).toContain('Connection Successful');
    expect(renderer.container.textContent).toContain('145ms');
    expect(renderer.container.textContent).toContain('Fast');
  });

  it('shows error message and diagnostic tip when connection fails', () => {
    renderTester({
      testStatus: 'error',
      testMessage: '401 Unauthorized: Invalid API key',
      latencyMs: 88,
      diagnosticTip: 'API Key is invalid or expired. Please check your key.',
    });

    expect(renderer.container.textContent).toContain('Connection Failed');
    expect(renderer.container.textContent).toContain('88ms');
    expect(renderer.container.textContent).toContain('401 Unauthorized');
    expect(renderer.container.textContent).toContain('Diagnostic tip:');
    expect(renderer.container.textContent).toContain('API Key is invalid or expired');
  });

  it('renders test model select dropdown when models provided', () => {
    renderTester({
      availableModels: [
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
        { id: 'gpt-4o', name: 'GPT-4o' },
      ],
      testModelId: 'gpt-5.6-sol',
      onModelChange: vi.fn(),
    });

    expect(renderer.container.textContent).toContain('Test Model');
    expect(renderer.container.querySelector('#api-test-model')).not.toBeNull();
    expect(renderer.container.querySelector('#api-test-model')?.textContent).toContain('GPT-5.6 Sol');
  });
});
