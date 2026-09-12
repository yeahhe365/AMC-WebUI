import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssistantApiKeyDialog } from './AssistantApiKeyDialog';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';

describe('AssistantApiKeyDialog', () => {
  beforeEach(() => {
    useSettingsAssistantStore.setState({
      status: 'idle',
      items: [],
      pendingKeyRequest: null,
    });
  });

  it('renders nothing when there is no pending key request', () => {
    const { container } = render(<AssistantApiKeyDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders key dialog and submits key', async () => {
    const resolve = vi.fn();
    useSettingsAssistantStore.setState({
      status: 'awaiting-key',
      pendingKeyRequest: {
        connectionId: 'conn-1',
        connectionName: 'SiliconFlow',
        resolve,
      },
    });

    render(<AssistantApiKeyDialog />);

    expect(screen.getByText(/SiliconFlow/)).toBeInTheDocument();
    const input = screen.getByPlaceholderText('sk-...');
    fireEvent.change(input, { target: { value: 'sk-secret-test-key' } });

    const submitBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(submitBtn);

    expect(resolve).toHaveBeenCalledWith('sk-secret-test-key');
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
  });

  it('cancels key request', async () => {
    const resolve = vi.fn();
    useSettingsAssistantStore.setState({
      status: 'awaiting-key',
      pendingKeyRequest: {
        connectionId: 'conn-1',
        connectionName: 'SiliconFlow',
        resolve,
      },
    });

    render(<AssistantApiKeyDialog />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(resolve).toHaveBeenCalledWith(null);
    expect(useSettingsAssistantStore.getState().pendingKeyRequest).toBeNull();
  });
});
