import type { Type, Schema } from '@google/genai';
import type { McpServerConfig, StandardClientFunctions, UploadedFile } from '@/types';
import {
  callMcpTool,
  fetchMcpTools,
  type McpToolDefinition,
  type McpToolProgressEvent,
  type McpToolsResponse,
} from '@/services/api/mcpApi';
import { logService } from '@/services/logService';
import { beginMcpToolRun, appendMcpToolProgress, finishMcpToolRun } from '@/stores/mcp/mcpToolRuntimeStore';
import { toMcpFunctionName } from './mcpToolNames';
import { isRecord } from '../../../shared/predicates';
import { extractMcpCallError, summarizeMcpResultForModel } from './mcpResultSummary';
import {
  isSessionApproved,
  rememberSessionApproval,
  requiresApproval,
  sessionApprovalKey,
  type McpApprovalDecision,
  type McpApprovalRequest,
} from './toolApproval';
import { rememberDiscoveredTools } from './toolDisplayNames';
import { getVirtualMcpServers, type VirtualMcpServer } from './virtualMcpRegistry';

interface CreateMcpClientFunctionsOptions {
  servers: McpServerConfig[];
  virtualServers?: VirtualMcpServer[];
  abortSignal?: AbortSignal;

  listTools?: (servers: McpServerConfig[], abortSignal?: AbortSignal) => Promise<McpToolsResponse>;
  callTool?: (
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
    onProgress?: (event: McpToolProgressEvent) => void,
  ) => Promise<unknown>;
  /** Resolves user decisions for tools flagged as "ask before running". */
  requestApproval?: (request: McpApprovalRequest) => Promise<McpApprovalDecision>;
  /**
   * Returns the freshest server configs at call time. Discovery is cached for
   * 30s, so without this re-check a tool the user just disabled could still
   * execute inside the cache window.
   */
  resolveLatestServers?: () => McpServerConfig[] | undefined;
}

type McpToolsLister = NonNullable<CreateMcpClientFunctionsOptions['listTools']>;

const MCP_DISCOVERY_CACHE_TTL_MS = 30_000;

/**
 * Gemini docs best practice: keep the active tool set to roughly 10–20 so the
 * model does not mis-select and declarations do not bloat the input tokens.
 */
const MCP_TOOL_COUNT_GUIDANCE_MAX = 20;

interface McpDiscoveryCacheEntry {
  configKey: string;
  expiresAt: number;
  response: McpToolsResponse;
}

// Discovery runs on every chat turn; without a short-lived cache each user
// message pays a full /api/mcp/tools round trip. Keyed weakly by the lister
// so injected test doubles never share entries with the production fetcher.
const discoveryCache = new WeakMap<McpToolsLister, McpDiscoveryCacheEntry>();

const readCachedTools = (lister: McpToolsLister, configKey: string): McpToolsResponse | null => {
  const entry = discoveryCache.get(lister);
  if (!entry || entry.configKey !== configKey || Date.now() >= entry.expiresAt) {
    return null;
  }
  return entry.response;
};

const toSchemaType = (value: unknown): Type | undefined => {
  switch (value) {
    case 'object':
      return 'OBJECT' as Type;
    case 'array':
      return 'ARRAY' as Type;
    case 'string':
      return 'STRING' as Type;
    case 'number':
      return 'NUMBER' as Type;
    case 'integer':
      return 'INTEGER' as Type;
    case 'boolean':
      return 'BOOLEAN' as Type;
    case 'null':
      return 'NULL' as Type;
    default:
      return undefined;
  }
};

/** Pick the primary JSON Schema type when `type` is a string or array (e.g. ["string","null"]). */
const resolvePrimaryType = (schema: Record<string, unknown>): Type => {
  if (typeof schema.type === 'string') {
    return toSchemaType(schema.type) ?? ('OBJECT' as Type);
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((item): item is string => typeof item === 'string');
    const nonNull = types.find((item) => item !== 'null');
    if (nonNull) {
      return toSchemaType(nonNull) ?? ('OBJECT' as Type);
    }
    if (types.includes('null')) {
      return 'NULL' as Type;
    }
  }

  // anyOf / oneOf / allOf — prefer the first object-like branch, else first branch.
  const union = schema.anyOf ?? schema.oneOf ?? schema.allOf;
  if (Array.isArray(union)) {
    const objectBranch = union.find(
      (branch) => isRecord(branch) && (branch.type === 'object' || isRecord(branch.properties)),
    );
    if (objectBranch) {
      return resolvePrimaryType(objectBranch as Record<string, unknown>);
    }
    const first = union.find(isRecord);
    if (first) {
      return resolvePrimaryType(first);
    }
  }

  // $ref without a resolved target — treat as opaque object.
  if (typeof schema.$ref === 'string') {
    return 'OBJECT' as Type;
  }

  // Infer from structural keywords when type is missing.
  if (isRecord(schema.properties) || schema.additionalProperties !== undefined) {
    return 'OBJECT' as Type;
  }
  if (schema.items !== undefined) {
    return 'ARRAY' as Type;
  }

  return 'OBJECT' as Type;
};

