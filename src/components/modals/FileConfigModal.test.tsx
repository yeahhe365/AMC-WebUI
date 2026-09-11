import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setupStoreStateReset } from '@/test/stores/reset';
import { FileConfigModal } from './FileConfigModal';
import { MediaResolution, type UploadedFile } from '@/types';

const projectRoot = path.resolve(__dirname, '../../..');
const modalPath = path.join(projectRoot, 'src/components/modals/FileConfigModal.tsx');

describe('FileConfigModal', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (
    file: UploadedFile,
    onSave = vi.fn(),
    onClose = vi.fn(),
    isGemini3 = false,
    globalMediaResolution?: MediaResolution,
  ) => {
    act(() => {
      renderer.root.render(
        <FileConfigModal
          isOpen
          onClose={onClose}
          file={file}
          onSave={onSave}
          isGemini3={isGemini3}
          globalMediaResolution={globalMediaResolution}
        />,
      );
    });

    return { onSave, onClose };
  };

  const getButtonByText = (text: string) => {
    return Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes(text)) as
      HTMLButtonElement | undefined;
  };

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const blurInput = (input: HTMLInputElement) => {
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
  };

  const openResolutionSelect = async () => {
    const button = document.querySelector<HTMLButtonElement>('#file-media-resolution');
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const buildVideoFile = (id: string): UploadedFile => ({
    id,
    name: 'demo.mp4',
    type: 'video/mp4',
    size: 128,
    uploadState: 'active',
  });

  it('does not persist empty video metadata for a new video file', async () => {
    const file = buildVideoFile('video-1');

    const { onSave, onClose } = renderModal(file);

    const saveButton = getButtonByText('Save');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(file.id, {});
    expect(onClose).toHaveBeenCalled();
  });

  it('clears existing video metadata when all video fields are removed', async () => {
    const file: UploadedFile = {
      ...buildVideoFile('video-2'),
      videoMetadata: {
        startOffset: '3s',
        endOffset: '9s',
        fps: 2,
      },
    };

    const { onSave } = renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input'));
    expect(inputs).toHaveLength(3);

    await act(async () => {
      for (const input of inputs) {
        setInputValue(input as HTMLInputElement, '');
      }
    });

    const saveButton = getButtonByText('Save');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(file.id, { videoMetadata: undefined });
  });

  it('normalizes video offsets and keeps an in-range FPS value', async () => {
    const file = buildVideoFile('video-3');

    const { onSave } = renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs).toHaveLength(3);

    await act(async () => {
      setInputValue(inputs[0], '00:10');
      setInputValue(inputs[1], '1:02:03');
      setInputValue(inputs[2], '2');
    });

    const saveButton = getButtonByText('Save');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(file.id, {
      videoMetadata: {
        startOffset: '10s',
        endOffset: '3723s',
        fps: 2,
      },
    });
  });

  it('shows an error and blocks save when FPS is outside the Gemini range', async () => {
    const file = buildVideoFile('video-4');

    const { onSave } = renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];

    await act(async () => {
      setInputValue(inputs[2], '48');
    });

    expect(document.body.textContent).toContain('FPS must be a number between 0 and 24.');

    const saveButton = getButtonByText('Save');
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows an error and blocks save when an offset cannot be parsed', async () => {
    const file = buildVideoFile('video-5');

    const { onSave } = renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];

    await act(async () => {
      setInputValue(inputs[0], 'abc');
    });

    expect(document.body.textContent).toContain('Invalid time. Use 10s, 00:10, or 01:00:00.');

    const saveButton = getButtonByText('Save');
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks save when the end offset is not after the start offset', async () => {
    const file = buildVideoFile('video-6');

    const { onSave } = renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];

    await act(async () => {
      setInputValue(inputs[0], '60s');
      setInputValue(inputs[1], '30s');
    });

    expect(document.body.textContent).toContain('End time must be after start time.');

    const saveButton = getButtonByText('Save');
    expect(saveButton?.disabled).toBe(true);

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('echoes the normalized offset back into the field on blur', async () => {
    const file = buildVideoFile('video-7');

    renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    const startInput = inputs[0];

    await act(async () => {
      setInputValue(startInput, '01:15');
    });
    await act(async () => {
      blurInput(startInput);
    });

    expect(startInput.value).toBe('75s');
  });

  it('labels the empty option with the current global detail level', async () => {
    const file: UploadedFile = {
      id: 'image-1',
      name: 'diagram.png',
      type: 'image/png',
      size: 128,
      uploadState: 'active',
    };

    renderModal(file, vi.fn(), vi.fn(), true, MediaResolution.MEDIA_RESOLUTION_HIGH);

    expect(document.body.textContent).toContain('Follow global setting (current: High (Detail))');
  });

  it('shows the configured file name in the header', () => {
    const file = buildVideoFile('video-8');

    renderModal(file);

    expect(document.body.textContent).toContain('demo.mp4');
  });

  it('avoids per-field mirrored state plus a file-sync effect', () => {
    const source = fs.readFileSync(modalPath, 'utf8');

    expect(source).not.toContain("const [startOffset, setStartOffset] = useState('')");
    expect(source).not.toContain("const [endOffset, setEndOffset] = useState('')");
    expect(source).not.toContain("const [fps, setFps] = useState('')");
    expect(source).not.toContain("const [mediaResolution, setMediaResolution] = useState<MediaResolution | ''>('')");
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(isOpen && file\) \{\s*setStartOffset/s);
  });

  it('adds visible keyboard focus styles to close and save controls', () => {
    const file = buildVideoFile('video-9');

    renderModal(file);

    const closeButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.className.includes('rounded-full'),
    );
    const saveButton = getButtonByText('Save');

    expect(closeButton?.className).toContain('focus-visible:ring-2');
    expect(saveButton?.className).toContain('focus-visible:ring-2');
  });

  it('only offers ultra-high per-part resolution for image files', async () => {
    const imageFile: UploadedFile = {
      id: 'image-1',
      name: 'diagram.png',
      type: 'image/png',
      size: 128,
      uploadState: 'active',
    };
    const videoFile = buildVideoFile('video-4');
    const pdfFile: UploadedFile = {
      id: 'pdf-1',
      name: 'paper.pdf',
      type: 'application/pdf',
      size: 128,
      uploadState: 'active',
    };

    renderModal(imageFile, vi.fn(), vi.fn(), true);
    await openResolutionSelect();
    expect(document.body.textContent).toContain('Ultra High');

    renderModal(videoFile, vi.fn(), vi.fn(), true);
    await openResolutionSelect();
    expect(document.body.textContent).not.toContain('Ultra High');

    renderModal(pdfFile, vi.fn(), vi.fn(), true);
    await openResolutionSelect();
    expect(document.body.textContent).not.toContain('Ultra High');
  });

  it('sets FPS when clicking a preset chip', async () => {
    const file = buildVideoFile('video-chip');
    renderModal(file);

    const lectureChip = getButtonByText('0.2 (Lecture)');
    expect(lectureChip).toBeDefined();

    await act(async () => {
      lectureChip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs[2].value).toBe('0.2');
  });

  it('shows trimming feedback and clears offsets when reset is clicked', async () => {
    const file = buildVideoFile('video-trim');
    renderModal(file);

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    await act(async () => {
      setInputValue(inputs[0], '10s');
      setInputValue(inputs[1], '40s');
    });

    expect(document.body.textContent).toContain('Clipped span: 00:30 (30s)');

    const resetButton = getButtonByText('Reset');
    expect(resetButton).toBeDefined();

    await act(async () => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(inputs[0].value).toBe('');
    expect(inputs[1].value).toBe('');
  });

  it('displays file type badge and formatted size in the header', () => {
    const file: UploadedFile = {
      ...buildVideoFile('video-header'),
      name: 'recording.mp4',
      size: 5 * 1024 * 1024,
    };

    renderModal(file);

    expect(document.body.textContent).toContain('MP4');
    expect(document.body.textContent).toContain('5.00 MB');
  });
});
