import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistedStateStorage,
  readPersistentStorageItem,
  writePersistentStorageItem,
  removePersistentStorageItem,
} from './persistentStorage';

describe('persistentStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces repeated writes and notifies once with the flushed key', () => {
    const storageArea = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const notifyUpdate = vi.fn();
    const storage = createPersistedStateStorage({
      debounceMs: 150,
      notifyUpdate,
      storageArea,
    });

    storage.setItem('drafts', 'first');
    storage.setItem('drafts', 'second');

    expect(storageArea.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(149);
    expect(storageArea.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(storageArea.setItem).toHaveBeenCalledTimes(1);
    expect(storageArea.setItem).toHaveBeenCalledWith('drafts', 'second');
    expect(notifyUpdate).toHaveBeenCalledTimes(1);
    expect(notifyUpdate).toHaveBeenCalledWith('drafts');
  });

  it('cancels a pending write when the same key is removed', () => {
    const storageArea = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const notifyUpdate = vi.fn();
    const storage = createPersistedStateStorage({
      debounceMs: 150,
      notifyUpdate,
      storageArea,
    });

    storage.setItem('drafts', 'pending');
    storage.removeItem('drafts');
    vi.advanceTimersByTime(150);

    expect(storageArea.setItem).not.toHaveBeenCalled();
    expect(storageArea.removeItem).toHaveBeenCalledWith('drafts');
    expect(notifyUpdate).toHaveBeenCalledWith('drafts');
  });

  describe('readPersistentStorageItem, writePersistentStorageItem, removePersistentStorageItem', () => {
    it('reads, writes, and removes items safely', () => {
      const mockStorage = {
        getItem: vi.fn().mockReturnValue('stored-val'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      expect(readPersistentStorageItem('k', mockStorage)).toBe('stored-val');
      expect(writePersistentStorageItem('k', 'val', mockStorage)).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('k', 'val');

      removePersistentStorageItem('k', mockStorage);
      expect(mockStorage.removeItem).toHaveBeenCalledWith('k');
    });

    it('safely handles missing or throwing storage area', () => {
      expect(readPersistentStorageItem('k', null)).toBeNull();
      expect(writePersistentStorageItem('k', 'v', null)).toBe(false);
      expect(() => removePersistentStorageItem('k', null)).not.toThrow();

      const throwingStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('Quota exceeded');
        }),
        removeItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
      };

      expect(readPersistentStorageItem('k', throwingStorage)).toBeNull();
      expect(writePersistentStorageItem('k', 'v', throwingStorage)).toBe(false);
      expect(() => removePersistentStorageItem('k', throwingStorage)).not.toThrow();
    });
  });
});