const pickUnionBranch = (schema: Record<string, unknown>): Record<string, unknown> | undefined => {
  const union = schema.anyOf ?? schema.oneOf ?? schema.allOf;
  if (!Array.isArray(union)) {
    return undefined;
  }

  const objectBranch = union.find(
    (branch) => isRecord(branch) && (branch.type === 'object' || isRecord(branch.properties)),
  );
  if (isRecord(objectBranch)) {
    return objectBranch;
  }

  const first = union.find(isRecord);
  return first;
};

/**
 * Validation keywords the v1beta Gemini Schema subset understands and the SDK
 * Schema type carries. The count/length ones are proto int64s, so JSON Schema
 * numbers must be stringified; minimum/maximum stay numeric.
 */
const STRINGIFIED_CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
] as const;
const NUMERIC_CONSTRAINT_KEYS = ['minimum', 'maximum'] as const;

const copyConstraintKeywords = (source: Record<string, unknown>, target: Schema): void => {
  for (const key of STRINGIFIED_CONSTRAINT_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] = String(value);
    }
  }
  for (const key of NUMERIC_CONSTRAINT_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] = value;
    }
  }
  if (typeof source.pattern === 'string' && source.pattern) {
    target.pattern = source.pattern;
  }
  if (Array.isArray(source.propertyOrdering) && source.propertyOrdering.every((item) => typeof item === 'string')) {
    target.propertyOrdering = source.propertyOrdering as string[];
  }
};

