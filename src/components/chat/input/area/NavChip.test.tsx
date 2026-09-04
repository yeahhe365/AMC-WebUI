import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { useChatStore } from '@/stores/chatStore';
import type { UploadedFile } from '@/types';

import { NavChip } from './NavChip';

const makePdf = (id: string): UploadedFile => ({
  id,
  name: `${id}.pdf`,
  type: 'application/pdf',
  size: 10,
});

const makeVideo = (id: string): UploadedFile => ({
  id,
  name: `${id}.mp4`,
  type: 'video/mp4',
  size: 10,
});

const resetStores = () => {
  useMediaNavStore.setState({
    isOpen: false,
    openKind: null,
    activeFileId: null,
    targetPage: null,
    currentPage: 1,
    highlight: null,
    videoTarget: null,
  });
  useChatStore.setState({ selectedFiles: [], activeMessages: [] });
};

describe('NavChip', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });
  beforeEach(resetStores);

  const renderChip = (props: {
    labelKey: string;
    missingHintKey: string;
    mediaKind: 'pdf' | 'video';
    testId: string;
    isEnabled: boolean;
    onToggle?: () => void;
  }) => {
    act(() => {
      renderer.root.render(
        <NavChip
          iconName="BookOpenText"
          labelKey={props.labelKey}
          missingHintKey={props.missingHintKey}
          mediaKind={props.mediaKind}
          isEnabled={props.isEnabled}
          onToggle={props.onToggle ?? vi.fn()}
          testId={props.testId}
        />,
      );
    });
    return renderer.container.querySelector<HTMLButtonElement>(`[data-testid="${props.testId}"]`);
  };

  it('renders the PDF chip pressed with its label', () => {
    const chip = renderChip({
      labelKey: 'pdfNavLabel',
      missingHintKey: 'pdfNavNoPdfHint',
      mediaKind: 'pdf',
      testId: 'pdf-nav-chip',
      isEnabled: true,
    });
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
    expect(chip?.textContent).toContain('PDF Navigation');
  });

  it('renders the video chip with its own label and test id', () => {
    const chip = renderChip({
      labelKey: 'videoNavChipLabel',
      missingHintKey: 'videoNavNoVideoHint',
      mediaKind: 'video',
      testId: 'video-nav-chip',
      isEnabled: false,
    });
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('aria-pressed')).toBe('false');
    expect(chip?.textContent).toContain('Video Navigation');
  });

  it('notifies the toggle handler on click', () => {
    const onToggle = vi.fn();
    const chip = renderChip({
      labelKey: 'pdfNavLabel',
      missingHintKey: 'pdfNavNoPdfHint',
      mediaKind: 'pdf',
      testId: 'pdf-nav-chip',
      isEnabled: false,
      onToggle,
    });
    act(() => {
      chip?.click();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('hints at a missing PDF for the pdf chip only when no PDF exists', () => {
    useChatStore.setState({ selectedFiles: [makeVideo('clip')] });
    const chip = renderChip({
      labelKey: 'pdfNavLabel',
      missingHintKey: 'pdfNavNoPdfHint',
      mediaKind: 'pdf',
      testId: 'pdf-nav-chip',
      isEnabled: false,
    });
    expect(chip?.getAttribute('title')).toContain('No PDF in this chat yet');

    useChatStore.setState({ selectedFiles: [makePdf('report')] });
    act(() => {
      renderer.root.render(
        <NavChip
          iconName="Pdf"
          labelKey="pdfNavLabel"
          missingHintKey="pdfNavNoPdfHint"
          mediaKind="pdf"
          isEnabled={false}
          onToggle={vi.fn()}
          testId="pdf-nav-chip"
        />,
      );
    });
    const updated = renderer.container.querySelector<HTMLButtonElement>('[data-testid="pdf-nav-chip"]');
    expect(updated?.getAttribute('title')).not.toContain('No PDF in this chat yet');
  });

  it('hints at a missing video for the video chip only when no video exists', () => {
    useChatStore.setState({ selectedFiles: [makePdf('report')] });
    const chip = renderChip({
      labelKey: 'videoNavChipLabel',
      missingHintKey: 'videoNavNoVideoHint',
      mediaKind: 'video',
      testId: 'video-nav-chip',
      isEnabled: false,
    });
    expect(chip?.getAttribute('title')).toContain('No video in this chat yet');

    useChatStore.setState({ selectedFiles: [makeVideo('clip')] });
    act(() => {
      renderer.root.render(
        <NavChip
          iconName="Clapperboard"
          labelKey="videoNavChipLabel"
          missingHintKey="videoNavNoVideoHint"
          mediaKind="video"
          isEnabled={false}
          onToggle={vi.fn()}
          testId="video-nav-chip"
        />,
      );
    });
    const updated = renderer.container.querySelector<HTMLButtonElement>('[data-testid="video-nav-chip"]');
    expect(updated?.getAttribute('title')).not.toContain('No video in this chat yet');
  });
});
