import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { ThirdPartyApiProtocol } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import {
  buildOpenAICompatibleChatCompletionsUrl,
  buildOpenAICompatibleUpstreamChatCompletionsUrl,
  getOpenAICompatibleBaseUrlWarning,
} from '@/services/api/openaiCompatibleUrls';
import {
  buildOpenAIResponsesUpstreamUrl,
  buildOpenAIResponsesUrl,
  getOpenAIResponsesBaseUrlWarning,
} from '@/services/api/openaiResponsesUrls';
import { buildAnthropicMessagesUrl, buildAnthropicUpstreamMessagesUrl } from '@/services/api/anthropicUrls';

type EndpointWarningKind = 'chat-completions-endpoint' | 'models-endpoint' | 'responses-endpoint';

const WARNING_MESSAGE_KEYS: Record<EndpointWarningKind, string> = {
  'chat-completions-endpoint': 'thirdPartyApiBaseUrlChatCompletionsWarning',
  'models-endpoint': 'thirdPartyApiBaseUrlModelsWarning',
  'responses-endpoint': 'thirdPartyApiBaseUrlResponsesWarning',
};

const warningMessageKey = (kind: EndpointWarningKind): string => WARNING_MESSAGE_KEYS[kind];

interface EndpointPreview {
  requestUrl: string;
  upstreamUrl: string;
  warning: EndpointWarningKind | null;
}

const resolvePreview = (protocol: ThirdPartyApiProtocol, baseUrl: string | null | undefined): EndpointPreview => {
  if (protocol === 'anthropic') {
    return {
      requestUrl: buildAnthropicMessagesUrl(baseUrl),
      upstreamUrl: buildAnthropicUpstreamMessagesUrl(baseUrl),
      warning: null,
    };
  }

  if (protocol === 'openai-responses') {
    return {
      requestUrl: buildOpenAIResponsesUrl(baseUrl),
      upstreamUrl: buildOpenAIResponsesUpstreamUrl(baseUrl),
      warning: getOpenAIResponsesBaseUrlWarning(baseUrl),
    };
  }

  return {
    requestUrl: buildOpenAICompatibleChatCompletionsUrl(baseUrl),
    upstreamUrl: buildOpenAICompatibleUpstreamChatCompletionsUrl(baseUrl),
    warning: getOpenAICompatibleBaseUrlWarning(baseUrl),
  };
};

interface EndpointRowProps {
  label: string;
  url: string;
}

const EndpointRow: React.FC<EndpointRowProps> = ({ label, url }) => (
  <div className="flex items-baseline gap-1.5 text-[10px] leading-relaxed">
    <span className="uppercase tracking-wide text-[var(--theme-text-secondary)] flex-shrink-0">{label}</span>
    <code className="font-mono break-all text-[var(--theme-text-secondary)]/90">{url}</code>
  </div>
);

interface ProviderEndpointPreviewProps {
  protocol: ThirdPartyApiProtocol;
  baseUrl: string | null | undefined;
}

/**
 * 展示一条第三方连接最终会请求到的地址:浏览器实际发出的地址(部署注入代理时为
 * 代理路径)与上游真实地址。两者一致时只显示一行;Base URL 误填成完整端点时给出提示。
 */
export const ProviderEndpointPreview: React.FC<ProviderEndpointPreviewProps> = ({ protocol, baseUrl }) => {
  const { t } = useI18n();
  const preview = React.useMemo(() => resolvePreview(protocol, baseUrl), [protocol, baseUrl]);

  return (
    <div className="space-y-1" data-testid="provider-endpoint-preview">
      {preview.warning && (
        <p className="flex items-start gap-1 text-xs text-[var(--theme-text-warning)]" role="status">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{t(warningMessageKey(preview.warning))}</span>
        </p>
      )}
      <EndpointRow label={t('settingsOpenAICompatibleBrowserRequestUrl')} url={preview.requestUrl} />
      {preview.upstreamUrl !== preview.requestUrl && (
        <EndpointRow label={t('settingsOpenAICompatibleUpstreamUrl')} url={preview.upstreamUrl} />
      )}
    </div>
  );
};