const toGeminiSchema = (schema: unknown): Schema => {
  if (!isRecord(schema)) {
    return { type: 'OBJECT' as Type };
  }

  // Unwrap a bare anyOf/oneOf when the parent has no own type.
  const unionBranch =
    schema.type === undefined && !isRecord(schema.properties) && schema.items === undefined
      ? pickUnionBranch(schema)
      : undefined;
  const effective = unionBranch ?? schema;

  const type = resolvePrimaryType(effective);
  const geminiSchema: Schema = {
    type,
  };

  if (typeof effective.description === 'string') {
    geminiSchema.description = effective.description;
  } else if (typeof schema.description === 'string') {
    geminiSchema.description = schema.description;
  }

  if (Array.isArray(effective.enum)) {
    const enumValues = effective.enum.filter((item): item is string => typeof item === 'string');
    if (enumValues.length > 0) {
      geminiSchema.enum = enumValues;
      geminiSchema.format = 'enum';
    }
  }
  if (typeof effective.format === 'string' && !geminiSchema.format) {
    geminiSchema.format = effective.format;
  }

  copyConstraintKeywords(effective, geminiSchema);

  if (type === ('OBJECT' as Type)) {
    if (isRecord(effective.properties)) {
      geminiSchema.properties = Object.fromEntries(
        Object.entries(effective.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
      );
    }
    if (Array.isArray(effective.required)) {
      const required = effective.required.filter((item): item is string => typeof item === 'string');
      if (required.length > 0) {
        geminiSchema.required = required;
      }
    }
    // Gemini Schema supports additionalProperties as Schema | boolean in some versions;
    // map boolean true or free-form record map to an open object with empty properties.
    if (effective.additionalProperties === true || isRecord(effective.additionalProperties)) {
      geminiSchema.properties = geminiSchema.properties ?? {};
    }
  }

  if (type === ('ARRAY' as Type) && effective.items !== undefined) {
    geminiSchema.items = toGeminiSchema(effective.items);
  }

  // JSON Schema unions like ["string","null"] become the primary type plus
  // Gemini's native nullable flag (v1beta Schema supports it).
  if (Array.isArray(effective.type) && effective.type.includes('null') && type !== ('NULL' as Type)) {
    geminiSchema.nullable = true;
  }

  return geminiSchema;
};

const buildDescription = (serverName: string, tool: McpToolDefinition): string => {
  const base = `MCP tool ${tool.name} from ${serverName}.`;
  return tool.description ? `${base} ${tool.description}` : base;
};

const makeRuntimeServerEntries = (
  servers: McpServerConfig[],
): Array<{ originalServer: McpServerConfig; runtimeServer: McpServerConfig }> => {
  const usedServerIds = new Set<string>();

  return servers.map((server) => {
    let runtimeId = server.id;
    let suffix = 2;
    while (usedServerIds.has(runtimeId)) {
      runtimeId = `${server.id}__${suffix}`;
      suffix += 1;
    }
    usedServerIds.add(runtimeId);

    return {
      originalServer: server,
      runtimeServer: runtimeId === server.id ? server : { ...server, id: runtimeId },
    };
  });
};

const formatDiscoveryErrors = (errors: Array<{ serverId: string; serverName: string; error: string }>): string =>
  errors.map((entry) => `${entry.serverName || entry.serverId}: ${entry.error}`).join('; ');

/**
 * Builds Gemini client function declarations for enabled MCP servers.
 * Never throws — discovery failures are logged and result in fewer/no tools so chat can continue.
 */
export const createMcpClientFunctions = async ({
  servers,
  virtualServers = getVirtualMcpServers(),
  abortSignal,
  listTools = fetchMcpTools,
  callTool = callMcpTool,
  requestApproval,
  resolveLatestServers,
}: CreateMcpClientFunctionsOptions): Promise<StandardClientFunctions> => {
  const enabledServers = servers.filter((server) => server.enabled);
  if (enabledServers.length === 0 && virtualServers.length === 0) {
    return {};
  }

  try {
    const functions: StandardClientFunctions = {};

    for (const virtualServer of virtualServers) {
      let vTools: McpToolDefinition[] = [];
      try {
        vTools = await virtualServer.listTools();
        rememberDiscoveredTools({
          servers: [
            {
              serverId: virtualServer.id,
              serverName: virtualServer.name,
              tools: vTools,
            },
          ],
        });
      } catch (discoveryError) {
        logService.warn(`Virtual MCP tool discovery failed for ${virtualServer.id}`, { error: discoveryError });
      }

      for (const tool of vTools) {
        const functionName = toMcpFunctionName(virtualServer.id, tool.name);
        functions[functionName] = {
          declaration: {
            name: functionName,
            description: buildDescription(virtualServer.name, tool),
            parameters: toGeminiSchema(tool.inputSchema),
          },
          handler: async (args, options) => {
            const dummyServerConfig: McpServerConfig = {
              id: virtualServer.id,
              name: virtualServer.name,
              enabled: true,
              transport: 'stdio',
              disabledAutoApproveTools: virtualServer.disabledAutoApproveTools,
            };
            if (requestApproval && requiresApproval(dummyServerConfig, tool.name)) {
              const approvalKey = sessionApprovalKey(virtualServer.id, tool.name);
              if (!isSessionApproved(approvalKey)) {
                const decision = await requestApproval({
                  serverId: virtualServer.id,
                  serverName: virtualServer.name,
                  toolName: tool.name,
                  args: isRecord(args) ? args : {},
                });
                if (decision === 'deny') {
                  throw new Error(`User denied tool execution: ${tool.name}`);
                }
                if (decision === 'allow-session') {
                  rememberSessionApproval(approvalKey);
                }
              }
            }

            const callArgs = isRecord(args) ? args : {};
            const runId = beginMcpToolRun(callArgs);
            try {
              const rawResult = await virtualServer.callTool(
                tool.name,
                callArgs,
                options?.abortSignal ?? abortSignal,
                (event) => appendMcpToolProgress(runId, event),
              );
              const callError = extractMcpCallError(rawResult);
              if (callError) {
                finishMcpToolRun(runId, 'error');
                throw new Error(callError);
              }
              finishMcpToolRun(runId, 'success');
              return {
                response: summarizeMcpResultForModel(rawResult),
                generatedFiles:
                  isRecord(rawResult) && Array.isArray(rawResult.generatedFiles)
                    ? (rawResult.generatedFiles as UploadedFile[])
                    : undefined,
              };
            } catch (toolExecutionError) {
              finishMcpToolRun(runId, options?.abortSignal?.aborted ? 'cancelled' : 'error');
              throw toolExecutionError;
            }
          },
        };
      }
    }

    if (enabledServers.length > 0) {
      const runtimeServerEntries = makeRuntimeServerEntries(enabledServers);
      const runtimeServers = runtimeServerEntries.map(({ runtimeServer }) => runtimeServer);
      const lister: McpToolsLister = listTools;
      const configKey = JSON.stringify(
        runtimeServers.map((server) => ({
          id: server.id,
          name: server.name,
          transport: server.transport,
          url: server.url,
          command: server.command,
          args: server.args,
          env: server.env,
          headers: server.headers,
          auth: server.auth,
          disabledTools: server.disabledTools,
          disabledAutoApproveTools: server.disabledAutoApproveTools,
          isTrusted: server.isTrusted,
          timeout: server.timeout,
          longRunning: server.longRunning,
        })),
      );
      const cachedResponse = readCachedTools(lister, configKey);
      const toolResponse = cachedResponse ?? (await listTools(runtimeServers, abortSignal));
      if (!cachedResponse) {
        discoveryCache.set(lister, {
          configKey,
          expiresAt: Date.now() + MCP_DISCOVERY_CACHE_TTL_MS,
          response: toolResponse,
        });
      }

      if (toolResponse.errors.length > 0) {
        logService.warn(`MCP tool discovery reported errors: ${formatDiscoveryErrors(toolResponse.errors)}`, {
          errors: toolResponse.errors,
        });
      }

      const serverDisabledMap = new Map(
        runtimeServers.map((server) => [server.id, new Set(server.disabledTools ?? [])]),
      );
      const filteredServers = toolResponse.servers.map((server) => ({
        ...server,
        tools: server.tools.filter((tool) => !serverDisabledMap.get(server.serverId)?.has(tool.name)),
      }));

      const serverByRuntimeId = new Map(
        runtimeServerEntries.map(({ originalServer, runtimeServer }) => [runtimeServer.id, originalServer]),
      );

      for (const serverTools of filteredServers) {
        const server = serverByRuntimeId.get(serverTools.serverId);
        if (!server) {
          continue;
        }

        for (const tool of serverTools.tools) {
          const functionName = toMcpFunctionName(serverTools.serverId, tool.name);
          functions[functionName] = {
            declaration: {
              name: functionName,
              description: buildDescription(serverTools.serverName, tool),
              parameters: toGeminiSchema(tool.inputSchema),
            },
            handler: async (args, options) => {
              // Execution-time disable re-check: discovery results are cached
              // for 30s, so honor what the user toggled after this turn began.
              const latestServers = resolveLatestServers?.();
              const latestServer = latestServers?.find((entry) => entry.id === server.id);
              if (latestServer && (!latestServer.enabled || (latestServer.disabledTools ?? []).includes(tool.name))) {
                throw new Error(`Tool ${tool.name} on ${serverTools.serverName} was disabled by the user.`);
              }
              if (requestApproval && requiresApproval(server, tool.name)) {
                const approvalKey = sessionApprovalKey(server.id, tool.name);
                if (!isSessionApproved(approvalKey)) {
                  const decision = await requestApproval({
                    serverId: server.id,
                    serverName: serverTools.serverName,
                    toolName: tool.name,
                    args: isRecord(args) ? args : {},
                  });
                  if (decision === 'deny') {
                    throw new Error(`User denied tool execution: ${tool.name}`);
                  }
                  if (decision === 'allow-session') {
                    rememberSessionApproval(approvalKey);
                  }
                }
              }
              // Surface the call live: the card rendered from the FunctionCall
              // part holds this exact args object, so the run attaches to it.
              const callArgs = isRecord(args) ? args : {};
              const runId = beginMcpToolRun(callArgs);
              try {
                const rawResult = await callTool(
                  server,
                  tool.name,
                  callArgs,
                  options?.abortSignal ?? abortSignal,
                  (event) => appendMcpToolProgress(runId, event),
                );
                // MCP signals execution failure with isError:true on a successful
                const callError = extractMcpCallError(rawResult);
                if (callError) {
                  finishMcpToolRun(runId, 'error');
                  throw new Error(callError);
                }
                finishMcpToolRun(runId, 'success');
                return {
                  response: summarizeMcpResultForModel(rawResult),
                  generatedFiles:
                    isRecord(rawResult) && Array.isArray(rawResult.generatedFiles)
                      ? (rawResult.generatedFiles as UploadedFile[])
                      : undefined,
                };
              } catch (toolExecutionError) {
                finishMcpToolRun(runId, options?.abortSignal?.aborted ? 'cancelled' : 'error');
                throw toolExecutionError;
              }
            },
          };
        }
      }
    }

    const totalToolCount = Object.keys(functions).length;
    const totalServerCount = enabledServers.length + virtualServers.length;
    if (totalToolCount > MCP_TOOL_COUNT_GUIDANCE_MAX) {
      logService.warn(
        `${totalToolCount} MCP tools are active across ${totalServerCount} server(s). ` +
          'Gemini guidance recommends keeping the active set to about 10-20 tools to avoid mis-selection and input-token bloat.',
        { totalToolCount },
      );
    }

    return functions;
  } catch (discoveryError) {
    logService.warn('MCP tool discovery failed; continuing chat without MCP tools.', { error: discoveryError });
    return {};
  }
};
