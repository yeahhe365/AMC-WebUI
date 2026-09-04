import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitCompletionFeedback } from './completionFeedback';
import { playCompletionSound, showNotification } from '@/utils/browserCompletionFeedback';

vi.mock('@/utils/browserCompletionFeedback', () => ({
  playCompletionSound: vi.fn(),
  showNotification: vi.fn(),
}));

const settings = (overrides: Partial<Parameters<typeof emitCompletionFeedback>[0]> = {}) => ({
  isCompletionNotificationEnabled: false,
  isCompletionSoundEnabled: true,
  isCompletionSoundBackgroundOnly: false,
  ...overrides,
});

const feedback = (overrides: Record<string, unknown> = {}) => ({
  variant: undefined,
  notification: undefined,
  ...overrides,
});

const setHidden = (hidden: boolean) => vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);

describe('emitCompletionFeedback sound gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHidden(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('plays the success chime when the page is visible and background-only is off', async () => {
    await emitCompletionFeedback(settings(), feedback());
    expect(playCompletionSound).toHaveBeenCalledWith('success');
  });

  it('skips the sound while the page is visible when background-only is enabled', async () => {
    await emitCompletionFeedback(settings({ isCompletionSoundBackgroundOnly: true }), feedback());
    expect(playCompletionSound).not.toHaveBeenCalled();
  });

  it('plays the sound in the background when background-only is enabled', async () => {
    setHidden(true);
    await emitCompletionFeedback(settings({ isCompletionSoundBackgroundOnly: true }), feedback());
    expect(playCompletionSound).toHaveBeenCalledWith('success');
  });

  it('passes the error variant through to the chime', async () => {
    await emitCompletionFeedback(settings(), feedback({ variant: 'error' }));
    expect(playCompletionSound).toHaveBeenCalledWith('error');
  });

  it('still shows the notification while visible when background-only is enabled', async () => {
    setHidden(true);
    await emitCompletionFeedback(
      settings({ isCompletionNotificationEnabled: true, isCompletionSoundBackgroundOnly: true }),
      {
        notification: { title: 't', body: 'b' },
      },
    );
    expect(showNotification).toHaveBeenCalled();
  });
});
