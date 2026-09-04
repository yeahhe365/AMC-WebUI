import type { ModalityTokenCount, UsageMetadata } from '@google/genai';
import { isRecord } from '../../../shared/predicates';

type UrlContextItem = {
  retrievedUrl?: string;
  retrieved_url?: string;
  urlRetrievalStatus?: string;
  url_retrieval_status?: string;
};

const dedupeArray = (values: unknown[]): unknown[] => {
  const seen = new Set<string>();
  const merged: unknown[] = [];

  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(value);
  }

  return merged;
};

const mergeMetadata = (existing: unknown, incoming: unknown): unknown => {
  if (incoming === undefined || incoming === null) {
    return existing;
  }

  if (existing === undefined || existing === null) {
    return incoming;
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return dedupeArray([...existing, ...incoming]);
  }

  if (isRecord(existing) && isRecord(incoming)) {
    const merged: Record<string, unknown> = { ...existing };

    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = mergeMetadata(merged[key], value);
    }

    return merged;
  }

  return incoming;
};

const mergeTokenDetails = (
  existing: ModalityTokenCount[] | undefined,
  incoming: ModalityTokenCount[] | undefined,
): ModalityTokenCount[] | undefined => {
  const totals = new Map<string, number>();

  for (const detail of [...(existing ?? []), ...(incoming ?? [])]) {
    const modality = detail.modality;
    if (!modality) continue;
    totals.set(modality, (totals.get(modality) ?? 0) + (detail.tokenCount ?? 0));
  }

  if (totals.size === 0) {
    return undefined;
  }

  return Array.from(totals.entries()).map(([modality, tokenCount]) => ({
    modality: modality as ModalityTokenCount['modality'],
    tokenCount,
  }));
};

const sumTokenDetails = (details: ModalityTokenCount[] | undefined): number | undefined => {
  if (!details?.length) {
    return undefined;
  }

  const total = details.reduce((sum, detail) => sum + (detail.tokenCount ?? 0), 0);
  return total > 0 ? total : undefined;
};

const mergeOptionalCounts = (existing?: number, incoming?: number): number | undefined => {
  const hasExisting = typeof existing === 'number' && existing > 0;
  const hasIncoming = typeof incoming === 'number' && incoming > 0;

  if (!hasExisting && !hasIncoming) {
    return undefined;
  }

  return (existing ?? 0) + (incoming ?? 0);
};

const getResponseTokenCount = (usage: UsageMetadata): number | undefined => {
  // Legacy field name: the v1beta reference documents `candidatesTokenCount`
  // while newer SDK types (and the live API) use `responseTokenCount`. Some
  // producers (e.g. the OpenAI-compatible usage mapper) still emit the old name.
  const legacy = (usage as UsageMetadata & { candidatesTokenCount?: number }).candidatesTokenCount;
  return usage.responseTokenCount ?? legacy;
};

const getResponseTokensDetails = (usage: UsageMetadata): ModalityTokenCount[] | undefined => {
  const legacy = (usage as UsageMetadata & { candidatesTokensDetails?: ModalityTokenCount[] }).candidatesTokensDetails;
  return usage.responseTokensDetails ?? legacy;
};

export const mergeUsageMetadata = (
  existing: UsageMetadata | undefined,
  incoming: UsageMetadata | undefined,
): UsageMetadata | undefined => {
  if (!incoming) {
    return existing;
  }

  if (!existing) {
    return incoming;
  }

  const promptTokensDetails = mergeTokenDetails(existing.promptTokensDetails, incoming.promptTokensDetails);
  const cacheTokensDetails = mergeTokenDetails(existing.cacheTokensDetails, incoming.cacheTokensDetails);
  const responseTokensDetails = mergeTokenDetails(
    getResponseTokensDetails(existing),
    getResponseTokensDetails(incoming),
  );
  const toolUsePromptTokensDetails = mergeTokenDetails(
    existing.toolUsePromptTokensDetails,
    incoming.toolUsePromptTokensDetails,
  );

  return {
    promptTokenCount: mergeOptionalCounts(
      existing.promptTokenCount ?? sumTokenDetails(existing.promptTokensDetails),
      incoming.promptTokenCount ?? sumTokenDetails(incoming.promptTokensDetails),
    ),
    cachedContentTokenCount: mergeOptionalCounts(
      existing.cachedContentTokenCount ?? sumTokenDetails(existing.cacheTokensDetails),
      incoming.cachedContentTokenCount ?? sumTokenDetails(incoming.cacheTokensDetails),
    ),
    responseTokenCount: mergeOptionalCounts(
      getResponseTokenCount(existing) ?? sumTokenDetails(getResponseTokensDetails(existing)),
      getResponseTokenCount(incoming) ?? sumTokenDetails(getResponseTokensDetails(incoming)),
    ),
    toolUsePromptTokenCount: mergeOptionalCounts(
      existing.toolUsePromptTokenCount ?? sumTokenDetails(existing.toolUsePromptTokensDetails),
      incoming.toolUsePromptTokenCount ?? sumTokenDetails(incoming.toolUsePromptTokensDetails),
    ),
    thoughtsTokenCount: mergeOptionalCounts(existing.thoughtsTokenCount, incoming.thoughtsTokenCount),
    totalTokenCount: mergeOptionalCounts(existing.totalTokenCount, incoming.totalTokenCount),
    promptTokensDetails,
    cacheTokensDetails,
    responseTokensDetails,
    toolUsePromptTokensDetails,
    trafficType: incoming.trafficType ?? existing.trafficType,
  };
};

const extractUrlContextItems = (metadata: unknown): UrlContextItem[] => {
  if (!isRecord(metadata)) {
    return [];
  }

  const urlMetadata = metadata.urlMetadata;
  const snakeCaseUrlMetadata = metadata.url_metadata;
  const items = Array.isArray(urlMetadata)
    ? urlMetadata
    : Array.isArray(snakeCaseUrlMetadata)
      ? snakeCaseUrlMetadata
      : [];

  return items.filter((item): item is UrlContextItem => isRecord(item));
};

export const mergeUrlContextMetadata = (existing: unknown, incoming: unknown): unknown => {
  if (incoming === undefined || incoming === null) {
    return existing;
  }

  if (existing === undefined || existing === null) {
    return incoming;
  }

  if (!isRecord(existing) || !isRecord(incoming)) {
    return mergeMetadata(existing, incoming);
  }

  const mergedItems = new Map<string, UrlContextItem>();
  const addItems = (items: UrlContextItem[]) => {
    for (const item of items) {
      const url = item.retrievedUrl || item.retrieved_url;
      const key = url || JSON.stringify(item);
      if (!key) continue;
      mergedItems.set(key, item);
    }
  };

  addItems(extractUrlContextItems(existing));
  addItems(extractUrlContextItems(incoming));

  const merged = mergeMetadata(existing, incoming) as Record<string, unknown>;

  delete merged.url_metadata;

  if (mergedItems.size > 0) {
    merged.urlMetadata = Array.from(mergedItems.values());
  }

  return merged;
};
