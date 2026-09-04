import React from 'react';
import { Minus } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SMALL_ICON_DANGER_BUTTON_CLASS } from '@/constants/buttonClasses';
import type { EditableOpenAICompatibleModelRow } from './openaiCompatibleModelListState';

export type OpenAICompatibleModelRowFieldsVariant = 'editor' | 'manager';

// 两侧消费方的输入框 className 逐字保留：编辑器侧 id 输入的类顺序原本就与面板侧
// 不同（text-sm font-mono vs font-mono text-sm），类集合一致但此处不做归一化，
// 避免引入任何可见样式漂移。
const EDITOR_MODEL_ID_INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-mono text-[var(--theme-text-primary)] transition-colors placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:bg-[var(--theme-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]/15';
const MANAGER_MODEL_ID_INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 font-mono text-sm text-[var(--theme-text-primary)] transition-colors placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:bg-[var(--theme-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]/15';
const MODEL_NAME_INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-[var(--theme-text-primary)] transition-colors placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:bg-[var(--theme-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]/15';

interface OpenAICompatibleModelRowFieldsProps {
  row: EditableOpenAICompatibleModelRow;
  /** editor = 设置页模型列表编辑器；manager = 管理弹窗中的当前模型面板 */
  variant: OpenAICompatibleModelRowFieldsVariant;
  /** 仅 editor 变体使用：aria-label 末尾追加的行序号 */
  rowIndex?: number;
  // 属性名与 useOpenAICompatibleModelRowHandlers 的返回键一致，消费方可直接展开。
  handleUpdateModel: (rowId: string, value: string) => void;
  handleUpdateModelName: (rowId: string, value: string) => void;
  handleTrimModel: (rowId: string) => void;
  handleTrimModelName: (rowId: string) => void;
  handleRemoveModel: (rowId: string) => void;
}

/**
 * 单条可编辑模型行的三个字段控件（id 输入 + name 输入 + 删除按钮），供
 * OpenAICompatibleModelListEditor 与 OpenAICompatibleCurrentModelsPanel 共用。
 * 两侧可见差异全部由 variant 参数化：编辑器侧渲染带 label 的包裹结构并按行号
 * 生成 aria-label；面板侧渲染裸输入框。编辑器侧的 label 包裹层是它独有的
 * DOM 结构，不能用统一的包裹去改变面板侧的子节点数。事件时序与受控状态
 * 与原实现完全一致。
 */
export const OpenAICompatibleModelRowFields: React.FC<OpenAICompatibleModelRowFieldsProps> = ({
  row,
  variant,
  rowIndex = 0,
  handleUpdateModel,
  handleUpdateModelName,
  handleTrimModel,
  handleTrimModelName,
  handleRemoveModel,
}) => {
  const { t } = useI18n();
  const isEditor = variant === 'editor';

  const idInput = (
    <input
      {...(isEditor ? { id: `${row.rowId}-id` } : null)}
      type="text"
      value={row.id}
      onChange={(event) => handleUpdateModel(row.rowId, event.target.value)}
      onBlur={() => handleTrimModel(row.rowId)}
      data-openai-compatible-model-id-input={isEditor ? 'true' : undefined}
      data-openai-compatible-manager-model-id-input={isEditor ? undefined : 'true'}
      className={isEditor ? EDITOR_MODEL_ID_INPUT_CLASS : MANAGER_MODEL_ID_INPUT_CLASS}
      placeholder="gpt-5.6-sol"
      aria-label={
        isEditor
          ? `${t('settingsOpenAICompatibleModelIdShort')} ${rowIndex + 1}`
          : t('settingsOpenAICompatibleModelIdShort')
      }
    />
  );

  const nameInput = (
    <input
      {...(isEditor ? { id: `${row.rowId}-name` } : null)}
      type="text"
      value={row.name}
      onChange={(event) => handleUpdateModelName(row.rowId, event.target.value)}
      onBlur={() => handleTrimModelName(row.rowId)}
      data-openai-compatible-model-name-input={isEditor ? 'true' : undefined}
      data-openai-compatible-manager-model-name-input={isEditor ? undefined : 'true'}
      className={MODEL_NAME_INPUT_CLASS}
      placeholder={t('settingsModelNamePlaceholder')}
      aria-label={
        isEditor ? `${t('settingsOpenAICompatibleModelName')} ${rowIndex + 1}` : t('settingsOpenAICompatibleModelName')
      }
    />
  );

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--theme-bg-tertiary)]/35 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto]">
      {isEditor ? (
        <div className="min-w-0 space-y-1">
          <label
            htmlFor={`${row.rowId}-id`}
            className="block text-xs font-medium uppercase tracking-wider text-[var(--theme-text-secondary)]"
          >
            {t('settingsOpenAICompatibleModelIdShort')}
          </label>
          {idInput}
        </div>
      ) : (
        idInput
      )}
      {isEditor ? (
        <div className="min-w-0 space-y-1">
          <label
            htmlFor={`${row.rowId}-name`}
            className="block text-xs font-medium uppercase tracking-wider text-[var(--theme-text-secondary)]"
          >
            {t('settingsOpenAICompatibleModelName')}
          </label>
          {nameInput}
        </div>
      ) : (
        nameInput
      )}
      <button
        type="button"
        onClick={() => handleRemoveModel(row.rowId)}
        className={
          isEditor
            ? `justify-self-end sm:self-end ${SMALL_ICON_DANGER_BUTTON_CLASS}`
            : `justify-self-end ${SMALL_ICON_DANGER_BUTTON_CLASS}`
        }
        title={t('settingsRemoveModel')}
        aria-label={t('settingsRemoveModel')}
      >
        <Minus size={14} />
      </button>
    </div>
  );
};
