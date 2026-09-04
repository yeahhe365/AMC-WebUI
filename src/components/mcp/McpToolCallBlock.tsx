import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, Check, ChevronDown, Copy, Hourglass, Loader2, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { extractMcpResultSegments } from '@/features/mcp/mcpResultSummary';
import { resolveToolDisplay } from '@/features/mcp/toolDisplayNames';
import { useMcpApprovalStore } from '@/stores/mcpApprovalStore';
import { useMcpToolRun, type McpToolRunEvent } from '@/stores/mcpToolRuntimeStore';

import type { FunctionCall, Part } from '@google/genai';

const MAX_ARG_VALUE_LENGTH = 4000;

export type McpToolCallStatus = 'invoking' | 'success' | 'error' | 'cancelled';

const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m${String(totalSeconds % 60).padStart(2, '0')}s`;
};

/** Finished-run duration with tenth-second precision below a minute. */
const formatDuration = (ms: number): string => {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatElapsed(ms);
};

/** Per-line stamp relative to run start: +0s, +3s, +1m05s. */
const formatRelativeStamp = (ms: number): string => `+${formatElapsed(Math.max(0, ms))}`;

/** One progress line: server message when present, else the raw counter. */
const formatProgressLine = (event: McpToolRunEvent): string => {
  if (event.message) {
    const counter =
      typeof event.progress === 'number' && typeof event.total === 'number'
        ? ` (${event.progress}/${event.total})`
        : '';
    return `${event.message}${counter}`;
  }
  if (typeof event.progress === 'number') {
    return typeof event.total === 'number' ? `${event.progress}/${event.total}` : String(event.progress);
  }
  return '…';
};

export const McpToolCallBlock: React.FC<{
  call: FunctionCall;
  responsePart?: Part | null;
  status: McpToolCallStatus;
  autoApproved?: boolean;
}> = ({ call, responsePart, status, autoApproved }) => {
  const { t } = useI18n();
  // Follow the call lifecycle until the user takes over: running calls stay
  // expanded, finished ones collapse so tool output never floods the transcript.
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? status === 'invoking';
  const [copied, setCopied] = useState(false);

  // Live elapsed time while running; freezes at the last tick once settled.
  const [liveMs, setLiveMs] = useState<number | null>(null);
  useEffect(() => {
    if (status !== 'invoking') return;
    const startedAt = Date.now();
    setLiveMs(0);
    const id = window.setInterval(() => setLiveMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // Live progress run: correlated by object identity of the call's args, so it
  // matches the executing handler exactly. Absent for servers without progress.
  const run = useMcpToolRun(call?.args);
  const events = run?.events ?? [];
  const latestEvent = events.length > 0 ? events[events.length - 1] : undefined;
  const latestTotalEvent = [...events].reverse().find((event) => typeof event.total === 'number');
  const isRunningLive = run?.status === 'running';
  const percent =
    isRunningLive && latestTotalEvent
      ? Math.max(
          0,
          Math.min(100, Math.round(((latestTotalEvent.progress ?? 0) / (latestTotalEvent.total as number)) * 100)),
        )
      : null;

  const [logOverride, setLogOverride] = useState<boolean | null>(null);
  const logOpen = logOverride ?? (run?.status === 'error' ? true : isRunningLive);

  // Finished-run header summary: "12.4s · 8 steps" on success,
  // "5.2s · failed at step 6" on error. Runs are memory-only, so cards from
  // reloaded history keep the plain settled label.
  const finishedSummary = (() => {
    if (!run || run.status === 'running' || run.endedAt === undefined) return undefined;
    const duration = formatDuration(run.endedAt - run.startedAt);
    if (status === 'success') {
      if (events.length === 0) return duration;
      return `${duration} · ${t('mcpToolStepCount').replace('{n}', String(events.length))}`;
    }
    if (status === 'error') {
      return events.length > 0
        ? `${duration} · ${t('mcpToolFailedAtStep').replace('{n}', String(events.length))}`
        : duration;
    }
    return undefined;
  })();

  // Keep the live log pinned to the newest line while streaming in (container
  // scrollTop, not scrollIntoView, so ancestors never jump).
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = logContainerRef.current;
    if (container && logOpen) container.scrollTop = container.scrollHeight;
  }, [logOpen, events.length]);

  // Discovery responses are replayed into readable titles; unmatched names
  // (e.g. before the first discovery) fall back to the wire name.
  const display = resolveToolDisplay(String(call?.name ?? ''));
  const pendingApproval = useMcpApprovalStore((state) => state.pending);
  const awaitingApproval =
    status === 'invoking' &&
    !!pendingApproval &&
    !!display &&
    pendingApproval.request.serverId === display.serverId &&
    pendingApproval.request.toolName === display.toolName;

  const argsStr = JSON.stringify(call.args, null, 2);
  const truncated = argsStr.length > MAX_ARG_VALUE_LENGTH ? argsStr.slice(0, MAX_ARG_VALUE_LENGTH) + '…' : argsStr;
  const responseSegments = extractMcpResultSegments(responsePart?.functionResponse?.response);

  const statusLabel = awaitingApproval
    ? t('mcpToolStatusAwaitingApproval')
    : status === 'invoking'
      ? t('mcpToolStatusRunning')
      : status === 'success'
        ? t('mcpToolStatusDone')
        : status === 'error'
          ? t('mcpToolStatusError')
          : t('mcpToolStatusCancelled');

  // Current step preview stays visible without expanding the card; the header
  // bar is determinate when the server reports totals, otherwise a subtle
  // indeterminate shimmer keeps "something is happening" visible.
  const showCurrentStep = status === 'invoking' && !awaitingApproval && latestEvent !== undefined;
  const showHeaderBar = isRunningLive && !awaitingApproval;

  return (
    <div className="rounded-lg border bg-[var(--theme-bg-secondary)] my-2">
      <button onClick={() => setManualExpanded(!expanded)} className="w-full px-3 py-2 text-sm text-left">
        <div className="flex w-full items-center justify-between gap-2">
          <span className="font-mono text-xs truncate min-w-0">
            {display ? `${display.serverName} : ${display.toolName}` : call.name}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {autoApproved && <ShieldCheck data-testid="mcp-shield" className="h-3.5 w-3.5 text-emerald-600" />}
            <span
              data-testid="mcp-tool-status"
              className={`flex items-center gap-1.5 text-[11px] ${
                status === 'error' ? 'text-[var(--theme-text-danger)]' : 'text-[var(--theme-text-secondary)]'
              }`}
            >
              {awaitingApproval && <Hourglass className="h-3 w-3 animate-pulse text-amber-500" />}
              {statusLabel}
              {status === 'invoking' && !awaitingApproval && (
                <span className="tabular-nums">{formatElapsed(liveMs ?? 0)}</span>
              )}
              {finishedSummary && <span className="tabular-nums">&nbsp;({finishedSummary})</span>}
            </span>
            {status === 'invoking' ? (
              awaitingApproval ? null : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )
            ) : status === 'success' ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : status === 'cancelled' ? (
              <Ban data-testid="mcp-tool-cancelled" className="h-4 w-4 text-[var(--theme-text-tertiary)]" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
          </span>
        </div>
        {showCurrentStep && (
          <div
            data-testid="mcp-tool-current-step"
            className="mt-1 flex w-full items-center gap-1.5 text-[11px] text-[var(--theme-text-secondary)]"
          >
            <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            <span className="truncate font-mono">{formatProgressLine(latestEvent as McpToolRunEvent)}</span>
          </div>
        )}
        {showHeaderBar && (
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-[var(--theme-bg-tertiary)]">
            {percent !== null ? (
              <div
                data-testid="mcp-tool-progress-fill"
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            ) : (
              <div
                data-testid="mcp-tool-progress-shimmer"
                className="mcp-indeterminate-bar h-full w-1/4 rounded-full bg-emerald-500/60"
              />
            )}
          </div>
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-xs">
          <pre className="overflow-auto max-h-[300px] whitespace-pre-wrap">{truncated}</pre>
          {argsStr.length > MAX_ARG_VALUE_LENGTH && (
            <div className="text-[11px] text-muted">{t('mcpToolTruncated')}</div>
          )}
          {events.length > 0 && (
            <>
              <button
                onClick={() => setLogOverride(!logOpen)}
                data-testid="mcp-tool-log-toggle"
                className="mt-2 flex items-center gap-1 text-[11px] text-[var(--theme-text-secondary)]"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${logOpen ? '' : '-rotate-90'}`} />
                {t('mcpToolProgressTitle')} · {events.length}
              </button>
              {logOpen && (
                <div
                  ref={logContainerRef}
                  data-testid="mcp-tool-progress-log"
                  className="mt-1 overflow-auto max-h-[200px] rounded border border-[var(--theme-bg-tertiary)] bg-[var(--theme-bg-primary)] p-2 font-mono text-[11px] leading-relaxed"
                >
                  {events.map((event, index) => (
                    <div
                      key={index}
                      className="animate-in fade-in whitespace-pre-wrap text-[var(--theme-text-secondary)]"
                    >
                      {run && typeof event.at === 'number' && (
                        <span className="mr-2 tabular-nums text-[var(--theme-text-tertiary)]">
                          {formatRelativeStamp(event.at - run.startedAt)}
                        </span>
                      )}
                      {formatProgressLine(event)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="mt-2 overflow-auto max-h-[300px]">
            {responseSegments.map((segment, index) =>
              segment.kind === 'image' ? (
                <img key={index} src={segment.src} alt="tool-result-image" className="max-w-full rounded border my-1" />
              ) : (
                <pre key={index} className="whitespace-pre-wrap">
                  {segment.text}
                </pre>
              ),
            )}
          </div>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(
                JSON.stringify({ params: call.args, response: responsePart?.functionResponse?.response }, null, 2),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 flex items-center gap-1 text-[11px]"
          >
            <Copy className="h-3 w-3" />
            {copied ? t('mcpToolCopied') : t('mcpToolCopy')}
          </button>
        </div>
      )}
    </div>
  );
};
