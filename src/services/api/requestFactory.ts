/**
 * Anthropic 与 OpenAI 兼容两条 API 服务线共享的请求装配与发送骨架。
 *
 * 设计原则:本文件只承载两条服务线逐行确认一致的代码(请求头拼装顺序、URL 与
 * RequestInit 的求值时机、aborted 早退、错误处理顺序、模型列表映射、采样参数写入);
 * 真正的协议差异(认证头、流式事件解析、usage 统计口径)由各服务线以参数注入,
 * 本文件不做任何协议假设。这是网络热路径,改动须保持与原实现逐行为等价。
 */

import type { Part, UsageMetadata } from '@google/genai';
import type { ModelOption, NonStreamMessageCompleteHandler, StreamMessageCompleteHandler } from '@/types';
import { readResponseErrorMessage, toError } from '@/utils/errorMessage';
import { deduplicateModelsById } from '@/utils/model/modelSorting';
import { logService } from '@/services/logService';
import { buildThirdPartyForwardHeaders } from './thirdPartyRequestHeaders';

/** 认证协议头构造器:仅负责认证/版本头(如 x-api-key + anthropic-version,或 Bearer)。 */
export type ApiAuthHeaderFactory = (apiKey: string) => Record<string, string>;

export interface ApiRequestInitFactory {
  /** POST JSON 请求:认证头 → content-type → 第三方转发头,body 为 JSON 序列化字符串。 */
  createRequestInit: (
    apiKey: string,
    body: Record<string, unknown>,
    abortSignal: AbortSignal,
    providerId?: string | null,
    baseUrl?: string | null,
    extraHeaders?: Record<string, string> | null,
  ) => RequestInit;
  /** GET 请求:认证头 → 第三方转发头,无 content-type/body。 */
  createGetRequestInit: (
    apiKey: string,
    abortSignal: AbortSignal,
    providerId?: string | null,
    baseUrl?: string | null,
    extraHeaders?: Record<string, string> | null,
  ) => RequestInit;
}

/** 组装各服务线的 RequestInit 工厂;头部插入顺序固定,与原实现逐行等价。 */
export const createApiRequestInitFactory = (authHeaders: ApiAuthHeaderFactory): ApiRequestInitFactory => ({
  createRequestInit: (apiKey, body, abortSignal, providerId, baseUrl, extraHeaders) => ({
    method: 'POST',
    headers: {
      ...authHeaders(apiKey),
      'content-type': 'application/json',
      ...buildThirdPartyForwardHeaders({ proxyProviderId: providerId, baseUrl, extraHeaders }),
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  }),
  createGetRequestInit: (apiKey, abortSignal, providerId, baseUrl, extraHeaders) => ({
    method: 'GET',
    headers: {
      ...authHeaders(apiKey),
      ...buildThirdPartyForwardHeaders({ proxyProviderId: providerId, baseUrl, extraHeaders }),
    },
    signal: abortSignal,
  }),
});

/**
 * 模型列表拉取的公共骨架:fetch → !ok 抛 readResponseErrorMessage → 解析
 * `{ data: [{ id }] }` → trim/filter/dedupe 成 ModelOption。
 */
export const fetchProviderModelOptions = async (options: {
  url: string;
  requestInit: RequestInit;
  /** readResponseErrorMessage 的上下文标签,如 'Anthropic' 或 'OpenAI-compatible'。 */
  errorContextLabel: string;
}): Promise<ModelOption[]> => {
  const response = await fetch(options.url, options.requestInit);
  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, options.errorContextLabel));
  }
  const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
  const rawModels = (payload.data ?? [])
    .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
    .filter((id) => id.length > 0)
    .map((id) => ({ id, name: id }));
  return deduplicateModelsById(rawModels);
};

