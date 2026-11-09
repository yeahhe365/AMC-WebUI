import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerAccessPasswordPrompt } from './ServerAccessPasswordPrompt';
import { useSettingsStore } from '@/stores/settingsStore';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';

const verifyServerAccessPassword = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/apiAuthHeaders', () => ({ verifyServerAccessPassword }));

const setRuntimeConfig = (config: Record<string, unknown>) => {
  (window as Window & { __AMC_RUNTIME_CONFIG__?: Record<string, unknown> }).__AMC_RUNTIME_CONFIG__ = config;
};

const setSettings = (patch: { serverAccessPassword?: string | null; isSettingsLoaded?: boolean }) => {
  useSettingsStore.setState((state) => ({
    appSettings: { ...state.appSettings, serverAccessPassword: patch.serverAccessPassword ?? null },
    isSettingsLoaded: patch.isSettingsLoaded ?? true,
  }));
};

const typeAndSubmit = (value: string) => {
  act(() => {
    fireEvent.change(screen.getByTestId('server-access-password-prompt-input'), { target: { value } });
  });
  act(() => {
    fireEvent.submit(screen.getByTestId('server-access-password-prompt-input').closest('form')!);
  });
};

describe('ServerAccessPasswordPrompt', () => {
  beforeEach(() => {
    verifyServerAccessPassword.mockReset();
    setRuntimeConfig({ serverAccessPasswordRequired: true });
    setSettings({ serverAccessPassword: null });
  });

  afterEach(() => {
    delete window.__AMC_RUNTIME_CONFIG__;
  });

  it('stays hidden on deployments that do not require a password', () => {
    setRuntimeConfig({ serverAccessPasswordRequired: false });
    render(<ServerAccessPasswordPrompt />);
    expect(screen.queryByTestId('server-access-password-prompt')).toBeNull();
  });

  it('stays hidden once the browser already holds a password', () => {
    setSettings({ serverAccessPassword: 'already-saved' });
    render(<ServerAccessPasswordPrompt />);
    expect(screen.queryByTestId('server-access-password-prompt')).toBeNull();
  });

  it('stays hidden until stored settings have loaded, then asks', () => {
    setSettings({ isSettingsLoaded: false });
    render(<ServerAccessPasswordPrompt />);
    expect(screen.queryByTestId('server-access-password-prompt')).toBeNull();

    act(() => {
      setSettings({ isSettingsLoaded: true });
    });
    expect(screen.getByTestId('server-access-password-prompt')).toBeInTheDocument();
  });

  it('saves the password only after the server accepts it', async () => {
    verifyServerAccessPassword.mockResolvedValue({ ok: true });
    render(<ServerAccessPasswordPrompt />);

    typeAndSubmit('  deploy-password  ');

    await waitFor(() => expect(useSettingsStore.getState().appSettings.serverAccessPassword).toBe('deploy-password'));
    // Trimmed before it is sent, so a stray space never becomes a 401.
    expect(verifyServerAccessPassword).toHaveBeenCalledWith('deploy-password');
    expect(screen.queryByTestId('server-access-password-prompt')).toBeNull();
  });

  it('keeps asking and reports a rejected password instead of storing it', async () => {
    verifyServerAccessPassword.mockResolvedValue({ ok: false, message: 'Invalid access password' });
    render(<ServerAccessPasswordPrompt />);

    typeAndSubmit('wrong-password');

    await waitFor(() => expect(screen.getByText(/rejected by the server/)).toBeInTheDocument());
    expect(useSettingsStore.getState().appSettings.serverAccessPassword).toBeNull();
    expect(screen.getByTestId('server-access-password-prompt')).toBeInTheDocument();
  });

  it('can be dismissed for the session', () => {
    render(<ServerAccessPasswordPrompt />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });

    expect(screen.queryByTestId('server-access-password-prompt')).toBeNull();
  });

  it('styles the input with the shared settings input class', () => {
    render(<ServerAccessPasswordPrompt />);
    expect(screen.getByTestId('server-access-password-prompt-input').className).toContain(SETTINGS_INPUT_CLASS);
  });
});
