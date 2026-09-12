import type { ModelOption, ThirdPartyApiProtocol, ThirdPartyConnection, ThirdPartyTemplateId } from '@/types';
import { THIRD_PARTY_TEMPLATE_IDS } from '@/types';
import {
  addThirdPartyConnection,
  createConnectionFromTemplate,
  createConnectionId,
  nextConnectionName,
  updateThirdPartyConnection,
} from '@/utils/thirdPartyApiProviders';

type PatchUpdateSet = Partial<Pick<ThirdPartyConnection, 'name' | 'baseUrl' | 'protocol' | 'enabled' | 'modelId'>>;

export type ApprovalReason =
  | 'endpoint-exists'
  | 'overwrite-baseUrl'
  | 'clear-baseUrl'
  | 'overwrite-protocol'
  | 'overwrite-modelId'
  | 'replace-models'
  | 'delete-connection';

export interface FieldDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export type ProviderPatch =
  | {
      op: 'create';
      templateId: ThirdPartyTemplateId;
      name?: string;
      baseUrl?: string;
      protocol?: ThirdPartyApiProtocol;
      modelId?: string;
      models?: ModelOption[];
    }
  | {
      op: 'update';
      connectionId: string;
      set?: PatchUpdateSet;
      addModels?: ModelOption[];
      replaceModels?: ModelOption[];
    }
  | { op: 'delete'; connectionId: string };

export type PatchVerdict =
  | { kind: 'apply'; connectionId: string; changed: string[]; nextConnections: ThirdPartyConnection[] }
  | {
      kind: 'needs-approval';
      connectionId: string;
      reason: ApprovalReason;
      diff: FieldDiff[];
      nextConnections: ThirdPartyConnection[];
    }
  | { kind: 'rejected'; error: string };

/**
 * Comparison form for endpoint identity. Deliberately ignores trailing slashes,
 * host case and default ports so "https://API.test:443/v1/" and
 * "https://api.test/v1" are not reported as two different endpoints (which
 * would demand an approval prompt for a no-op).
 */
export const normalizeBaseUrlForCompare = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const port = parsed.port === '443' || parsed.port === '80' ? '' : parsed.port;
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port ? `:${port}` : ''}${path}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};

export const findEndpointConflict = (
  connections: ThirdPartyConnection[],
  protocol: ThirdPartyApiProtocol,
  baseUrl: string | null | undefined,
): ThirdPartyConnection | undefined => {
  const target = normalizeBaseUrlForCompare(baseUrl);
  if (!target) {
    return undefined;
  }

  return connections.find(
    (connection) => connection.protocol === protocol && normalizeBaseUrlForCompare(connection.baseUrl) === target,
  );
};

const diffOf = (field: string, before: unknown, after: unknown): FieldDiff => ({
  field,
  before: before === null || before === undefined ? null : String(before),
  after: after === null || after === undefined ? null : String(after),
});

const modelsSignature = (models: ModelOption[]): string => models.map((model) => model.id).join(',');

