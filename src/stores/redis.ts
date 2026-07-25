import { Redis, type RedisOptions } from "ioredis";
import type { Store } from "../store";
import type { SessionData } from "../session";

export interface RedisStoreOptions extends RedisOptions {
  /** An existing ioredis client to reuse instead of creating a new connection. */
  client?: Redis;
  /**
   * Time-to-live for each session key in Redis, in seconds.
   * If omitted, keys are stored without an expiry (they persist until explicitly deleted).
   */
  expireAfter?: number;
}

/**
 * A session store backed by Redis via ioredis.
 *
 * @example Using a connection URL
 * ```ts
 * const store = new RedisStore("redis://localhost:6379", { keyPrefix: "sess:" });
 * ```
 *
 * @example Providing an existing client
 * ```ts
 * const redis = new Redis({ host: "localhost" });
 * const store = new RedisStore({ client: redis });
 * ```
 */
export class RedisStore implements Store {
  private redis: Redis;
  private keyPrefix: string;
  private expireAfter?: number;

  constructor(options?: RedisStoreOptions);
  constructor(url: string, options?: RedisStoreOptions);
  constructor(urlOrOptions?: string | RedisStoreOptions, options?: RedisStoreOptions) {
    // Normalise: always work with `opts` as the final options bag.
    const opts: RedisStoreOptions = options ?? (typeof urlOrOptions === "object" ? urlOrOptions : {});

    this.expireAfter = opts.expireAfter;
    // Ensure keyPrefix is always a string, never undefined.
    this.keyPrefix = opts.keyPrefix ?? "";

    // Case 1: caller supplied a ready-made Redis client.
    if (opts.client instanceof Redis) {
      this.redis = opts.client;
      return;
    }

    // Case 2: caller supplied a URL string.
    if (typeof urlOrOptions === "string") {
      const u = new URL(urlOrOptions);
      if (u.protocol !== "redis:" && u.protocol !== "rediss:")
        throw new Error("Protocol not supported. Use redis: or rediss:");

      this.redis = new Redis(Object.assign({ host: u.hostname, port: Number(u.port) || 6379 }, opts));
      return;
    }

    // Case 3: caller supplied options without a client — let ioredis use defaults.
    if (typeof urlOrOptions === "object" || urlOrOptions === undefined) {
      this.redis = new Redis(opts);
      return;
    }

    throw new Error("RedisStore: provide a URL string, a RedisStoreOptions object, or an existing Redis client.");
  }

  getSession = async (id: string): Promise<SessionData | null> => {
    const val = await this.redis.get(this.keyPrefix + id);
    if (!val) return null;
    try {
      return JSON.parse(val) as SessionData;
    } catch {
      return null;
    }
  };

  deleteSession = async (id: string): Promise<void> => {
    await this.redis.del(this.keyPrefix + id);
  };

  private writeSession = async (id: string, data: SessionData): Promise<void> => {
    const payload = JSON.stringify(data);
    if (this.expireAfter)
      await this.redis.set(this.keyPrefix + id, payload, "EX", this.expireAfter);
    else
      await this.redis.set(this.keyPrefix + id, payload);
  };

  createSession = async (data: SessionData, id: string): Promise<void> => {
    await this.writeSession(id, data);
  };

  persistSession = async (data: SessionData, id: string): Promise<void> => {
    await this.writeSession(id, data);
  };
}