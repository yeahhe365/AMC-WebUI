import type { ChatMessage } from '@/types';

/** 聚合后的单条消息 token 视图，所有展示层只依赖它，不直接读扁平字段。 */
export interface MessageTokenStatsView {
  /** 全量 prompt（含缓存部分），P = U + C */
  promptTokens: number;
  cachedPromptTokens: number;
  /** 去缓存输入 U = max(prompt - cached, 0) */
  uncachedInputTokens: number;
  toolUsePromptTokens: number;
  thoughtTokens: number;
  completionTokens: number;
  /** 本条总计：优先用落盘 total，否则按分项求和 */
  totalTokens: number;
  cumulativeTotalTokens?: number;
  /** 任一分项 > 0。区分 undefined（无数据，不显示）与 0（有数据但为零）。 */
  hasAnyTokens: boolean;
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const buildMessageTokenStatsView = (message: ChatMessage): MessageTokenStatsView => {
  const promptTokens = num(message.promptTokens);
  const cachedPromptTokens = num(message.cachedPromptTokens);
  const uncachedInputTokens = Math.max(promptTokens - cachedPromptTokens, 0);
  const toolUsePromptTokens = num(message.toolUsePromptTokens);
  const thoughtTokens = num(message.thoughtTokens);
  const completionTokens = num(message.completionTokens);
  const storedTotal = num(message.totalTokens);
  const summedTotal = uncachedInputTokens + cachedPromptTokens + toolUsePromptTokens + thoughtTokens + completionTokens;
  const totalTokens = storedTotal > 0 ? storedTotal : summedTotal;
  const cumulative = num(message.cumulativeTotalTokens);

  return {
    promptTokens,
    cachedPromptTokens,
    uncachedInputTokens,
    toolUsePromptTokens,
    thoughtTokens,
    completionTokens,
    totalTokens,
    cumulativeTotalTokens: cumulative > 0 ? cumulative : undefined,
    hasAnyTokens:
      promptTokens > 0 ||
      cachedPromptTokens > 0 ||
      toolUsePromptTokens > 0 ||
      thoughtTokens > 0 ||
      completionTokens > 0 ||
      storedTotal > 0,
  };
};

/** 常态行紧凑数字：128400 -> "128.4K"。强制英文短记数，不随语言变成“万”。 */
export const formatCompactTokens = (value: number): string =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** 详情卡精确数字：128400 -> "128,400"。 */
export const formatExactTokens = (value: number, locale: string): string => new Intl.NumberFormat(locale).format(value);

/** 点击复制的纯文本摘要，一行搞定。 */
export const buildTokenStatsCopyText = (
  view: MessageTokenStatsView,
  extras: { modelTps?: number; endToEndTps?: number; elapsedSeconds?: number },
): string => {
  const parts = [
    `total ${view.totalTokens}`,
    `input ${view.promptTokens}`,
    `cached ${view.cachedPromptTokens}`,
    `tool ${view.toolUsePromptTokens}`,
    `reasoning ${view.thoughtTokens}`,
    `output ${view.completionTokens}`,
  ];
  if (view.cumulativeTotalTokens !== undefined) parts.push(`session ${view.cumulativeTotalTokens}`);
  if (extras.modelTps !== undefined) parts.push(`${extras.modelTps.toFixed(1)} t/s`);
  if (extras.elapsedSeconds !== undefined) parts.push(`${extras.elapsedSeconds.toFixed(1)}s`);
  return parts.join(' · ');
};
