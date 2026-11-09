import { THIRD_PARTY_TEMPLATE_LABELS, getThirdPartyTemplateDefaults } from '@/utils/third-party/thirdPartyApiProviders';
import { maskSecret } from '@/features/settings-mcp/mcpRedaction';
import { THIRD_PARTY_TEMPLATE_IDS, type ThirdPartyConnection, type ThirdPartyTemplateId } from '@/types';

/**
 * Caps how many model ids travel to the model. Catalogs on gateways like
 * OpenRouter hold hundreds of entries; the assistant only needs enough to
 * recognise the vendor and to propose imports from fetch_models (PR2).
 */
export const MODEL_IDS_PER_CONNECTION_LIMIT = 50;

export interface ConnectionSummary {
  id: string;
  name: string;
  templateId: string;
  protocol: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  headerNames: string[];
  modelCount: number;
  modelIds: string[];
  enabled: boolean;
}

export interface TemplateSummary {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string | null;
  modelId: string;
  authOptional: boolean;
}

/**
 * Connection shape exposed to the model.
 *
 * The stored key is reduced to a mask (`sk-****xyz`), never the value: the
 * assistant only needs to know whether a key exists and which one it looks
 * like, and a plaintext key in the transcript would be handed to the model
 * vendor on every single turn. Extra-header values stay dropped for the same
 * reason.
 */
export const toConnectionSummary = (connection: ThirdPartyConnection): ConnectionSummary => ({
  id: connection.id,
  name: connection.name,
  templateId: connection.templateId,
  protocol: connection.protocol,
  baseUrl: connection.baseUrl,
  hasApiKey: Boolean(connection.apiKey?.trim()),
  maskedApiKey: maskSecret(connection.apiKey ?? undefined),
  headerNames: Object.keys(connection.extraHeaders ?? {}),
  modelCount: connection.models.length,
  modelIds: connection.models.slice(0, MODEL_IDS_PER_CONNECTION_LIMIT).map((model) => model.id),
  enabled: connection.enabled,
});

export const toTemplateSummary = (templateId: ThirdPartyTemplateId): TemplateSummary => {
  const defaults = getThirdPartyTemplateDefaults(templateId);
  return {
    id: templateId,
    name: THIRD_PARTY_TEMPLATE_LABELS[templateId],
    protocol: defaults.protocol,
    baseUrl: defaults.baseUrl,
    modelId: defaults.modelId,
    authOptional: Boolean(defaults.authOptional),
  };
};

export const listTemplateSummaries = (): TemplateSummary[] => THIRD_PARTY_TEMPLATE_IDS.map(toTemplateSummary);
