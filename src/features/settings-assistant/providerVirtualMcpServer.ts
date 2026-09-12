import { registerVirtualMcpServer, type VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';
import type { McpToolDefinition } from '@/services/api/mcpApi';
import {
  THIRD_PARTY_TEMPLATE_IDS,
  type ModelOption,
  type ThirdPartyApiProtocol,
  type ThirdPartyConnection,
  type ThirdPartyTemplateId,
} from '@/types';
import { updateThirdPartyConnection } from '@/utils/thirdPartyApiProviders';
import { probeThirdPartyConnection } from '@/utils/thirdPartyDiagnostics';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSettingsAssistantStore } from '@/stores/settingsAssistantStore';
import { isRecord } from '../../../shared/predicates';
import { listTemplateSummaries, toConnectionSummary } from './providerRedaction';
import { planProviderPatch, type ProviderPatch } from './providerPatch';

export interface ProviderToolsDeps {
  getConnections: () => ThirdPartyConnection[];
  setConnections: (next: ThirdPartyConnection[]) => void;
  requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null>;
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const asProtocol = (value: unknown): ThirdPartyApiProtocol | undefined => {
  const candidate = asString(value);
  return candidate === 'openai-compatible' || candidate === 'anthropic' || candidate === 'openai-responses'
    ? candidate
    : undefined;
};

const asModelOptions = (value: unknown): ModelOption[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const models = value
    .filter(isRecord)
    .map((entry) => ({ id: asString(entry.id) ?? '', name: asString(entry.name) ?? asString(entry.id) ?? '' }))
    .filter((model) => model.id.length > 0);
  return models.length > 0 ? models : undefined;
};

const parsePatch = (toolName: string, args: unknown): ProviderPatch | { error: string } => {
  const record = isRecord(args) ? args : {};

  if (toolName === 'create_connection') {
    const templateId = asString(record.templateId);
    if (!templateId || !(THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
      return { error: `templateId must be one of: ${THIRD_PARTY_TEMPLATE_IDS.join(', ')}` };
    }
    return {
      op: 'create',
      templateId: templateId as ThirdPartyTemplateId,
      name: asString(record.name),
      baseUrl: asString(record.baseUrl),
      protocol: asProtocol(record.protocol),
      modelId: asString(record.modelId),
      models: asModelOptions(record.models),
    };
  }

  const connectionId = asString(record.connectionId);
  if (!connectionId) {
    return { error: 'connectionId is required' };
  }

  if (toolName === 'delete_connection') {
    return { op: 'delete', connectionId };
  }

  return {
    op: 'update',
    connectionId,
    set: {
      name: asString(record.name),
      baseUrl: asString(record.baseUrl),
      protocol: asProtocol(record.protocol),
      enabled: asBoolean(record.enabled),
      modelId: asString(record.modelId),
    },
    addModels: asModelOptions(record.addModels),
    replaceModels: asModelOptions(record.replaceModels),
  };
};

export const PROVIDER_VIRTUAL_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_templates',
    description:
      'List the built-in provider templates with default base URL, protocol, default model and whether authentication is optional.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_connections',
    description:
      'List the third-party connections configured by the user. API keys are never returned; hasApiKey indicates if one is stored.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_connection',
    description:
      'Create a third-party connection from a template. Never pass an API key: if one is required, the user enters it via secure UI.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: `One of: ${THIRD_PARTY_TEMPLATE_IDS.join(', ')}` },
        name: { type: 'string', description: 'Display name.' },
        baseUrl: { type: 'string', description: 'Base URL without /chat/completions suffix.' },
        protocol: { type: 'string', description: 'openai-compatible | anthropic | openai-responses' },
        modelId: { type: 'string', description: 'Default model id.' },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'update_connection',
    description: 'Update an existing connection. Overwriting an existing base URL or protocol requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection id from list_connections.' },
        name: { type: 'string', description: 'New display name.' },
        baseUrl: { type: 'string', description: 'New base URL.' },
        protocol: { type: 'string', description: 'New protocol.' },
        enabled: { type: 'boolean', description: 'Enable or disable connection.' },
        modelId: { type: 'string', description: 'New default model id.' },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'delete_connection',
    description: 'Delete an existing third-party connection by connectionId.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection id from list_connections to delete.' },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'test_connection',
    description: 'Test connectivity and measure latency to a configured provider connection.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection id to test.' },
        modelId: { type: 'string', description: 'Optional model id override for testing.' },
      },
      required: ['connectionId'],
    },
  },
];

