import { useMemo } from 'react';
import { create } from 'zustand';
import type { McpToolProgressEvent } from '@/services/api/mcpApi';
import { isRecord } from '../../shared/predicates';

export type McpToolRunStatus = 'running' | 'success' | 'error' | 'cancelled';

/** One progress line as stored: server payload plus local arrival time. */
export interface McpToolRunEvent {
  progress?: number;
  total?: number;
  message?: string;
  /** Local clock when the notification arrived; powers the per-line +Ns stamps. */
  at: number;
}

/** Live execution record of one MCP tool call, surfaced inside its call card. */
export interface McpToolRun {
  runId: number;
  status: McpToolRunStatus;
  startedAt: number;
  endedAt?: number;
  events: McpToolRunEvent[];
}

const MAX_EVENTS_PER_RUN = 200;
const MAX_FINISHED_RUNS = 100;

interface McpToolRuntimeState {
  /** Bumped on every mutation so reference-stable selectors can re-read. */
  version: number;
  runsById: Record<number, McpToolRun>;
}

const useMcpToolRuntimeStoreBase = create<McpToolRuntimeState>(() => ({
  version: 0,
  runsById: {},
}));

/**
 * Maps the exact `call.args` object a handler executes with to its run id.
 * The rendered card holds the same FunctionCall part (and therefore the same
 * args reference) from store to render, giving collision-free correlation
 * without touching persisted history. Entries die with their parts via GC;
 * a stale id whose run was pruned simply resolves to no run.
 */
const runIdsByArgs = new WeakMap<object, number>();

let nextRunId = 1;

const setRuns = (mutate: (runs: Record<number, McpToolRun>) => Record<number, McpToolRun>): void =>
  useMcpToolRuntimeStoreBase.setState((state) => ({
    version: state.version + 1,
    runsById: mutate(state.runsById),
  }));

/** Registers a running call; returns undefined when args is not an object. */
export const beginMcpToolRun = (argsRef: unknown): number | undefined => {
  if (!isRecord(argsRef)) return undefined;
  const runId = nextRunId;
  nextRunId += 1;
  runIdsByArgs.set(argsRef, runId);
  setRuns((runs) => ({ ...runs, [runId]: { runId, status: 'running', startedAt: Date.now(), events: [] } }));
  return runId;
};

export const appendMcpToolProgress = (runId: number | undefined, event: McpToolProgressEvent): void => {
  if (runId === undefined) return;
  setRuns((runs) => {
    const run = runs[runId];
    if (!run || run.status !== 'running') return runs;
    return {
      ...runs,
      [runId]: { ...run, events: [...run.events.slice(-(MAX_EVENTS_PER_RUN - 1)), { ...event, at: Date.now() }] },
    };
  });
};

const pruneOldestFinishedRuns = (runs: Record<number, McpToolRun>): Record<number, McpToolRun> => {
  const finished = Object.values(runs)
    .filter((run) => run.status !== 'running')
    .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  const excess = finished.length - MAX_FINISHED_RUNS;
  if (excess <= 0) return runs;
  const nextRuns = { ...runs };
  for (const run of finished.slice(0, excess)) {
    delete nextRuns[run.runId];
  }
  return nextRuns;
};

export const finishMcpToolRun = (runId: number | undefined, status: Exclude<McpToolRunStatus, 'running'>): void => {
  if (runId === undefined) return;
  setRuns((runs) => {
    const run = runs[runId];
    if (!run || run.status !== 'running') return runs;
    return pruneOldestFinishedRuns({ ...runs, [runId]: { ...run, status, endedAt: Date.now() } });
  });
};

const getMcpToolRunForArgs = (argsRef: unknown): McpToolRun | undefined => {
  if (!isRecord(argsRef)) return undefined;
  const { runsById } = useMcpToolRuntimeStoreBase.getState();
  const runId = runIdsByArgs.get(argsRef);
  return runId === undefined ? undefined : runsById[runId];
};

/**
 * Subscribes a card to its run. Correlation relies on object identity of the
 * args, so the selector reads through the WeakMap on every version bump
 * instead of keying by value (which would merge identical parallel calls).
 */
export const useMcpToolRun = (argsRef: unknown): McpToolRun | undefined => {
  const version = useMcpToolRuntimeStoreBase((state) => state.version);
  return useMemo(() => {
    void version;
    return getMcpToolRunForArgs(argsRef);
  }, [argsRef, version]);
};
