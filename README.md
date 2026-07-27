# Elysia Session

![badge](https://github.com/dev-swarup/elysia-session/actions/workflows/npm-publish.yml/badge.svg)

## Features

- Runs in Bun, and those supported by Elysia v1+.
- Flash messages — data that is deleted once it's read (one-off error messages, etc.)
- Built-in Memory, Cookie, Bun SQLite and Redis stores.
- Automatic eviction of expired sessions (MemoryStore).

## Installation

```bash
bun add @dev-swarup/elysia-session
```

## Documentation

There are 4 stores built into this package:

1. **Memory Store** — in-process, great for development
2. **Cookie Store** — stores the session directly inside the browser cookie (no server storage needed)
3. **Redis Store** — production-ready, accepts an ioredis-compatible Redis instance
4. **Bun SQLite Store** — lightweight persistent storage using `bun:sqlite`

You can implement your own store by implementing the `Store` interface as shown below:

```ts
import type { Context } from "elysia";
import type { Store } from "@dev-swarup/elysia-session/store";
import type { SessionData } from "@dev-swarup/elysia-session/session";

export class MyCustomStore implements Store {
  constructor() {
    // initialise your storage backend here
  }

  getSession(id?: string, ctx?: Context): SessionData | null | undefined | Promise<SessionData | null | undefined> {
    // retrieve session by id
  }

  createSession(data: SessionData, id?: string, ctx?: Context): Promise<void> | void {
    // persist a newly created session
  }

  persistSession(data: SessionData, id?: string, ctx?: Context): Promise<void> | void {
    // update an existing session (called after every request)
  }

  deleteSession(id?: string, ctx?: Context): Promise<void> | void {
    // remove a session from storage
  }
}
```

### Usage

#### Memory Store

Sessions are stored in-process. All sessions are lost on server restart. An automatic background timer evicts expired sessions every 60 seconds by default.

```ts
import Elysia from "elysia";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { MemoryStore } from "@dev-swarup/elysia-session/stores/memory";

const store = new MemoryStore({ evictionIntervalMs: 60_000 }); // default

new Elysia()
  .use(sessionPlugin({
    cookieName: "session", // optional, defaults to "session"
    store,
    expireAfter: 15 * 60, // 15 minutes
  }))
  .get("/", () => "Hi")
  .listen(3000);

// On graceful shutdown, stop the eviction timer:
// store.destroy();
```

#### Cookie Store

The entire session is serialized as JSON and stored directly in the browser cookie. No server-side storage required. **Cookie payload is limited to ~4 KB.**

```ts
import Elysia from "elysia";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { CookieStore } from "@dev-swarup/elysia-session/stores/cookie";

new Elysia()
  .use(sessionPlugin({
    cookieName: "session", // optional, defaults to "session"
    store: new CookieStore({
      cookieName: "session",    // optional, defaults to "session"
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    }),
    expireAfter: 15 * 60, // 15 minutes
  }))
  .get("/", () => "Hi")
  .listen(3000);
```

#### Redis Store

```ts
import Elysia from "elysia";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { RedisStore } from "@dev-swarup/elysia-session/stores/redis";

new Elysia()
  .use(sessionPlugin({
    cookieName: "session", // optional, defaults to "session"
    store: new RedisStore("redis://localhost:6379", {
      keyPrefix: "sess:",
    }),
    expireAfter: 15 * 60, // 15 minutes
  }))
  .get("/", () => "Hi")
  .listen(3000);
```

You can also pass an existing ioredis client:

```ts
import { Redis } from "ioredis";
import { RedisStore } from "@dev-swarup/elysia-session/stores/redis";

const redis = new Redis({ host: "localhost", port: 6379 });
const store = new RedisStore({ client: redis });
```

#### Bun SQLite Store

```ts
import Elysia from "elysia";
import { Database } from "bun:sqlite";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { BunSQLiteStore } from "@dev-swarup/elysia-session/stores/sqlite";

const database = new Database(":memory:");
// 2nd argument is the SQL table name (letters, digits, underscores only)
const store = new BunSQLiteStore(database, "sessions");

new Elysia()
  .use(sessionPlugin({
    cookieName: "session", // optional, defaults to "session"
    store,
    expireAfter: 15 * 60, // 15 minutes
  }))
  .get("/", () => "Hi")
  .listen(3000);
```

### CSRF Protection

Optional, disabled by default. Pass a `csrf` object to `sessionPlugin` to enable it — token generation/verification is powered by Bun's built-in [`Bun.CSRF`](https://bun.com) API, so this only works when running under Bun.

Enabling it sets a readable CSRF cookie (double-submit-cookie pattern) on every response and rejects any request whose method isn't in `safeMethods` unless it carries a matching token in the configured header.

```ts
import Elysia from "elysia";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { MemoryStore } from "@dev-swarup/elysia-session/stores/memory";

new Elysia()
  .use(sessionPlugin({
    store: new MemoryStore(),
    expireAfter: 15 * 60,
    csrf: {
      cookieName: "csrf_token",   // optional, defaults to "csrf_token"
      headerName: "x-csrf-token", // optional, defaults to "x-csrf-token"
      safeMethods: ["GET", "HEAD", "OPTIONS"], // optional, this is the default
    },
  }))
  .post("/transfer", (ctx) => "Money moved!")
  .listen(3000);
```

On the client, read the `csrf_token` cookie and send its value back in the `x-csrf-token` header on state-changing requests (POST/PUT/PATCH/DELETE):

```ts
fetch("/transfer", {
  method: "POST",
  headers: { "x-csrf-token": getCookie("csrf_token") },
});
```

Requests to unsafe methods without a valid token receive a `403` response.

## Community Stores

<details>
  <summary>Mongoose (@macnak)</summary>

```ts
import type { Context } from "elysia";
import type { SessionData } from "@dev-swarup/elysia-session/session";
import type { Store } from "@dev-swarup/elysia-session/store";
import * as mongoose from 'mongoose';

export interface ISession extends mongoose.Document {
  _id: string;
  sessionData: SessionData;
}

export class MongooseStore implements Store {
  private db: typeof import('mongoose');
  private collection: string;
  private schema: mongoose.Schema | null;
  private model: mongoose.Model<ISession> | null;

  constructor(db: typeof import('mongoose'), collection: string) {
    this.db = db;
    this.collection = collection;
    this.schema = new mongoose.Schema({
      _id: String,
      sessionData: { type: JSON },
    })
    this.model = mongoose.model<ISession>(collection, this.schema);
  }

  getSession(id?: string, ctx?: Context): SessionData | Promise<SessionData | null | undefined> | null | undefined {
    if (!id) return null;
    if (this.model) {
      this.model.findOne({ _id: id }, (err: Error, session: ISession) => {
        if (err || !session) return null;
        return session.sessionData
      })
    } else
      return null
  }

  createSession(data: SessionData, id: string, ctx?: Context): void | Promise<void> {
    if (this.model) {
      const session = new this.model({ _id: id, sessionData: data })
      session.save();
    }
  }

  deleteSession(id?: string, ctx?: Context): void | Promise<void> {
    if (!id) return;
    if (this.model) {
      this.model.deleteOne({ _id: id })
    }
  }

  persistSession(data: SessionData, id?: string, ctx?: Context): Promise<void> | void {
    if (!id) return;
    if (this.model) {
      this.model.updateOne({ _id: id }, { sessionData: data })
    }
  }
}
```

</details>

### Flash Messages

Flash messages are one-off messages that are automatically deleted the first time they are read. They are useful for passing one-time notifications (e.g. form validation errors) between redirects.

Use `.flash(key, value)` to set, and `.get(key)` to read and consume:

```ts
app.post("/login", (ctx) => {
  // validation failed — set a flash message and redirect
  ctx.session.flash("error", "Invalid username or password");
  return ctx.redirect("/login");
});

app.get("/login", (ctx) => {
  const error = ctx.session.get("error"); // consumed — will be null on next read
  return `<p>${error ?? ""}</p><form>...</form>`;
});
```

### Deleting a Session

To destroy a session completely (e.g. on logout), call `.delete()`. The session data will be removed from the store and the browser cookie will be cleared after the current request handler completes.

```ts
app.post("/logout", (ctx) => {
  ctx.session.delete();
  return ctx.redirect("/login");
});
```

### Session Data

```ts
import Elysia from "elysia";
import { sessionPlugin } from "@dev-swarup/elysia-session";
import { MemoryStore } from "@dev-swarup/elysia-session/stores/memory";

new Elysia()
  .use(sessionPlugin({
    store: new MemoryStore(),
    expireAfter: 15 * 60, // 15 minutes
  }))
  .get("/set", (ctx) => {
    ctx.session.set("user", { id: 1, name: "Alice" });
    return "Session set!";
  })
  .get("/get", (ctx) => {
    const user = ctx.session.get("user");
    return user ?? "No session found";
  })
  .listen(3000);
```

## License

MIT

## Author

Copyright (c) 2023 Gaurish Sethia, All rights reserved. <br>
Copyright (c) 2025-26 Swarup Banerjee, All rights reserved. <br>