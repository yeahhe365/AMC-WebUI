import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSavedChatSessionMetadata, createUploadedFile } from '@/test/data/factories';
import { rehydrateSessionFiles } from '@/utils/chat/session';
import { deleteSession } from '@/services/db/sessionRecords';
import { appendModelVariant, switchMessageVariant } from '@/utils/chat/messageVariants';
import { createManagedObjectUrl, releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';
import { cleanupSessionFilePreviews, retainRuntimeSession } from './sessionLoaderDrafts';

afterEach(() => {
  releaseManagedObjectUrlsByOwner('session:preview-variants');
  releaseManagedObjectUrlsByOwner('other-owner');
  vi.restoreAllMocks();
});

describe('session preview cleanup', () => {
  it('releases inactive variant URLs along with the active reply when leaving the session', () => {
    let nextUrl = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:variant-preview-${nextUrl++}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const previous = {
      id: 'previous',
      role: 'model' as const,
      content: '',
      timestamp: new Date(),
      files: [createUploadedFile({ id: 'previous-file', rawFile: new Blob(['previous']) })],
    };
    const active = {
      ...previous,
      id: 'active',
      files: [createUploadedFile({ id: 'active-file', rawFile: new Blob(['active']) })],
    };
    const hydrated = rehydrateSessionFiles(
      createSavedChatSessionMetadata({
        id: 'preview-variants',
        messages: [appendModelVariant(previous, active)],
      }),
    );
    const previousUrl = hydrated.messages[0].variants![0].files![0].dataUrl;
    const activeUrl = hydrated.messages[0].files![0].dataUrl;
    cleanupSessionFilePreviews(hydrated);
    expect(revoke).toHaveBeenCalledWith(previousUrl);
    expect(revoke).toHaveBeenCalledWith(activeUrl);
  });
  it.each(['leave', 'evict', 'delete'])(
    'releases every hydrated URL exactly once after switching variants and %s',
    async (boundary) => {
      let nextUrl = 0;
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:switched-preview-${nextUrl++}`);
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      const previous = {
        id: 'previous',
        role: 'model' as const,
        content: '',
        timestamp: new Date(),
        files: [createUploadedFile({ id: 'previous-file', rawFile: new Blob(['previous']) })],
      };
      const active = {
        ...previous,
        id: 'active',
        files: [createUploadedFile({ id: 'active-file', rawFile: new Blob(['active']) })],
      };
      const hydrated = rehydrateSessionFiles(
        createSavedChatSessionMetadata({ id: 'preview-variants', messages: [appendModelVariant(previous, active)] }),
      );
      const oldUrl = hydrated.messages[0].variants![0].files![0].dataUrl;
      const activeUrl = hydrated.messages[0].files![0].dataUrl;
      const switched = switchMessageVariant(hydrated, 'active', 0);
      if (boundary === 'delete') await deleteSession(switched.id);
      else if (boundary === 'leave') cleanupSessionFilePreviews(switched);
      else {
        const other = createSavedChatSessionMetadata({ id: 'other', messages: [previous] });
        retainRuntimeSession([switched], other.id, other, { maxRetained: 1 });
      }
      expect(revoke.mock.calls.map(([url]) => url).sort()).toEqual([oldUrl, activeUrl].sort());
    },
  );

  it('cleans unmanaged uploads once while preserving URLs held by another owner', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:another-owner');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const otherUrl = createManagedObjectUrl(new Blob(['other']), { key: 'shared-preview', ownerId: 'other-owner' });
    const upload = createUploadedFile({ dataUrl: 'blob:unmanaged-upload' });
    const message = {
      id: 'preview',
      role: 'model' as const,
      content: '',
      timestamp: new Date(),
      files: [upload, createUploadedFile({ dataUrl: otherUrl })],
    };
    const session = createSavedChatSessionMetadata({
      id: 'preview-variants',
      messages: [appendModelVariant(message, message)],
    });
    cleanupSessionFilePreviews(session);
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:unmanaged-upload']);
    releaseManagedObjectUrlsByOwner('other-owner');
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:unmanaged-upload', otherUrl]);
  });
});
