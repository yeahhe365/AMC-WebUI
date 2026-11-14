import { act } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { describe, expect, it } from 'vitest';
import { MessageFiles } from './MessageFiles';
import { createUploadedFile } from '@/test/data/factories';

const createImageFile = (id: string, name: string) =>
  createUploadedFile({
    id,
    name,
    size: 1024,
    dataUrl: `data:image/png;base64,${id}`,
  });

describe('MessageFiles', () => {
  const renderer = setupTestRenderer();

  it('renders non-quad multi-image rows as fixed-height cover thumbnails', () => {
    act(() => {
      renderer.root.render(
        <MessageFiles
          files={[createImageFile('image-1', 'first.png'), createImageFile('image-2', 'second.png')]}
          onImageClick={() => {}}
          messageId="message-1"
          hasContentOrAudio={false}
        />,
      );
    });

    const heightLockedItems = renderer.container.querySelectorAll('.h-40');
    const images = Array.from(renderer.container.querySelectorAll('img'));

    expect(heightLockedItems).toHaveLength(2);
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.className.includes('object-cover'))).toBe(true);
  });

  it('hides generated files in the top attachment strip when tool results render them inline', () => {
    act(() => {
      renderer.root.render(
        <MessageFiles
          files={[
            createImageFile('generated-1', 'generated-image-1.png'),
            createImageFile('plain-1', 'plain-image.png'),
          ]}
          content={'<div class="tool-result outcome-ok">done</div>'}
          onImageClick={() => {}}
          messageId="message-2"
          hasContentOrAudio
        />,
      );
    });

    const images = Array.from(renderer.container.querySelectorAll('img'));
    const sources = images.map((image) => image.getAttribute('src'));

    expect(images).toHaveLength(1);
    expect(sources).toEqual(['data:image/png;base64,plain-1']);
  });

  it('renders document file items with min-w-0 and max-w-full to prevent bubble overflow', () => {
    act(() => {
      renderer.root.render(
        <MessageFiles
          files={[
            createUploadedFile({
              id: 'doc-1',
              name: 'video.mp4',
              type: 'video/mp4',
              size: 2048,
            }),
          ]}
          onImageClick={() => {}}
          messageId="message-3"
          hasContentOrAudio
        />,
      );
    });

    const docContainer = renderer.container.querySelector('.min-w-0.w-full.max-w-full');
    expect(docContainer).not.toBeNull();
    expect(docContainer).not.toHaveClass('flex-shrink-0');
  });

  it('plays and downloads generated videos inline', () => {
    act(() => {
      renderer.root.render(
        <MessageFiles
          files={[
            createUploadedFile({
              id: 'video-1',
              name: 'generated-video-1.mp4',
              type: 'video/mp4',
              dataUrl: 'blob:video-1',
            }),
          ]}
          onImageClick={() => {}}
          messageId="message-video"
          hasContentOrAudio={false}
        />,
      );
    });
    const video = renderer.container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('blob:video-1');
    expect(video?.controls).toBe(true);
    const download = renderer.container.querySelector('a[download]');
    expect(download?.getAttribute('href')).toBe('blob:video-1');
    expect(download?.getAttribute('download')).toBe('generated-video-1.mp4');
  });
});