export interface NonStreamChatRequestParams<TPayload> {
  /**
   * 惰性求值:在 aborted 早退检查之后、fetch 调用时才构造。保持原实现的求值时机,
   * 使 body 构造抛错(如 fileData 校验失败)仍落入 catch → onError 路径。
   */
  requestUrl: () => string;
  /** 同上,惰性构造 RequestInit(含 body 装配)。 */
  requestInit: () => RequestInit;
  /** readResponseErrorMessage 的上下文标签,如 'Anthropic'。 */
  errorContextLabel: string;
  /** catch 分支 logService.error 的首参,如 'Anthropic non-stream request failed:'。 */
  failureLogLabel: string;
  abortSignal: AbortSignal;
  onError: (error: Error) => void;
  onComplete: NonStreamMessageCompleteHandler;
  /** payload → onComplete 前三个实参 [parts, thoughtsText, usageMetadata]。 */
  toCompletionArgs: (payload: TPayload) => [Part[], string | undefined, UsageMetadata | undefined];
}

/**
 * 非流式发送骨架:aborted 早退 → fetch → !ok 抛错 → json → 二次 aborted 检查 →
 * onComplete(parts, thoughts, usage);catch 统一走 logService.error + onError(toError)。
 */
export const executeNonStreamChatRequest = async <TPayload>(
  params: NonStreamChatRequestParams<TPayload>,
): Promise<void> => {
  const { abortSignal, onError, onComplete } = params;
  try {
    if (abortSignal.aborted) {
      onComplete([], undefined, undefined, undefined, undefined);
      return;
    }

    const response = await fetch(params.requestUrl(), params.requestInit());
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, params.errorContextLabel));
    }

    const payload = (await response.json()) as TPayload;
    if (abortSignal.aborted) {
      onComplete([], undefined, undefined, undefined, undefined);
      return;
    }

    const [parts, thoughtsText, usageMetadata] = params.toCompletionArgs(payload);
    onComplete(parts, thoughtsText, usageMetadata, undefined, undefined);
  } catch (error) {
    logService.error(params.failureLogLabel, error);
    onError(toError(error));
  }
};

export interface StreamChatRequestParams {
  /** 惰性求值,语义同 NonStreamChatRequestParams.requestUrl/requestInit。 */
  requestUrl: () => string;
  requestInit: () => RequestInit;
  errorContextLabel: string;
  failureLogLabel: string;
  abortSignal: AbortSignal;
  onError: (error: Error) => void;
  onComplete: StreamMessageCompleteHandler;
  /**
   * 消费 SSE 响应并返回最终 usage(无则 undefined)。事件解析与 usage 统计口径
   * 属协议差异,由各服务线自持;本骨架只负责其前后的控制流。
   */
  readStream: (response: Response) => Promise<UsageMetadata | undefined>;
}

/**
 * 流式发送骨架:aborted 早退 → fetch → !ok 抛错 → readStream → onComplete(finalUsage);
 * catch 统一走 logService.error + onError(toError)。
 */
export const executeStreamChatRequest = async (params: StreamChatRequestParams): Promise<void> => {
  const { abortSignal, onError, onComplete } = params;
  try {
    if (abortSignal.aborted) {
      onComplete(undefined, undefined, undefined);
      return;
    }

    const response = await fetch(params.requestUrl(), params.requestInit());
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, params.errorContextLabel));
    }

    const finalUsage = await params.readStream(response);
    onComplete(finalUsage, undefined, undefined);
  } catch (error) {
    logService.error(params.failureLogLabel, error);
    onError(toError(error));
  }
};

/**
 * temperature/top_p 公共装配:仅当值为 number 时写入,顺序固定 temperature → top_p,
 * 与两条服务线的原实现一致(键插入顺序亦不变)。
 */
export const appendSamplingParameters = (
  body: Record<string, unknown>,
  sampling: { temperature?: number; topP?: number },
): void => {
  if (typeof sampling.temperature === 'number') {
    body.temperature = sampling.temperature;
  }
  if (typeof sampling.topP === 'number') {
    body.top_p = sampling.topP;
  }
};
