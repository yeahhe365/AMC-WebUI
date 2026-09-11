import { forwardRef, type ComponentType, type ReactNode } from 'react';
import type { ChatMessage, UploadedFile } from '@/types';
import type { HtmlPreviewRequest } from '@/utils/html-preview/previewPrivilege';

export interface VirtuosoMockProps<T> {
  data: T[];
  itemContent: (index: number, item: T) => ReactNode;
  components?: {
    Footer?: ComponentType;
  };
  computeItemKey?: (index: number, item: T) => React.Key;
}

interface MessagePreviewButtonMockProps {
  message: ChatMessage;
  onImageClick: (file: UploadedFile) => void;
}

type MessageListScrollMockResult = {
  virtuosoRef: { current: null };
  handleScrollerRef: () => void;
  handleScroll: () => void;
  setAtBottom: () => void;
  onRangeChanged: () => void;
  scrollToPrevTurn: () => void;
  scrollToNextTurn: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  showScrollDown: boolean;
  showScrollUp: boolean;
  scrollerRef: { current: null } | null;
};

type MessageListUiMockResult = {
  previewFile: UploadedFile | null;
  isHtmlPreviewModalOpen: boolean;
  htmlPreview: HtmlPreviewRequest | null;
  configuringFile: null;
  setConfiguringFile: () => void;
  handleFileClick: () => void;
  closeFilePreviewModal: () => void;
  allImages: UploadedFile[];
  currentImageIndex: number;
  handlePrevImage: () => void;
  handleNextImage: () => void;
  handleOpenHtmlPreview: () => void;
  handleCloseHtmlPreview: () => void;
  handleConfigureFile: () => void;
  handleSaveFileConfig: () => void;
};

const noop = () => {};

export const createVirtuosoMock = <T,>(onProps?: (props: VirtuosoMockProps<T>) => void) => ({
  Virtuoso: forwardRef<HTMLDivElement, VirtuosoMockProps<T>>((props, ref) => {
    const typedProps = props as VirtuosoMockProps<T>;

    onProps?.(typedProps);
    return (
      <div ref={ref} data-testid="virtuoso">
        {typedProps.data.map((item, index) => (
          <div key={String(typedProps.computeItemKey?.(index, item) ?? index)}>
            {typedProps.itemContent(index, item)}
          </div>
        ))}
        {typedProps.components?.Footer ? <typedProps.components.Footer /> : null}
      </div>
    );
  }),
});

export const createMessagePreviewButtonMock = (
  onProps?: (props: MessagePreviewButtonMockProps & Record<string, unknown>) => void,
) => ({
  Message: (props: MessagePreviewButtonMockProps & Record<string, unknown>) => {
    onProps?.(props);

    return (
      <button
        type="button"
        data-testid={`open-preview-${props.message.id}`}
        onClick={() => props.onImageClick(props.message.files![0])}
      >
        Open preview
      </button>
    );
  },
});

export const createMessageRowMock = () => ({
  Message: () => <div data-testid="message-row" />,
});

export const createNullComponentMock = (exportName: string) => ({
  [exportName]: () => null,
});

export const createFilePreviewModalMock = (options: { testId?: string; onModuleLoad?: () => void } = {}) => {
  options.onModuleLoad?.();

  return {
    FilePreviewModal: ({ file }: { file: UploadedFile | null }) =>
      file ? <div data-testid={options.testId ?? 'file-preview-modal'}>{file.name}</div> : null,
  };
};

export const createMessageListScrollMock = (overrides: Partial<MessageListScrollMockResult> = {}) => ({
  useMessageListScroll: (): MessageListScrollMockResult => ({
    virtuosoRef: { current: null },
    handleScrollerRef: noop,
    handleScroll: noop,
    setAtBottom: noop,
    onRangeChanged: noop,
    scrollToPrevTurn: noop,
    scrollToNextTurn: noop,
    scrollToTop: noop,
    scrollToBottom: noop,
    showScrollDown: false,
    showScrollUp: false,
    scrollerRef: { current: null },
    ...overrides,
  }),
});

export const createMessageListUiMock = (overrides: Partial<MessageListUiMockResult> = {}) => ({
  useMessageListUi: (): MessageListUiMockResult => ({
    previewFile: null,
    isHtmlPreviewModalOpen: false,
    htmlPreview: null,
    configuringFile: null,
    setConfiguringFile: noop,
    handleFileClick: noop,
    closeFilePreviewModal: noop,
    allImages: [],
    currentImageIndex: -1,
    handlePrevImage: noop,
    handleNextImage: noop,
    handleOpenHtmlPreview: noop,
    handleCloseHtmlPreview: noop,
    handleConfigureFile: noop,
    handleSaveFileConfig: noop,
    ...overrides,
  }),
});
