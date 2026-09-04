import { describe, expect, it } from 'vitest';
import { getClipboardPastePlan } from './createFileClipboard';

const createClipboardData = ({
  html = '',
  plain = '',
  image,
}: {
  html?: string;
  plain?: string;
  image?: File;
}): DataTransfer =>
  ({
    getData: (type: string) => {
      if (type === 'text/html') return html;
      if (type === 'text/plain') return plain;
      return '';
    },
    items: image
      ? [
          {
            type: image.type,
            getAsFile: () => image,
          },
        ]
      : [],
  }) as unknown as DataTransfer;

describe('getClipboardPastePlan', () => {
  const imageFile = new File(['fake'], 'clipboard.png', { type: 'image/png' });

  it('inserts an image only when the clipboard has no text or HTML', () => {
    expect(getClipboardPastePlan(createClipboardData({ image: imageFile }), true)).toEqual({
      kind: 'image',
      file: imageFile,
    });
  });

  it('prefers HTML over a companion image thumbnail', () => {
    expect(
      getClipboardPastePlan(
        createClipboardData({
          html: '<p>Hello from docs</p>',
          plain: 'Hello from docs',
          image: imageFile,
        }),
        true,
      ),
    ).toEqual({
      kind: 'html',
      html: '<p>Hello from docs</p>',
      plain: 'Hello from docs',
    });
  });

  it('falls through to the default paste when rich-text conversion is disabled', () => {
    expect(getClipboardPastePlan(createClipboardData({ html: '<p>Hello</p>', plain: 'Hello' }), false)).toEqual({
      kind: 'default',
    });
  });
});
