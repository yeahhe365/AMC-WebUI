import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyConnection } from '@/types';
import { REDACTED_SECRET_SENTINEL } from './secretRedaction';
import {
  applyImportedProviders,
  createProvidersBackupPayload,
  exportProvidersBackupFile,
  parseProvidersBackupText,
} from './thirdPartyBackup';
import * as exportCore from '@/utils/export/core';

describe('thirdPartyBackup', () => {
  const sampleConnection: ThirdPartyConnection = {
    id: 'conn-openai',
    name: 'OpenAI Main',
    templateId: 'openai',
    protocol: 'openai-compatible',
    apiKey: 'sk-secret-12345',
    baseUrl: 'https://api.openai.com/v1',
    extraHeaders: { 'X-Custom': 'val' },
    modelId: 'gpt-4o',
    models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
    enabled: true,
  };

  const sampleOllama: ThirdPartyConnection = {
    id: 'conn-ollama',
    name: 'Ollama Local',
    templateId: 'ollama',
    protocol: 'openai-compatible',
    apiKey: null,
    baseUrl: 'http://localhost:11434/v1',
    extraHeaders: {},
    modelId: 'llama3.2',
    models: [{ id: 'llama3.2', name: 'Llama 3.2' }],
    enabled: true,
    authOptional: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createProvidersBackupPayload', () => {
    it('creates a full backup payload preserving API keys by default', () => {
      const payload = createProvidersBackupPayload([sampleConnection, sampleOllama]);

      expect(payload.type).toBe('AllModelChat-Providers');
      expect(payload.version).toBe(1);
      expect(typeof payload.exportedAt).toBe('string');
      expect(payload.connections[0].apiKey).toBe('sk-secret-12345');
      expect(payload.connections[1].apiKey).toBeNull();
    });

    it('redacts API keys when includeApiKeys is false', () => {
      const payload = createProvidersBackupPayload([sampleConnection, sampleOllama], { includeApiKeys: false });

      expect(payload.connections[0].apiKey).toBe(REDACTED_SECRET_SENTINEL);
      expect(payload.connections[1].apiKey).toBeNull();
    });
  });

  describe('parseProvidersBackupText', () => {
    it('parses standard AllModelChat-Providers payload', () => {
      const json = JSON.stringify(createProvidersBackupPayload([sampleConnection]));
      const result = parseProvidersBackupText(json);

      expect(result.validCount).toBe(1);
      expect(result.connections[0].id).toBe('conn-openai');
      expect(result.connections[0].name).toBe('OpenAI Main');
      expect(result.connections[0].apiKey).toBe('sk-secret-12345');
    });

    it('parses AllModelChat-Settings payload extracting thirdPartyApi connections', () => {
      const settingsPayload = {
        type: 'AllModelChat-Settings',
        version: 1,
        settings: {
          apiKey: 'gemini-key',
          thirdPartyApi: {
            connections: [sampleOllama],
          },
        },
      };

      const result = parseProvidersBackupText(JSON.stringify(settingsPayload));
      expect(result.validCount).toBe(1);
      expect(result.connections[0].id).toBe('conn-ollama');
      expect(result.connections[0].name).toBe('Ollama Local');
    });

    it('parses raw array of connections', () => {
      const rawList = [sampleConnection, sampleOllama];
      const result = parseProvidersBackupText(JSON.stringify(rawList));

      expect(result.validCount).toBe(2);
    });

    it('converts REDACTED_SECRET_SENTINEL to null', () => {
      const redacted = { ...sampleConnection, apiKey: REDACTED_SECRET_SENTINEL };
      const result = parseProvidersBackupText(JSON.stringify([redacted]));

      expect(result.validCount).toBe(1);
      expect(result.connections[0].apiKey).toBeNull();
    });

    it('handles invalid JSON gracefully', () => {
      const result = parseProvidersBackupText('invalid json string {');
      expect(result.validCount).toBe(0);
      expect(result.connections).toEqual([]);
    });

    it('generates a connection ID if the item is missing one', () => {
      const noId = {
        name: 'Custom Provider',
        templateId: 'custom',
        protocol: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'm1',
        models: [{ id: 'm1', name: 'M1' }],
        enabled: true,
      };
      const result = parseProvidersBackupText(JSON.stringify([noId]));
      expect(result.validCount).toBe(1);
      expect(result.connections[0].id).toBeTruthy();
    });
  });

  describe('applyImportedProviders', () => {
    it('completely overwrites existing connections in overwrite mode', () => {
      const existing = [sampleConnection];
      const imported = [sampleOllama];

      const result = applyImportedProviders(existing, imported, 'overwrite');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('conn-ollama');
    });

    it('merges new connections and updates existing in merge mode', () => {
      const existing = [sampleConnection];
      const updatedConnection: ThirdPartyConnection = {
        ...sampleConnection,
        name: 'OpenAI Renamed',
        apiKey: null, // imported has no key
      };
      const newConnection = sampleOllama;

      const result = applyImportedProviders(existing, [updatedConnection, newConnection], 'merge');

      expect(result).toHaveLength(2);
      // Keeps original API key because imported API key was null
      expect(result[0].id).toBe('conn-openai');
      expect(result[0].name).toBe('OpenAI Renamed');
      expect(result[0].apiKey).toBe('sk-secret-12345');
      // Appended new connection
      expect(result[1].id).toBe('conn-ollama');
    });

    it('overwrites API key when imported connection provides a new key', () => {
      const existing = [sampleConnection];
      const updatedWithKey: ThirdPartyConnection = {
        ...sampleConnection,
        apiKey: 'sk-new-key-67890',
      };

      const result = applyImportedProviders(existing, [updatedWithKey], 'merge');
      expect(result[0].apiKey).toBe('sk-new-key-67890');
    });
  });

  describe('exportProvidersBackupFile', () => {
    it('triggers download with backup filename suffix', () => {
      const triggerSpy = vi.spyOn(exportCore, 'triggerDownload').mockImplementation(() => {});

      exportProvidersBackupFile([sampleConnection], { includeApiKeys: true });

      expect(triggerSpy).toHaveBeenCalledTimes(1);
      const filename = triggerSpy.mock.calls[0][1];
      expect(filename).toContain('amc-third-party-providers-backup-');
      expect(filename.endsWith('.json')).toBe(true);
    });

    it('triggers download with shared filename suffix when sanitized', () => {
      const triggerSpy = vi.spyOn(exportCore, 'triggerDownload').mockImplementation(() => {});

      exportProvidersBackupFile([sampleConnection], { includeApiKeys: false });

      expect(triggerSpy).toHaveBeenCalledTimes(1);
      const filename = triggerSpy.mock.calls[0][1];
      expect(filename).toContain('amc-third-party-providers-shared-');
    });
  });
});
