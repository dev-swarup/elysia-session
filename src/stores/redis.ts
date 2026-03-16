import { Redis, RedisOptions } from "ioredis";

import { Store } from "../store";
import { SessionData } from "../session";

export interface Options extends RedisOptions {
    expireAfter?: number
};

export class RedisStore implements Store {
    private redis?: Redis;
    private options?: Options;

    constructor(url: string, options?: Options) {
        const u = new URL(url);

        if (u.protocol != "redis:")
            throw new Error("Protocol not supported");


        this.options = typeof options == "object" ? options : {};
        this.redis = new Redis(Object.assign({
            host: u.hostname,
            port: Number(u.port) || 6379
        }, this.options));
    };

    getSession = async (id: string): Promise<SessionData | null> => {
        if (this.redis) {
            const val = await this.redis.get(id);

            if (val)
                try {
                    return JSON.parse(val);
                } catch { };
        };

        return null;
    };

    deleteSession = async (id: string): Promise<void> => {
        if (this.redis)
            await this.redis.del(id);
    };

    createSession = async (data: SessionData, id: string): Promise<void> => {
        if (this.redis) {
            await this.redis.set(id, JSON.stringify(data));

            if (this.options?.expireAfter)
                await this.redis.expire(id, this.options.expireAfter);
        };
    };

    persistSession = async (data: SessionData, id: string): Promise<void> => {
        if (this.redis) {
            await this.redis.set(id, JSON.stringify(data));

            if (this.options?.expireAfter)
                await this.redis.expire(id, this.options.expireAfter);
        };
    };
};