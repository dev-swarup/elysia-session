import { Store } from "../store";
import { SessionData } from "../session";

export interface MemoryStoreOptions {
  /**
   * How often (in milliseconds) to scan for and evict expired sessions.
   * Defaults to 60_000 (1 minute). Set to `0` to disable automatic eviction.
   */
  evictionIntervalMs?: number;
}

export class MemoryStore implements Store {
  private sessions: Map<string, SessionData>;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: MemoryStoreOptions = {}) {
    this.sessions = new Map();

    const interval = options.evictionIntervalMs ?? 60_000;
    if (interval > 0) {
      this.evictionTimer = setInterval(() => this.evictExpired(), interval);
      // Allow the process to exit even if this timer is still running.
      if (typeof this.evictionTimer === "object" && this.evictionTimer.unref) {
        this.evictionTimer.unref();
      }
    }
  }

  /**
   * Scans all stored sessions and removes any that have passed their expiry time.
   * Called automatically on the eviction interval; can also be invoked manually.
   */
  evictExpired(): void {
    const now = Date.now();
    for (const [id, data] of this.sessions) {
      if (data._expire !== null && new Date(data._expire).getTime() <= now) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Stops the automatic eviction timer. Call this when the store is no longer
   * needed (e.g., during graceful server shutdown) to prevent resource leaks.
   */
  destroy(): void {
    if (this.evictionTimer !== null) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
  }

  getSession(id: string): SessionData | null {
    return this.sessions.get(id) ?? null;
  }

  createSession(data: SessionData, id: string): void {
    this.sessions.set(id, data);
  }

  deleteSession(id: string): void {
    this.sessions.delete(id);
  }

  persistSession(data: SessionData, id: string): void {
    this.sessions.set(id, data);
  }
}