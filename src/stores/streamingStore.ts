type Listener = () => void;

const STREAM_ENTRY_TTL_MS = 5 * 60_000;

/** 流式通知节流间隔：约 15fps 上限；首 chunk 立即 flush，后续 ≤66ms 一帧。 */
export const STREAM_NOTIFY_INTERVAL_MS = 66;

/**
 * 未 flush 过的哨兵值：任何 `performance.now()` 减去它都 ≥ INTERVAL，
 * 保证新 generation 的第一个 chunk 立即触发 leading flush。
 */
const THROTTLE_NEVER_FLUSHED = -STREAM_NOTIFY_INTERVAL_MS;

export class StreamingStore {
  private content = new Map<string, string>();
  private thoughts = new Map<string, string>();
  private listeners = new Map<string, Set<Listener>>();
  private touchedAt = new Map<string, number>();
  private pendingNotifyIds = new Set<string>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushAt = THROTTLE_NEVER_FLUSHED;

  private touch(id: string, now = Date.now()) {
    this.touchedAt.set(id, now);
  }

  updateContent(id: string, text: string) {
    this.sweepExpiredEntries();
    const current = this.content.get(id) || '';
    this.content.set(id, current + text);
    this.touch(id);
    this.notify(id);
  }

  updateThoughts(id: string, text: string) {
    this.sweepExpiredEntries();
    const current = this.thoughts.get(id) || '';
    this.thoughts.set(id, current + text);
    this.touch(id);
    this.notify(id);
  }

  getContent(id: string) {
    this.sweepExpiredEntries();
    if (this.content.has(id) || this.thoughts.has(id)) {
      this.touch(id);
    }
    return this.content.get(id) || '';
  }

  getThoughts(id: string) {
    this.sweepExpiredEntries();
    if (this.content.has(id) || this.thoughts.has(id)) {
      this.touch(id);
    }
    return this.thoughts.get(id) || '';
  }

  subscribe(id: string, listener: Listener) {
    this.sweepExpiredEntries();
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(listener);
    this.touch(id);
    return () => {
      const listeners = this.listeners.get(id);
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.touch(id);
      }
    };
  }

  /**
   * leading + trailing 节流：距上次 flush 已超过间隔则立即 flush（leading edge），
   * 否则把本 id 挂到待 flush 集合，由 setTimeout 在间隔后统一送达（trailing edge）。
   * 用 setTimeout 而非 requestAnimationFrame，是为了把订阅组件的重渲染频率从
   * ~60fps 上限压到 ~15fps（66ms），长回答流式期间每帧的 markdown 重解析成本随之下降。
   */
  private flushNotify() {
    this.notifyTimer = null;
    this.lastFlushAt = performance.now();
    const ids = Array.from(this.pendingNotifyIds);
    this.pendingNotifyIds.clear();

    ids.forEach((pendingId) => {
      this.listeners.get(pendingId)?.forEach((listener) => listener());
    });
  }

  private notify(id: string) {
    this.pendingNotifyIds.add(id);

    if (this.notifyTimer !== null) {
      return;
    }

    const elapsed = performance.now() - this.lastFlushAt;
    const delay = Math.max(0, STREAM_NOTIFY_INTERVAL_MS - elapsed);

    if (delay === 0) {
      this.flushNotify(); // leading edge：立即 flush
    } else {
      this.notifyTimer = setTimeout(() => this.flushNotify(), delay); // trailing edge
    }
  }

  clear(id: string) {
    this.content.delete(id);
    this.thoughts.delete(id);
    this.touchedAt.delete(id);
    this.pendingNotifyIds.delete(id);
    if (this.pendingNotifyIds.size === 0 && this.notifyTimer !== null) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    // 每个 generation 的 clear（开始与结束）都重置节流时钟，
    // 让下一条流的第一个 chunk 立即 leading flush。
    this.lastFlushAt = THROTTLE_NEVER_FLUSHED;
    // Don't delete listeners immediately as component unmount might happen slightly later
  }

  sweepExpiredEntries(now = Date.now()) {
    for (const [id, touchedAt] of this.touchedAt.entries()) {
      const listeners = this.listeners.get(id);
      const hasActiveListeners = !!listeners && listeners.size > 0;
      const isExpired = now - touchedAt > STREAM_ENTRY_TTL_MS;

      if (!isExpired || hasActiveListeners) {
        continue;
      }

      this.content.delete(id);
      this.thoughts.delete(id);
      this.touchedAt.delete(id);

      if (listeners?.size === 0) {
        this.listeners.delete(id);
      }
    }
  }
}

export const streamingStore = new StreamingStore();
