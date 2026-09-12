import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { AssistantMessageList } from './AssistantMessageList';

describe('AssistantMessageList', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    useSettingsAssistantStore.setState({ status: 'idle', items: [], pendingKeyRequest: null });
  });

  it('renders user and assistant bubbles', () => {
    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[
            { kind: 'user', id: 'u1', text: 'Add DeepSeek' },
            { kind: 'assistant', id: 'a1', text: 'Added DeepSeek' },
          ]}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('Add DeepSeek');
    expect(renderer.container.textContent).toContain('Added DeepSeek');
  });

  it('renders a tool row with its status, and a change card for writes', () => {
    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[
            { kind: 'tool', id: 'call-1', name: 'create_connection', status: 'done', detail: 'key-configured' },
            { kind: 'change', id: 'ch1', connectionId: 'c1', changed: ['created'] },
          ]}
        />,
      );
    });

    expect(renderer.container.querySelector('[data-testid="assistant-tool-call-1"]')).not.toBeNull();
    expect(
      renderer.container.querySelector('[data-testid="assistant-tool-call-1"]')?.getAttribute('data-tool-name'),
    ).toBe('create_connection');
    expect(renderer.container.textContent).toContain('Create connection');
    expect(renderer.container.querySelector('[data-testid="assistant-change-c1"]')).not.toBeNull();
  });

  it('submits the typed key to the pending key request', async () => {
    const pending = useSettingsAssistantStore.getState().requestApiKey({ connectionId: 'c1', connectionName: 'DeepSeek' });

    act(() => {
      renderer.root.render(
        <AssistantMessageList
          items={[{ kind: 'key-request', id: 'k1', connectionId: 'c1', connectionName: 'DeepSeek' }]}
        />,
      );
    });

    const input = renderer.container.querySelector<HTMLTextAreaElement>('#assistant-handoff-c1');
    expect(input).not.toBeNull();

    // fireEvent.change (not a raw .value assignment) is required for a React
    // controlled input: React's value tracker ignores a direct mutation.
    await act(async () => {
      fireEvent.change(input!, { target: { value: 'sk-typed' } });
    });

    const saveButton = [...renderer.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save key',
    );
    expect(saveButton).not.toBeUndefined();
    expect(saveButton).not.toHaveProperty('disabled', true);

    await act(async () => {
      fireEvent.click(saveButton!);
    });

    await expect(pending).resolves.toBe('sk-typed');
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
  });

  it('renders an error item', () => {
    act(() => {
      renderer.root.render(<AssistantMessageList items={[{ kind: 'error', id: 'e1', message: 'boom' }]} />);
    });

    expect(renderer.container.textContent).toContain('boom');
  });
});
