import { dbService, type ApiUsageExactPricing } from '@/services/db/dbService';
import type { LogCategory, LogEntry, LogLevel } from '@/types/logging';
import {
  createLogUsageTracker,
  type ApiKeyListener,
  type TokenUsageInput,
  type TokenUsageListener,
} from './logUsageTracker';

type LogListener = (newLogs: LogEntry[]) => void;

interface LogOptions {
  category?: LogCategory;
  data?: unknown;
}

interface ErrorLogOptions extends LogOptions {
  error?: unknown;
}

const LOG_RETENTION_DAYS = 2;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * MILLISECONDS_PER_DAY;
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_THRESHOLD_COUNT = 50;
const MAX_SERIALIZED_STRING_LENGTH = 5000;
const TRUNCATED_STRING_SUFFIX = '...[TRUNCATED]';

class LogServiceImpl {
  private listeners: Set<LogListener> = new Set();
  private usageTracker = createLogUsageTracker((message, error) => {
    console.error(message, error);
  });

  // Buffered DB writes keep logging responsive during bursts.
  private logBuffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private activeFlushPromise: Promise<void> | null = null;
  private isClearing = false;
  // Logging gate, default OFF: the module initializes before settings load,
  // so constructor and early-call logs are dropped until settings confirm on.
  private enabled = false;

  constructor() {
    this.pruneOldLogs();
    // Dropped while disabled (default); persisted once settings flip enabled on.
    this.info('Log service initialized (IndexedDB Batched Mode).', { category: 'SYSTEM' });
  }

  /**
   * Flips the logging gate. Wired by the settings store on load/save/cross-tab
   * sync — never import the store here (it already imports this service; that
   * would be a cycle). Enabling emits one confirm log (persisted, because the
   * gate is already open by the time info() runs); disabling drops any
   * un-flushed buffer and cancels the pending flush.
   */
  public setEnabled(value: boolean) {
    if (value === this.enabled) return;
    this.enabled = value;

    if (value) {
      this.info('Logging enabled.', { category: 'SYSTEM' });
    } else {
      this.logBuffer = [];
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    }
  }

  private createLogEntry(level: LogLevel, category: LogCategory, message: string, data?: unknown): LogEntry {
    return {
      timestamp: new Date(),
      level,
      category,
      message,
      data: this.safeSerialize(data),
    };
  }

  private safeSerialize(data: unknown): unknown {
    if (data === undefined || data === null) return undefined;
    try {
      const seenObjects = new WeakSet<object>();
      return JSON.parse(
        JSON.stringify(data, (_key: string, value: unknown) => {
          if (value instanceof Error) {
            return this.serializeError(value);
          }
          if (typeof value === 'object' && value !== null) {
            if (seenObjects.has(value)) return '[Circular]';
            seenObjects.add(value);
          }
          if (typeof value === 'string' && value.length > MAX_SERIALIZED_STRING_LENGTH) {
            return value.substring(0, MAX_SERIALIZED_STRING_LENGTH) + TRUNCATED_STRING_SUFFIX;
          }
          return value;
        }),
      );
    } catch {
      return '[Serialization Failed]';
    }
  }

  private isLogOptions(value: unknown): value is LogOptions {
    return typeof value === 'object' && value !== null && ('category' in value || 'data' in value);
  }

  private isErrorLogOptions(value: unknown): value is ErrorLogOptions {
    return typeof value === 'object' && value !== null && ('error' in value || 'category' in value || 'data' in value);
  }

  private inferCategory(message: string, data?: unknown): LogCategory {
    const dataText = typeof data === 'string' ? data : data instanceof Error ? `${data.name} ${data.message}` : '';
    const haystack = `${message} ${dataText}`.toLowerCase();

    if (
      /\buser\b|\bclearing\b|\bdeleting\b|\brenaming\b|\bmoving\b|\bretrying\b|\brequested\b|\bcancelled\b|\bstopped\b|\bstarting new chat\b|\bmessage edit\b|\btoggling pin\b|\badding new group\b/.test(
        haystack,
      )
    ) {
      return 'USER';
    }
    if (
      /\bapi key\b|\bauth\b|\bcredential\b|\bproxy\b|\btoken endpoint\b|\bephemeral token\b|\blocked key\b/.test(
        haystack,
      )
    ) {
      return 'AUTH';
    }
    if (
      /\bfile\b|\bupload\b|\bdownload\b|\bexport\b|\bimport\b|\bpdf\b|\bdocx\b|\bzip\b|\baudio\b|\bimage\b|\bpreview\b/.test(
        haystack,
      )
    ) {
      return 'FILE';
    }
    if (
      /\bindexeddb\b|\bdb\b|\bdatabase\b|\bpersist\b|\bstorage\b|\bsession\b|\bhistory\b|\bgroup\b|\bscenario\b|\bsettings\b|\bsync\b/.test(
        haystack,
      )
    ) {
      return 'DB';
    }
    if (
      /\bstream(?:ing)?\b|\bconnect(?:ed|ion)?\b|\breconnect(?:ing|ion)?\b|\bdisconnect(?:ed|ion)?\b|\bfetch\b|\bnetwork\b|\bpoll(?:ing)?\b|\blive api\b|\bwebsocket\b|\bhttp\b/.test(
        haystack,
      )
    ) {
      return 'NETWORK';
    }
    if (
      /\bmodel\b|\btoken(?:s)?\b|\btranslate|translation\b|\bsuggestions?\b|\btitle generation\b|\btts\b|\bspeech\b|\btranscrib(?:e|ing|ed)\b|\bgeneratecontent\b|\bgemini\b|\bpyodide\b|\blocalpython\b|\blive artifacts\b/.test(
        haystack,
      )
    ) {
      return 'MODEL';
    }

    return 'SYSTEM';
  }

