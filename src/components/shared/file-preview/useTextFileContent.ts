import { useEffect, useRef, useState, type RefObject } from 'react';
import { logService } from '@/services/logService';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';

interface UseTextFileContentOptions {
  /** 是否把焦点移到可编辑的 textarea 上（对应两个 viewer 原有的 focus-on-editable effect） */
  isEditable?: boolean;
  /** fetch 失败时传给 logService.error 的前缀文案，保留各调用方原有的日志标识 */
  errorLogLabel: string;
  /**
   * 是否丢弃迟到的 fetch 响应（依赖变化/卸载后到达的结果）。
   * MarkdownFileViewer 原行为为 true（带 cancelled 守卫），TextFileViewer 为 false。
   * 默认 true。
   */
  ignoreStaleResponses?: boolean;
  /**
   * fetch effect 的依赖跟踪粒度：
   * - 'dataUrl'：仅跟踪 file.dataUrl（MarkdownFileViewer 原行为）
   * - 'file'：跟踪整个 file 对象，父组件换新 file 引用即重新拉取（TextFileViewer 原行为）
   * 默认 'dataUrl'。
   */
  fetchTrigger?: 'dataUrl' | 'file';
}

interface UseTextFileContentResult {
  /** 从 dataUrl 拉取到的文本内容；未拉取或提供了受控 content 时为 null */
  localContent: string | null;
  /** 调用方是否通过 content prop 提供了内容 */
  hasProvidedContent: boolean;
  /** 首次从 dataUrl 加载期间为 true */
  isLoading: boolean;
  /** 绑定到可编辑 textarea 上的 ref */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

/**
 * 文本类文件预览共享的加载逻辑：localContent / hasProvidedContent / isLoading
 * 状态组、fetch(dataUrl)→text 副作用与 focus-on-editable 副作用。两个调用方在
 * 竞态守卫、依赖粒度与日志文案上的既有差异全部通过 options 参数化保留，
 * 不做任何行为归一。
 */
export const useTextFileContent = (
  file: UploadedFile,
  content: string | null | undefined,
  onLoad: ((content: string) => void) | undefined,
  options: UseTextFileContentOptions,
): UseTextFileContentResult => {
  const { t } = useI18n();
  const { isEditable = false, errorLogLabel, ignoreStaleResponses = true, fetchTrigger = 'dataUrl' } = options;

  const [localContent, setLocalContent] = useState<string | null>(null);
  const hasProvidedContent = content !== undefined && content !== null;
  const [isLoading, setIsLoading] = useState(() => !hasProvidedContent && !!file.dataUrl);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 依赖粒度按调用方原行为参数化，且只保留这一个触发值，避免额外引入多余的依赖项。
  const dataUrl = file.dataUrl;
  const fetchTriggerValue = fetchTrigger === 'file' ? file : dataUrl;

  useEffect(() => {
    if (hasProvidedContent) return;

    let cancelled = false;

    if (dataUrl) {
      fetch(dataUrl)
        .then((response) => response.text())
        .then((text) => {
          if (ignoreStaleResponses && cancelled) return;
          setLocalContent(text);
          onLoad?.(text);
          setIsLoading(false);
        })
        .catch((error) => {
          if (ignoreStaleResponses && cancelled) return;
          logService.error(errorLogLabel, error);
          setLocalContent(t('filePreviewFailedTextContent'));
          setIsLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [dataUrl, errorLogLabel, fetchTriggerValue, hasProvidedContent, ignoreStaleResponses, onLoad, t]);

  useEffect(() => {
    if (isEditable && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditable]);

  return { localContent, hasProvidedContent, isLoading, textareaRef };
};