export const createProviderVirtualMcpServer = (deps: ProviderToolsDeps): VirtualMcpServer => {
  const writeApiKey = (connectionId: string, apiKey: string): void => {
    deps.setConnections(
      updateThirdPartyConnection({ connections: deps.getConnections() }, connectionId, { apiKey }).connections,
    );
  };

  const runPatch = async (patch: ProviderPatch): Promise<Record<string, unknown>> => {
    const verdict = planProviderPatch(patch, deps.getConnections());

    if (verdict.kind === 'rejected') {
      return { status: 'rejected', error: verdict.error };
    }

    if (verdict.kind === 'needs-approval') {
      if (patch.op === 'delete') {
        const target = deps.getConnections().find((c) => c.id === patch.connectionId);
        deps.setConnections(verdict.nextConnections);
        return {
          status: 'deleted',
          connectionId: patch.connectionId,
          name: target?.name ?? patch.connectionId,
        };
      }
      return {
        status: 'approval-unavailable',
        reason: verdict.reason,
        message:
          'This change would overwrite an existing connection. Tell the user what you wanted to change and let them confirm.',
      };
    }

    if (verdict.changed.length === 0) {
      return { status: 'unchanged', connectionId: verdict.connectionId };
    }

    deps.setConnections(verdict.nextConnections);
    const connection = deps.getConnections().find((candidate) => candidate.id === verdict.connectionId);
    if (!connection) {
      return { status: 'rejected', error: 'Connection disappeared right after the write.' };
    }

    if (patch.op === 'update') {
      return { status: 'updated', connectionId: connection.id, name: connection.name, changed: verdict.changed };
    }

    if (connection.authOptional || connection.apiKey?.trim()) {
      return { status: 'created', connectionId: connection.id, name: connection.name };
    }

    const apiKey = await deps.requestApiKey({ connectionId: connection.id, connectionName: connection.name });
    if (!apiKey) {
      return {
        status: 'aborted',
        connectionId: connection.id,
        message: 'The user did not enter an API key. Do not ask for it in chat; it can only be entered in the card.',
      };
    }

    writeApiKey(connection.id, apiKey);
    return { status: 'key-configured', connectionId: connection.id, name: connection.name };
  };

  const toMcpResponse = (data: unknown) => ({
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    structuredContent: data,
  });

  return {
    id: 'amc_provider_manager',
    name: 'AMC Provider Manager',
    description: 'Configure and diagnose third-party AI API providers and connections.',
    listTools: async () => PROVIDER_VIRTUAL_MCP_TOOLS,
    callTool: async (toolName, args, signal) => {
      if (toolName === 'list_templates') {
        return toMcpResponse({ templates: listTemplateSummaries() });
      }

      if (toolName === 'list_connections') {
        return toMcpResponse({ connections: deps.getConnections().map(toConnectionSummary) });
      }

      if (toolName === 'create_connection' || toolName === 'update_connection' || toolName === 'delete_connection') {
        const patch = parsePatch(toolName, args);
        if ('error' in patch) {
          return toMcpResponse({ status: 'rejected', error: patch.error });
        }
        const result = await runPatch(patch);
        return toMcpResponse(result);
      }

      if (toolName === 'test_connection') {
        const connectionId = asString(isRecord(args) ? args.connectionId : undefined);
        const modelId = asString(isRecord(args) ? args.modelId : undefined);
        if (!connectionId) {
          return toMcpResponse({ status: 'error', errorMessage: 'connectionId is required' });
        }
        const connection = deps.getConnections().find((c) => c.id === connectionId);
        if (!connection) {
          return toMcpResponse({ status: 'error', errorMessage: `Connection ${connectionId} not found` });
        }
        const probeResult = await probeThirdPartyConnection(connection, {
          modelId,
          signal,
        });
        return toMcpResponse(probeResult);
      }

      return toMcpResponse({ status: 'error', errorMessage: `Unknown tool: ${toolName}` });
    },
  };
};

export const initProviderVirtualMcpServer = (): (() => void) => {
  const server = createProviderVirtualMcpServer({
    getConnections: () => useSettingsStore.getState().appSettings.thirdPartyApi?.connections ?? [],
    setConnections: (next: ThirdPartyConnection[]) =>
      useSettingsStore.getState().setAppSettings((prev) => ({
        ...prev,
        thirdPartyApi: {
          ...(prev.thirdPartyApi ?? { enabled: true, connections: [] }),
          connections: next,
        },
      })),
    requestApiKey: (request) => useSettingsAssistantStore.getState().requestApiKey(request),
  });
  return registerVirtualMcpServer(server);
};