  private resolveCategory(message: string, options: unknown): LogCategory {
    if (this.isLogOptions(options) && options.category) {
      return options.category;
    }

    return this.inferCategory(message, this.resolveData(options));
  }

  private resolveData(options: unknown): unknown {
    return this.isLogOptions(options) ? options.data : options;
  }

  private scheduleFlush() {
    if (this.isClearing || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private queueLog(entry: LogEntry) {
    if (this.isClearing) return;

    this.logBuffer.push(entry);

    // Notify listeners immediately for "live" feeling, even if not persisted yet
    this.notifyListeners([entry]);

    if (this.logBuffer.length >= FLUSH_THRESHOLD_COUNT) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private async flush() {
    if (this.logBuffer.length === 0) return;

    if (this.activeFlushPromise) {
      await this.activeFlushPromise;
      if (this.logBuffer.length === 0) return;
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const logsToSave = [...this.logBuffer];
    this.logBuffer = [];
    let flushSucceeded = false;

    let flushPromise: Promise<void> | null = null;
    flushPromise = (async () => {
      try {
        await dbService.addLogs(logsToSave);
        flushSucceeded = true;
      } catch (flushError) {
        console.error('Failed to flush logs to DB:', flushError);
        if (!this.isClearing) {
          this.logBuffer = [...logsToSave, ...this.logBuffer];
          this.scheduleFlush();
        }
      }
    })().finally(() => {
      if (this.activeFlushPromise === flushPromise) {
        this.activeFlushPromise = null;
      }
    });

    this.activeFlushPromise = flushPromise;
    await flushPromise;

    if (flushSucceeded && this.logBuffer.length > 0 && !this.isClearing) {
      await this.flush();
    }
  }

  private notifyListeners(newLogs: LogEntry[]) {
    const listenersToNotify = Array.from(this.listeners);
    for (const listener of listenersToNotify) {
      listener(newLogs);
    }
  }

  private async pruneOldLogs() {
    try {
      const cutoff = Date.now() - LOG_RETENTION_MS;
      await dbService.pruneLogs(cutoff);
    } catch (pruneError) {
      console.error('Failed to prune old logs:', pruneError);
    }
  }

  /**
   * Standard log methods.
   * Data argument is optional.
   * Category defaults to SYSTEM if not specified in options or inferred.
   */
  public info(message: string, options?: LogOptions | unknown) {
    if (!this.enabled) return;
    const category = this.resolveCategory(message, options);
    const data = this.resolveData(options);
    this.queueLog(this.createLogEntry('INFO', category, message, data));
  }

  public warn(message: string, options?: LogOptions | unknown) {
    if (!this.enabled) return;
    const category = this.resolveCategory(message, options);
    const data = this.resolveData(options);
    this.queueLog(this.createLogEntry('WARN', category, message, data));
  }

  public error(message: string, options?: ErrorLogOptions | unknown) {
    // When disabled, errors still reach the browser console (it does not
    // persist) so production issues stay inspectable, but nothing is queued or
    // written to IndexedDB. The raw error (when provided) gives a full stack,
    // not the serialized copy used for storage.
    if (!this.enabled) {
      const rawError = this.isErrorLogOptions(options) && options.error !== undefined ? options.error : options;
      console.error(message, rawError);
      return;
    }
    const category = this.resolveCategory(message, options);
    // Extract 'error' object if passed explicitly for better stack tracing
    const dataCandidate = this.resolveData(options);
    let data = dataCandidate instanceof Error ? this.serializeError(dataCandidate) : dataCandidate;

    if (this.isErrorLogOptions(options) && options.error !== undefined) {
      const serializedError = this.serializeError(options.error);
      data =
        typeof data === 'object' && data !== null && !Array.isArray(data)
          ? { ...(data as Record<string, unknown>), error: serializedError }
          : { error: serializedError, data };
    }
    this.queueLog(this.createLogEntry('ERROR', category, message, data));
  }

  public debug(message: string, options?: LogOptions | unknown) {
    if (!this.enabled) return;
    const category = this.resolveCategory(message, options);
    const data = this.resolveData(options);
    this.queueLog(this.createLogEntry('DEBUG', category, message, data));
  }

  private serializeError(error: unknown): unknown {
    if (error instanceof Error) {
      const normalizedError = error as Error & { cause?: unknown };
      return {
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: normalizedError.cause,
      };
    }
    return error;
  }

  public recordApiKeyUsage(apiKey: string) {
    this.usageTracker.recordApiKeyUsage(apiKey);
  }

  public recordTokenUsage(modelId: string, usage: TokenUsageInput, exactPricing?: ApiUsageExactPricing) {
    this.usageTracker.recordTokenUsage(modelId, usage, exactPricing);
  }

  /**
   * Subscribes to NEW logs as they happen (for live view).
   */
  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeToApiKeys(listener: ApiKeyListener): () => void {
    return this.usageTracker.subscribeToApiKeys(listener);
  }

  public subscribeToTokenUsage(listener: TokenUsageListener): () => void {
    return this.usageTracker.subscribeToTokenUsage(listener);
  }

  /**
   * Fetches logs from DB with pagination after flushing buffered entries.
   */
  public async getRecentLogs(limit = 200, offset = 0): Promise<LogEntry[]> {
    await this.flush();
    return dbService.getLogs(limit, offset);
  }

  public async clearLogs() {
    this.isClearing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.logBuffer = [];
    try {
      if (this.activeFlushPromise) {
        await this.activeFlushPromise;
      }
      await dbService.clearLogs();
      await dbService.clearApiUsage();
      this.usageTracker.clear();
    } finally {
      this.isClearing = false;
    }
  }
}

export const logService = new LogServiceImpl();
