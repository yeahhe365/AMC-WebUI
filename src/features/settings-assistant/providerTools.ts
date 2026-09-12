import { Type, type FunctionDeclaration } from '@google/genai';
import type {
  ModelOption,
  StandardClientFunctions,
  ThirdPartyApiProtocol,
  ThirdPartyConnection,
  ThirdPartyTemplateId,
} from '@/types';
import { THIRD_PARTY_TEMPLATE_IDS } from '@/types';
import { updateThirdPartyConnection } from '@/utils/thirdPartyApiProviders';
import { isRecord } from '../../../shared/predicates';
import { listTemplateSummaries, toConnectionSummary } from './providerRedaction';
import { planProviderPatch, type ProviderPatch } from './providerPatch';

export interface ProviderToolsDeps {
  getConnections: () => ThirdPartyConnection[];
  setConnections: (next: ThirdPartyConnection[]) => void;
  /** Resolves with the key the user typed in the handoff card, or null when dismissed. */
  requestApiKey: (request: { connectionId: string; connectionName: string }) => Promise<string | null>;
}

const stringProperty = (description: string) => ({ type: Type.STRING, description });

const modelArrayProperty = (description: string) => ({
  type: Type.ARRAY,
  description,
  items: {
    type: Type.OBJECT,
    properties: { id: stringProperty('Model id.'), name: stringProperty('Display name.') },
    required: ['id'],
  },
});

const DECLARATIONS = {
  list_templates: {
    name: 'list_templates',
    description:
      'List the built-in provider templates with their default base URL, protocol, default model and whether authentication is optional. Always prefer these defaults over invented values.',
    parameters: { type: Type.OBJECT, properties: {} },
  } satisfies FunctionDeclaration,
  list_connections: {
    name: 'list_connections',
    description:
      'List the third-party connections the user has configured. API keys are never returned; hasApiKey only says whether one is stored.',
    parameters: { type: Type.OBJECT, properties: {} },
  } satisfies FunctionDeclaration,
  create_connection: {
    name: 'create_connection',
    description:
      'Create a third-party connection from a template. Never pass an API key: if one is required the user is asked through a secure card in the UI.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        templateId: stringProperty(`One of: ${THIRD_PARTY_TEMPLATE_IDS.join(', ')}`),
        name: stringProperty('Display name. Duplicate names are numbered automatically.'),
        baseUrl: stringProperty('Base URL without the /chat/completions suffix. Omit to use the template default.'),
        protocol: stringProperty('openai-compatible | anthropic | openai-responses. Omit to use the template default.'),
        modelId: stringProperty('Default model id used for connection tests.'),
        models: modelArrayProperty('Initial model catalog. Omit to use the template default.'),
      },
      required: ['templateId'],
    },
  } satisfies FunctionDeclaration,
  update_connection: {
    name: 'update_connection',
    description:
      'Update an existing connection. Never pass an API key. Overwriting an existing base URL, protocol or model id requires user approval and is refused while approvals are unavailable.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        connectionId: stringProperty('Connection id from list_connections.'),
        name: stringProperty('New display name.'),
        baseUrl: stringProperty('New base URL.'),
        protocol: stringProperty('New protocol.'),
        enabled: { type: Type.BOOLEAN, description: 'Enable or disable the connection.' },
        modelId: stringProperty('New default model id.'),
        addModels: modelArrayProperty('Models to append, keeping the existing catalog.'),
        replaceModels: modelArrayProperty('Replace the whole catalog. Requires user approval.'),
      },
      required: ['connectionId'],
    },
  } satisfies FunctionDeclaration,
};

export const PROVIDER_TOOL_DECLARATIONS: FunctionDeclaration[] = Object.values(DECLARATIONS);

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

export const createProviderTools = (deps: ProviderToolsDeps): StandardClientFunctions => {
  const writeApiKey = (connectionId: string, apiKey: string): void => {
    deps.setConnections(
      updateThirdPartyConnection({ connections: deps.getConnections() }, connectionId, { apiKey }).connections,
    );
  };

  const runPatch = async (patch: ProviderPatch): Promise<unknown> => {
    const verdict = planProviderPatch(patch, deps.getConnections());

    if (verdict.kind === 'rejected') {
      return { status: 'rejected', error: verdict.error };
    }

    if (verdict.kind === 'needs-approval') {
      return {
        status: 'approval-unavailable',
        reason: verdict.reason,
        message:
          'This change would overwrite or delete an existing connection. Tell the user what you wanted to change and let them confirm it in the settings UI.',
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

  const handlePatch = async (toolName: string, args: unknown) => {
    const patch = parsePatch(toolName, args);
    if ('error' in patch) {
      return { response: { status: 'rejected', error: patch.error } };
    }
    return { response: await runPatch(patch) };
  };

  return {
    list_templates: {
      declaration: DECLARATIONS.list_templates,
      handler: async () => ({ response: { templates: listTemplateSummaries() } }),
    },
    list_connections: {
      declaration: DECLARATIONS.list_connections,
      handler: async () => ({ response: { connections: deps.getConnections().map(toConnectionSummary) } }),
    },
    create_connection: {
      declaration: DECLARATIONS.create_connection,
      handler: (args) => handlePatch('create_connection', args),
    },
    update_connection: {
      declaration: DECLARATIONS.update_connection,
      handler: (args) => handlePatch('update_connection', args),
    },
  };
};