const planCreate = (
  patch: Extract<ProviderPatch, { op: 'create' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  if (!(THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(patch.templateId)) {
    return { kind: 'rejected', error: `Unknown template: ${String(patch.templateId)}` };
  }

  const draft = createConnectionFromTemplate(patch.templateId, connections, createConnectionId());
  if (patch.name !== undefined && patch.name.trim()) {
    // The factory de-duplicates the template's own name; an explicitly
    // requested name has to go through the same helper, otherwise a repeat
    // request for an existing name would create two identically named rows.
    draft.name = nextConnectionName(connections, patch.name.trim());
  }
  if (patch.baseUrl !== undefined) {
    draft.baseUrl = patch.baseUrl.trim() || null;
  }
  if (patch.protocol !== undefined) {
    draft.protocol = patch.protocol;
  }
  if (patch.modelId !== undefined && patch.modelId.trim()) {
    draft.modelId = patch.modelId.trim();
  }
  if (patch.models !== undefined && patch.models.length > 0) {
    draft.models = patch.models;
  }

  const conflict = findEndpointConflict(connections, draft.protocol, draft.baseUrl);
  if (conflict) {
    return {
      kind: 'needs-approval',
      connectionId: conflict.id,
      reason: 'endpoint-exists',
      diff: [diffOf('baseUrl', conflict.baseUrl, draft.baseUrl), diffOf('name', conflict.name, draft.name)],
      nextConnections: updateThirdPartyConnection({ connections }, conflict.id, {
        name: draft.name,
        baseUrl: draft.baseUrl,
        protocol: draft.protocol,
        modelId: draft.modelId,
        models: draft.models,
      }).connections,
    };
  }

  return {
    kind: 'apply',
    connectionId: draft.id,
    changed: ['created'],
    nextConnections: addThirdPartyConnection({ connections }, draft).connections,
  };
};

const planUpdate = (
  patch: Extract<ProviderPatch, { op: 'update' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  const current = connections.find((connection) => connection.id === patch.connectionId);
  if (!current) {
    return { kind: 'rejected', error: `Connection not found: ${patch.connectionId}` };
  }

  const nextSet: PatchUpdateSet = {};
  const changed: string[] = [];
  const destructive: Array<{ reason: ApprovalReason; diff: FieldDiff }> = [];

  if (patch.set?.name !== undefined) {
    const after = patch.set.name.trim();
    if (after && after !== current.name) {
      nextSet.name = after;
      changed.push('name');
    }
  }

  if (patch.set?.baseUrl !== undefined) {
    // baseUrl is `string | null` on the connection, so a caller may pass null
    // to mean "clear it" — trim only applies to a real string.
    const requestedBaseUrl = patch.set.baseUrl;
    const after = requestedBaseUrl === null ? null : requestedBaseUrl.trim() || null;
    if (normalizeBaseUrlForCompare(current.baseUrl) !== normalizeBaseUrlForCompare(after)) {
      nextSet.baseUrl = after;
      if (!current.baseUrl?.trim()) {
        changed.push('baseUrl');
      } else {
        destructive.push({
          reason: after === null ? 'clear-baseUrl' : 'overwrite-baseUrl',
          diff: diffOf('baseUrl', current.baseUrl, after),
        });
      }
    }
  }

  if (patch.set?.protocol !== undefined && patch.set.protocol !== current.protocol) {
    nextSet.protocol = patch.set.protocol;
    destructive.push({ reason: 'overwrite-protocol', diff: diffOf('protocol', current.protocol, patch.set.protocol) });
  }

  if (patch.set?.modelId !== undefined) {
    const after = patch.set.modelId.trim();
    if (after && after !== current.modelId) {
      nextSet.modelId = after;
      if (current.modelId?.trim()) {
        destructive.push({ reason: 'overwrite-modelId', diff: diffOf('modelId', current.modelId, after) });
      } else {
        changed.push('modelId');
      }
    }
  }

  if (patch.set?.enabled !== undefined && patch.set.enabled !== current.enabled) {
    nextSet.enabled = patch.set.enabled;
    changed.push('enabled');
  }

  let nextModels = current.models;
  if (patch.addModels?.length) {
    const existingIds = new Set(current.models.map((model) => model.id));
    const additions = patch.addModels.filter((model) => !existingIds.has(model.id));
    if (additions.length > 0) {
      nextModels = [...current.models, ...additions];
      changed.push('addModels');
    }
  }

  if (patch.replaceModels && modelsSignature(patch.replaceModels) !== modelsSignature(current.models)) {
    destructive.push({
      reason: 'replace-models',
      diff: diffOf('models', modelsSignature(current.models), modelsSignature(patch.replaceModels)),
    });
    nextModels = patch.replaceModels;
  }

  if (changed.length === 0 && destructive.length === 0) {
    return { kind: 'apply', connectionId: current.id, changed: [], nextConnections: connections };
  }

  const nextConnections = updateThirdPartyConnection({ connections }, current.id, {
    ...nextSet,
    ...(nextModels === current.models ? {} : { models: nextModels }),
  }).connections;

  if (destructive.length > 0) {
    return {
      kind: 'needs-approval',
      connectionId: current.id,
      reason: destructive[0].reason,
      diff: destructive.map((entry) => entry.diff),
      nextConnections,
    };
  }

  return { kind: 'apply', connectionId: current.id, changed, nextConnections };
};

const planDelete = (
  patch: Extract<ProviderPatch, { op: 'delete' }>,
  connections: ThirdPartyConnection[],
): PatchVerdict => {
  const current = connections.find((connection) => connection.id === patch.connectionId);
  if (!current) {
    return { kind: 'rejected', error: `Connection not found: ${patch.connectionId}` };
  }

  return {
    kind: 'needs-approval',
    connectionId: current.id,
    reason: 'delete-connection',
    diff: [diffOf('connection', current.name, null)],
    nextConnections: connections.filter((connection) => connection.id !== current.id),
  };
};

export const planProviderPatch = (patch: ProviderPatch, connections: ThirdPartyConnection[]): PatchVerdict => {
  switch (patch.op) {
    case 'create':
      return planCreate(patch, connections);
    case 'update':
      return planUpdate(patch, connections);
    case 'delete':
      return planDelete(patch, connections);
  }
};
