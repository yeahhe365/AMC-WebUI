import type { ThirdPartyConnection, ThirdPartyTemplateId } from '@/types';
import { createConnectionId, sanitizeThirdPartyConnection } from './thirdPartyApiProviders';
import { REDACTED_SECRET_SENTINEL } from './secretRedaction';
import { triggerDownload } from '@/utils/export/core';
import { createManagedObjectUrl } from '@/services/objectUrlManager';

export interface ThirdPartyBackupPayload {
  type: 'AllModelChat-Providers';
  version: 1;
  exportedAt: string;
  connections: ThirdPartyConnection[];
}

export interface ExportProvidersOptions {
  includeApiKeys?: boolean;
}

export const createProvidersBackupPayload = (
  connections: ThirdPartyConnection[],
  options?: ExportProvidersOptions,
): ThirdPartyBackupPayload => {
  const includeKeys = options?.includeApiKeys ?? true;
  const processedConnections = connections.map((conn) => ({
    ...conn,
    apiKey: includeKeys ? conn.apiKey : conn.apiKey ? REDACTED_SECRET_SENTINEL : conn.apiKey,
  }));

  return {
    type: 'AllModelChat-Providers',
    version: 1,
    exportedAt: new Date().toISOString(),
    connections: processedConnections,
  };
};

export const exportProvidersBackupFile = (
  connections: ThirdPartyConnection[],
  options?: ExportProvidersOptions,
): void => {
  const payload = createProvidersBackupPayload(connections, options);
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  const suffix = options?.includeApiKeys === false ? 'shared' : 'backup';
  triggerDownload(createManagedObjectUrl(blob), `amc-third-party-providers-${suffix}-${date}.json`);
};

export interface ParseBackupResult {
  connections: ThirdPartyConnection[];
  validCount: number;
}

export const parseProvidersBackupText = (rawText: string): ParseBackupResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { connections: [], validCount: 0 };
  }

  let candidates: unknown[] = [];

  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.connections)) {
      candidates = record.connections;
    } else if (
      typeof record.settings === 'object' &&
      record.settings !== null &&
      typeof (record.settings as Record<string, unknown>).thirdPartyApi === 'object' &&
      (record.settings as Record<string, unknown>).thirdPartyApi !== null &&
      Array.isArray(((record.settings as Record<string, unknown>).thirdPartyApi as Record<string, unknown>).connections)
    ) {
      candidates = ((record.settings as Record<string, unknown>).thirdPartyApi as Record<string, unknown>)
        .connections as unknown[];
    }
  }

  const validConnections: ThirdPartyConnection[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }
    const raw = candidate as Record<string, unknown>;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createConnectionId();
    const rawTemplateId = typeof raw.templateId === 'string' ? raw.templateId.trim() : '';
    const templateId =
      rawTemplateId === 'custom' || rawTemplateId === 'custom-openai'
        ? 'custom-openai'
        : rawTemplateId === 'custom-anthropic'
          ? 'custom-anthropic'
          : (rawTemplateId as ThirdPartyTemplateId) || 'custom-openai';
    const sanitized = sanitizeThirdPartyConnection({ ...raw, id, templateId }, 'custom-openai');
    if (sanitized) {
      if (sanitized.apiKey === REDACTED_SECRET_SENTINEL) {
        sanitized.apiKey = null;
      }
      validConnections.push(sanitized);
    }
  }

  return {
    connections: validConnections,
    validCount: validConnections.length,
  };
};

export type ImportMode = 'merge' | 'overwrite';

export const applyImportedProviders = (
  currentConnections: ThirdPartyConnection[],
  importedConnections: ThirdPartyConnection[],
  mode: ImportMode = 'merge',
): ThirdPartyConnection[] => {
  if (mode === 'overwrite') {
    return importedConnections;
  }

  const existingMap = new Map(currentConnections.map((c) => [c.id, c]));
  const result = [...currentConnections];

  for (const imported of importedConnections) {
    if (existingMap.has(imported.id)) {
      const idx = result.findIndex((c) => c.id === imported.id);
      const existing = existingMap.get(imported.id)!;
      result[idx] = {
        ...imported,
        apiKey: imported.apiKey ? imported.apiKey : existing.apiKey,
      };
    } else {
      result.push(imported);
    }
  }

  return result;
};
