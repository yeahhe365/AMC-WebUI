import type { ModelOption } from '@/types';

export interface ModelReconcileResult {
  newModels: ModelOption[];
  existingModels: ModelOption[];
  staleModels: ModelOption[];
  stats: {
    totalRemote: number;
    newCount: number;
    existingCount: number;
    staleCount: number;
  };
}

/**
 * Compare remote models against existing models in a connection.
 * Identifies:
 * - New models: In remote, not in existing
 * - Existing models: In both
 * - Stale models: In existing, but missing from remote API
 */
export const reconcileModels = (remoteModels: ModelOption[], existingModels: ModelOption[]): ModelReconcileResult => {
  const existingMap = new Map<string, ModelOption>();
  for (const model of existingModels) {
    existingMap.set(model.id, model);
  }

  const remoteMap = new Map<string, ModelOption>();
  for (const model of remoteModels) {
    remoteMap.set(model.id, model);
  }

  const newModels: ModelOption[] = [];
  const mergedExisting: ModelOption[] = [];

  for (const remote of remoteModels) {
    const existing = existingMap.get(remote.id);
    if (!existing) {
      newModels.push(remote);
    } else {
      // Merge: preserve user customizations (pinned, visibility, custom parameters, user name)
      // while backfilling metadata (contextWindow, capabilities, maxOutputTokens, ownedBy)
      const merged: ModelOption = {
        ...remote,
        ...existing,
        name: existing.name || remote.name || remote.id,
        contextWindow: existing.contextWindow ?? remote.contextWindow,
        maxOutputTokens: existing.maxOutputTokens ?? remote.maxOutputTokens,
        capabilities: existing.capabilities ?? remote.capabilities,
        ownedBy: existing.ownedBy ?? remote.ownedBy,
      };
      mergedExisting.push(merged);
    }
  }

  const staleModels: ModelOption[] = [];
  for (const existing of existingModels) {
    if (!remoteMap.has(existing.id)) {
      staleModels.push(existing);
    }
  }

  return {
    newModels,
    existingModels: mergedExisting,
    staleModels,
    stats: {
      totalRemote: remoteModels.length,
      newCount: newModels.length,
      existingCount: mergedExisting.length,
      staleCount: staleModels.length,
    },
  };
};

export interface ApplyReconcileOptions {
  existingModels: ModelOption[];
  selectedNewModels?: ModelOption[];
  removeStaleModelIds?: Set<string>;
  updateMetadataFromRemote?: Map<string, ModelOption>;
}

/**
 * Produce the final ModelOption list after user decides what to import or clean up.
 */
export const applyModelReconcile = ({
  existingModels,
  selectedNewModels = [],
  removeStaleModelIds = new Set<string>(),
  updateMetadataFromRemote = new Map<string, ModelOption>(),
}: ApplyReconcileOptions): ModelOption[] => {
  // 1. Filter out stale models that user chose to remove
  let result: ModelOption[] = existingModels.filter((m) => !removeStaleModelIds.has(m.id));

  // 2. Update existing models with fresh metadata if provided
  result = result.map((m) => {
    const remote = updateMetadataFromRemote.get(m.id);
    if (!remote) return m;
    return {
      ...m,
      contextWindow: m.contextWindow ?? remote.contextWindow,
      maxOutputTokens: m.maxOutputTokens ?? remote.maxOutputTokens,
      capabilities: m.capabilities ?? remote.capabilities,
      ownedBy: m.ownedBy ?? remote.ownedBy,
    };
  });

  // 3. Append newly selected models (deduplicated by ID)
  const existingIds = new Set(result.map((m) => m.id));
  for (const newModel of selectedNewModels) {
    if (!existingIds.has(newModel.id)) {
      result.push(newModel);
      existingIds.add(newModel.id);
    }
  }

  return result;
};
