import { Redis, RedisOptions } from "ioredis";

import { Store } from "../store";
import { SessionData } from "../session";

export interface Options extends RedisOptions {
    client?: Redis;
    expireAfter?: number
};

export class RedisStore implements Store {
    private redis: Redis;
    private expireAfter?: number;

    constructor(options?: Options);
    constructor(url: string, options?: Options);
    constructor(urlOrOptions?: string | Options, options?: Options) {
        if (typeof urlOrOptions === "object") {
            this.expireAfter = urlOrOptions.expireAfter;

            if (urlOrOptions.client instanceof Redis) {
                this.redis = urlOrOptions.client;
                return;
            };
        };

        const opts = options || (typeof urlOrOptions === "object" ? urlOrOptions : {});

        this.expireAfter = opts.expireAfter;

        if (opts.client instanceof Redis) {
            this.redis = opts.client;
            return;
        };

        if (typeof urlOrOptions === "string") {
            const u = new URL(urlOrOptions);

            if (u.protocol !== "redis:" && u.protocol !== "rediss:")
                throw new Error("Protocol not supported. Use redis: or rediss:");

            this.redis = new Redis(Object.assign({
                host: u.hostname,
                port: Number(u.port) || 6379
            }, opts));

            return;
        };

        throw new Error("RedisStore requires a valid Redis client, URL or options object.");
    };

    getSession = async (id: string): Promise<SessionData | null> => {
        const val = await this.redis.get(id);

        if (!val)
            return null;

        try {
            return JSON.parse(val);
        } catch { };

        return null;
    };

    deleteSession = async (id: string): Promise<void> => {
        await this.redis.del(id);
    };

    private writeSession = async (id: string, data: SessionData): Promise<void> => {
        const payload = JSON.stringify(data);

        if (this.expireAfter)
            await this.redis.set(id, payload, "EX", this.expireAfter);
        else
            await this.redis.set(id, payload);
    };

    createSession = async (data: SessionData, id: string): Promise<void> => {
        await this.writeSession(id, data);
    };

    persistSession = async (data: SessionData, id: string): Promise<void> => {
        await this.writeSession(id, data);
    };
};