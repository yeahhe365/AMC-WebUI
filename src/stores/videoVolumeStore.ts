import { create } from 'zustand';
import { readPersistentStorageItem, writePersistentStorageItem } from './persistentStorage';

export const VIDEO_VOLUME_STORAGE_KEY = 'amc_video_player_volume';
export const DEFAULT_VIDEO_VOLUME = 1;

export interface PersistedVideoVolumeData {
  volume: number;
  isMuted: boolean;
  lastNonZeroVolume: number;
}

export interface VideoVolumeState extends PersistedVideoVolumeData {
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setMuted: (isMuted: boolean) => void;
}

const clampVolume = (val: number): number => {
  if (typeof val !== 'number' || Number.isNaN(val)) return DEFAULT_VIDEO_VOLUME;
  return Math.max(0, Math.min(1, Math.round(val * 100) / 100));
};

const loadStoredVideoVolume = (): PersistedVideoVolumeData => {
  const raw = readPersistentStorageItem(VIDEO_VOLUME_STORAGE_KEY);
  if (!raw) {
    return {
      volume: DEFAULT_VIDEO_VOLUME,
      isMuted: false,
      lastNonZeroVolume: DEFAULT_VIDEO_VOLUME,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const volume = clampVolume(parsed.volume);
      const isMuted = typeof parsed.isMuted === 'boolean' ? parsed.isMuted : volume === 0;
      const parsedLast = typeof parsed.lastNonZeroVolume === 'number' ? clampVolume(parsed.lastNonZeroVolume) : 0;
      const lastNonZeroVolume = parsedLast > 0 ? parsedLast : volume > 0 ? volume : DEFAULT_VIDEO_VOLUME;

      return {
        volume,
        isMuted,
        lastNonZeroVolume,
      };
    }
  } catch {
    // Fallback on corrupt JSON data
  }

  return {
    volume: DEFAULT_VIDEO_VOLUME,
    isMuted: false,
    lastNonZeroVolume: DEFAULT_VIDEO_VOLUME,
  };
};

const saveVideoVolume = (data: PersistedVideoVolumeData) => {
  writePersistentStorageItem(VIDEO_VOLUME_STORAGE_KEY, JSON.stringify(data));
};

export const useVideoVolumeStore = create<VideoVolumeState>((set, get) => {
  const initial = loadStoredVideoVolume();

  return {
    ...initial,

    setVolume: (newVolume: number) => {
      const clamped = clampVolume(newVolume);
      const isZero = clamped === 0;
      const nextLastNonZero = isZero ? get().lastNonZeroVolume : clamped;
      const nextMuted = isZero ? true : false;

      const nextData: PersistedVideoVolumeData = {
        volume: clamped,
        isMuted: nextMuted,
        lastNonZeroVolume: nextLastNonZero > 0 ? nextLastNonZero : DEFAULT_VIDEO_VOLUME,
      };

      saveVideoVolume(nextData);
      set(nextData);
    },

    toggleMute: () => {
      const current = get();
      if (current.isMuted || current.volume === 0) {
        // Unmute -> restore last non-zero volume
        const restoredVol = current.lastNonZeroVolume > 0 ? current.lastNonZeroVolume : DEFAULT_VIDEO_VOLUME;
        const nextData: PersistedVideoVolumeData = {
          volume: restoredVol,
          isMuted: false,
          lastNonZeroVolume: restoredVol,
        };
        saveVideoVolume(nextData);
        set(nextData);
      } else {
        // Mute -> retain non-zero volume
        const nextData: PersistedVideoVolumeData = {
          volume: current.volume,
          isMuted: true,
          lastNonZeroVolume: current.volume > 0 ? current.volume : current.lastNonZeroVolume,
        };
        saveVideoVolume(nextData);
        set(nextData);
      }
    },

    setMuted: (isMuted: boolean) => {
      const current = get();
      if (current.isMuted === isMuted) return;

      if (isMuted) {
        const nextData: PersistedVideoVolumeData = {
          volume: current.volume,
          isMuted: true,
          lastNonZeroVolume: current.volume > 0 ? current.volume : current.lastNonZeroVolume,
        };
        saveVideoVolume(nextData);
        set(nextData);
      } else {
        const restoredVol =
          current.volume > 0
            ? current.volume
            : current.lastNonZeroVolume > 0
              ? current.lastNonZeroVolume
              : DEFAULT_VIDEO_VOLUME;
        const nextData: PersistedVideoVolumeData = {
          volume: restoredVol,
          isMuted: false,
          lastNonZeroVolume: restoredVol,
        };
        saveVideoVolume(nextData);
        set(nextData);
      }
    },
  };
});

export const resetVideoVolumeStoreForTest = () => {
  const loaded = loadStoredVideoVolume();
  useVideoVolumeStore.setState(loaded);
};
