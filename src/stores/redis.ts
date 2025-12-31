import { Redis, RedisOptions } from "ioredis";

import { Store } from "../store";
import { SessionData } from "../session";

export class RedisStore implements Store {
    private redis?: Redis;

    constructor(url: string, options?: RedisOptions) {
        const u = new URL(url);

        if (u.protocol != "redis:")
            throw new Error("Protocol not supported");

        this.redis = new Redis(Object.assign({
            host: u.host,
            port: Number(u.port) || 6379
        }, typeof options == "object" ? options : {}));
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
        if (this.redis)
            this.redis.set(id, JSON.stringify(data));
    };

    persistSession = async (data: SessionData, id: string): Promise<void> => {
        if (this.redis)
            this.redis.set(id, JSON.stringify(data));
    };
};