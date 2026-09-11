import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UploadedFile } from '@/types';
import {
  deleteDraftFiles,
  getDraftFiles,
  getDraftFilesKey,
  rehydrateDraftFile,
  sanitizeDraftFileForStorage,
  saveDraftFiles,
} from './draftFileRecords';

let mockKvStore: Record<string, unknown> = {};

vi.mock('./indexedDbAccess', () => ({
  getKeyValue: vi.fn(async (key: string) => mockKvStore[key]),
  setKeyValue: vi.fn(async (key: string, value: unknown) => {
    mockKvStore[key] = value;
  }),
  deleteKeyValue: vi.fn(async (key: string) => {
    delete mockKvStore[key];
  }),
}));

const mockReleaseOwner = vi.fn();
const mockAcquire = vi.fn((_blob: Blob, options?: { key?: string }) => `blob:mock-url-${options?.key ?? 'anon'}`);

vi.mock('@/services/objectUrlManager', () => ({
  createManagedObjectUrl: (blob: Blob, options?: { key?: string; ownerId?: string }) => mockAcquire(blob, options),
  releaseManagedObjectUrlsByOwner: (ownerId: string) => mockReleaseOwner(ownerId),
}));

describe('draftFileRecords', () => {
  beforeEach(() => {
    mockKvStore = {};
    vi.clearAllMocks();
  });

  it('generates the expected draft files key', () => {
    expect(getDraftFilesKey('session-123')).toBe('draft_files:session-123');
  });

  describe('sanitizeDraftFileForStorage', () => {
    it('strips ephemeral properties and non-serializable fields', () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const file: UploadedFile = {
        id: 'file-1',
        name: 'test.txt',
        type: 'text/plain',
        size: 5,
        rawFile: blob,
        dataUrl: 'blob:http://localhost:8082/ephemeral-url',
        abortController: new AbortController(),
        uploadState: 'uploading',
        isProcessing: true,
        progress: 50,
      };

      const sanitized = sanitizeDraftFileForStorage(file);

      expect(sanitized.id).toBe('file-1');
      expect(sanitized.name).toBe('test.txt');
      expect(sanitized.rawFile).toBe(blob);
      expect(sanitized.dataUrl).toBeUndefined();
      expect(sanitized.abortController).toBeUndefined();
      expect(sanitized.uploadState).toBe('pending');
      expect(sanitized.isProcessing).toBe(false);
      expect(sanitized.progress).toBe(50);
    });

    it('sets uploadState to active if fileUri is present even if was processing_api', () => {
      const file: UploadedFile = {
        id: 'file-2',
        name: 'image.png',
        type: 'image/png',
        size: 1024,
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc',
        uploadState: 'processing_api',
        isProcessing: true,
      };

      const sanitized = sanitizeDraftFileForStorage(file);
      expect(sanitized.uploadState).toBe('active');
      expect(sanitized.isProcessing).toBe(false);
    });
  });

  describe('rehydrateDraftFile', () => {
    it('creates a fresh managed object URL for Blob rawFile', () => {
      const blob = new Blob(['sample data'], { type: 'image/png' });
      const file: UploadedFile = {
        id: 'f-blob',
        name: 'sample.png',
        type: 'image/png',
        size: 11,
        rawFile: blob,
      };

      const rehydrated = rehydrateDraftFile(file, 'session-456');

      expect(mockAcquire).toHaveBeenCalledWith(blob, {
        key: 'draft-file:session-456:f-blob',
        ownerId: 'draft:session-456',
      });
      expect(rehydrated.dataUrl).toBe('blob:mock-url-draft-file:session-456:f-blob');
      expect(rehydrated.isProcessing).toBe(false);
    });

    it('cleans invalid rawFile object that is not a Blob', () => {
      const file: UploadedFile = {
        id: 'f-invalid',
        name: 'test.png',
        type: 'image/png',
        size: 100,
        rawFile: {} as never,
      };

      const rehydrated = rehydrateDraftFile(file, 'session-456');
      expect(rehydrated.rawFile).toBeUndefined();
      expect(rehydrated.dataUrl).toBeUndefined();
    });
  });

  describe('saveDraftFiles and getDraftFiles', () => {
    it('saves draft files and rehydrates them with fresh URLs', async () => {
      const blob = new Blob(['image data'], { type: 'image/png' });
      const files: UploadedFile[] = [
        {
          id: 'file-a',
          name: 'photo.png',
          type: 'image/png',
          size: 10,
          rawFile: blob,
          uploadState: 'active',
        },
      ];

      await saveDraftFiles('session-xyz', files);
      expect(mockKvStore['draft_files:session-xyz']).toBeDefined();

      const retrieved = await getDraftFiles('session-xyz');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('file-a');
      expect(retrieved[0].dataUrl).toBe('blob:mock-url-draft-file:session-xyz:file-a');
    });

    it('deletes draft files when saving an empty file list', async () => {
      mockKvStore['draft_files:session-empty'] = [{ id: 'old' }];
      await saveDraftFiles('session-empty', []);
      expect(mockKvStore['draft_files:session-empty']).toBeUndefined();
      expect(mockReleaseOwner).toHaveBeenCalledWith('draft:session-empty');
    });

    it('returns empty array when no draft files are stored', async () => {
      const result = await getDraftFiles('session-none');
      expect(result).toEqual([]);
    });

    it('ignores empty sessionId gracefully', async () => {
      await saveDraftFiles('', [{ id: 'f' } as never]);
      const retrieved = await getDraftFiles('');
      expect(retrieved).toEqual([]);
      await deleteDraftFiles('');
    });
  });

  describe('deleteDraftFiles', () => {
    it('releases object URLs by owner and deletes from IndexedDB', async () => {
      mockKvStore['draft_files:session-del'] = [{ id: 'to-delete' }];

      await deleteDraftFiles('session-del');

      expect(mockReleaseOwner).toHaveBeenCalledWith('draft:session-del');
      expect(mockKvStore['draft_files:session-del']).toBeUndefined();
    });
  });
});
