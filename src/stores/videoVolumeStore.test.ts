import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_VOLUME,
  VIDEO_VOLUME_STORAGE_KEY,
  resetVideoVolumeStoreForTest,
  useVideoVolumeStore,
} from './videoVolumeStore';

describe('videoVolumeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetVideoVolumeStoreForTest();
  });

  it('initializes with default values when storage is empty', () => {
    const state = useVideoVolumeStore.getState();
    expect(state.volume).toBe(DEFAULT_VIDEO_VOLUME);
    expect(state.isMuted).toBe(false);
    expect(state.lastNonZeroVolume).toBe(DEFAULT_VIDEO_VOLUME);
  });

  it('initializes from persisted localStorage values', () => {
    localStorage.setItem(
      VIDEO_VOLUME_STORAGE_KEY,
      JSON.stringify({ volume: 0.45, isMuted: true, lastNonZeroVolume: 0.45 }),
    );
    resetVideoVolumeStoreForTest();

    const state = useVideoVolumeStore.getState();
    expect(state.volume).toBe(0.45);
    expect(state.isMuted).toBe(true);
    expect(state.lastNonZeroVolume).toBe(0.45);
  });

  it('safely handles corrupted or out-of-range storage values', () => {
    localStorage.setItem(VIDEO_VOLUME_STORAGE_KEY, 'invalid-json-data');
    resetVideoVolumeStoreForTest();
    expect(useVideoVolumeStore.getState().volume).toBe(DEFAULT_VIDEO_VOLUME);

    localStorage.setItem(VIDEO_VOLUME_STORAGE_KEY, JSON.stringify({ volume: 999, isMuted: 'not-a-bool' }));
    resetVideoVolumeStoreForTest();
    expect(useVideoVolumeStore.getState().volume).toBe(1);
    expect(useVideoVolumeStore.getState().isMuted).toBe(false);
  });

  it('updates volume and synchronizes lastNonZeroVolume and localStorage', () => {
    useVideoVolumeStore.getState().setVolume(0.75);

    const state = useVideoVolumeStore.getState();
    expect(state.volume).toBe(0.75);
    expect(state.isMuted).toBe(false);
    expect(state.lastNonZeroVolume).toBe(0.75);

    const stored = JSON.parse(localStorage.getItem(VIDEO_VOLUME_STORAGE_KEY) || '{}');
    expect(stored.volume).toBe(0.75);
    expect(stored.isMuted).toBe(false);
    expect(stored.lastNonZeroVolume).toBe(0.75);
  });

  it('clamps volume to [0, 1] range', () => {
    useVideoVolumeStore.getState().setVolume(1.8);
    expect(useVideoVolumeStore.getState().volume).toBe(1);

    useVideoVolumeStore.getState().setVolume(-0.5);
    expect(useVideoVolumeStore.getState().volume).toBe(0);
    expect(useVideoVolumeStore.getState().isMuted).toBe(true);
  });

  it('automatically sets isMuted when volume reaches 0 and preserves lastNonZeroVolume', () => {
    useVideoVolumeStore.getState().setVolume(0.6);
    expect(useVideoVolumeStore.getState().lastNonZeroVolume).toBe(0.6);

    useVideoVolumeStore.getState().setVolume(0);
    const state = useVideoVolumeStore.getState();
    expect(state.volume).toBe(0);
    expect(state.isMuted).toBe(true);
    expect(state.lastNonZeroVolume).toBe(0.6);
  });

  it('toggles mute and accurately restores last non-zero volume', () => {
    useVideoVolumeStore.getState().setVolume(0.65);

    // Toggle mute -> muted
    useVideoVolumeStore.getState().toggleMute();
    let state = useVideoVolumeStore.getState();
    expect(state.isMuted).toBe(true);
    expect(state.volume).toBe(0.65);
    expect(state.lastNonZeroVolume).toBe(0.65);

    // Toggle mute again -> unmuted, restores 0.65
    useVideoVolumeStore.getState().toggleMute();
    state = useVideoVolumeStore.getState();
    expect(state.isMuted).toBe(false);
    expect(state.volume).toBe(0.65);
  });

  it('restores positive volume when unmuting from zero volume', () => {
    useVideoVolumeStore.getState().setVolume(0.5);
    useVideoVolumeStore.getState().setVolume(0); // volume is 0, isMuted is true, lastNonZeroVolume is 0.5

    useVideoVolumeStore.getState().toggleMute();
    const state = useVideoVolumeStore.getState();
    expect(state.isMuted).toBe(false);
    expect(state.volume).toBe(0.5);
  });

  it('supports explicit setMuted calls', () => {
    useVideoVolumeStore.getState().setVolume(0.8);

    useVideoVolumeStore.getState().setMuted(true);
    expect(useVideoVolumeStore.getState().isMuted).toBe(true);

    useVideoVolumeStore.getState().setMuted(false);
    expect(useVideoVolumeStore.getState().isMuted).toBe(false);
    expect(useVideoVolumeStore.getState().volume).toBe(0.8);
  });
});
