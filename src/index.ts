import type Elysia from 'elysia'
import type { CookieOptions } from 'elysia'
import { nanoid } from 'nanoid'
import { Session, type SessionData } from './session'
import type { Store } from './store'
import { CookieStore } from './stores/cookie'

export interface CsrfOptions {
  /**
   * Secret used to sign CSRF tokens. Defaults to the session ID, which
   * binds every token to the session it was issued for.
   */
  secret?: string
  /**
   * Name of the cookie the CSRF token is exposed through. Defaults to
   * `"csrf_token"`.
   */
  cookieName?: string
  /**
   * Additional cookie attributes applied when setting the CSRF cookie.
   * Leave `httpOnly` unset (or `false`) so client-side code can read the
   * token and echo it back in `headerName`.
   */
  cookieOptions?: CookieOptions
  /**
   * Name of the request header expected to carry the CSRF token on
   * unsafe requests. Defaults to `"x-csrf-token"`.
   */
  headerName?: string
  /**
   * HTTP methods exempt from CSRF verification. Defaults to
   * `["GET", "HEAD", "OPTIONS"]`.
   */
  safeMethods?: string[]
  /** Token lifetime in seconds, passed to `Bun.CSRF.generate`. */
  expiresIn?: number
  /** Overrides the token lifetime check on verification, passed to `Bun.CSRF.verify`. */
  maxAge?: number
  /** Token encoding, passed to `Bun.CSRF.generate`/`Bun.CSRF.verify`. */
  encoding?: 'base64' | 'base64url' | 'hex'
  /** Hashing algorithm, passed to `Bun.CSRF.generate`/`Bun.CSRF.verify`. */
  algorithm?: Bun.CSRFAlgorithm
}

export interface SessionOptions {
  /** The session store to use (Memory, Cookie, Redis, SQLite, or custom). */
  store: Store
  /**
   * Session lifetime in seconds. The expiry is refreshed on every request.
   * Pass `null` to create sessions that never expire server-side.
   */
  expireAfter: number | null
  /**
   * Name of the session cookie. Defaults to `"session"`.
   */
  cookieName?: string
  /**
   * Additional cookie attributes (httpOnly, secure, sameSite, path, etc.)
   * applied when setting the session cookie.
   */
  cookieOptions?: CookieOptions
  /**
   * Enables CSRF protection via `Bun.CSRF` (double-submit-cookie pattern).
   * Not enabled by default — omit this option to leave CSRF handling to
   * the application.
   */
  csrf?: CsrfOptions
}

export { Session };

/**
 * Elysia plugin that attaches a `session` object to every request context.
 *
 * @example
 * ```ts
 * import Elysia from "elysia";
 * import { sessionPlugin } from "@dev-swarup/elysia-session";
 * import { MemoryStore } from "@dev-swarup/elysia-session/stores/memory";
 *
 * new Elysia()
 *   .use(sessionPlugin({ store: new MemoryStore(), expireAfter: 15 * 60 }))
 *   .get("/", (ctx) => ctx.session.get("user"))
 *   .listen(3000);
 * ```
 */
export const sessionPlugin = (options: SessionOptions) => (app: Elysia) => {
  return app
    .derive(async (ctx) => {
      const store = options.store
      const session = new Session()
      const cookieName = options.cookieName ?? 'session'
      const cookie = ctx.cookie[cookieName]
      let sid = ''
      let sessionData: SessionData | null | undefined
      let createRequired = false

      if (cookie && cookie.value) {
        sid = cookie.value as string
        try {
          sessionData = await store.getSession(sid, ctx)
        } catch {
          createRequired = true
        }

        if (sessionData) {
          session.setCache(sessionData)
          if (!session.valid()) {
            await store.deleteSession(sid, ctx)
            cookie.remove()
            createRequired = true
          }
        } else {
          createRequired = true
        }
      } else {
        createRequired = true
      }

      if (createRequired) {
        const initialData: SessionData = {
          _data: {},
          _expire: null,
          _delete: false,
          _accessed: null,
        }
        sid = nanoid(24)
        await store.createSession(initialData, sid, ctx)
        session.setCache(initialData)

        // For non-cookie stores, write the new SID to the browser cookie now
        // so that onAfterHandle can always read it back via cookie.value.
        if (!(store instanceof CookieStore)) {
          ctx.cookie[cookieName].set({
            value: sid,
            ...options.cookieOptions,
          })
        }
      }

      let csrfToken: string | undefined
      if (options.csrf) {
        const csrf = options.csrf
        const secret = csrf.secret ?? sid
        csrfToken = Bun.CSRF.generate(secret, {
          expiresIn: csrf.expiresIn,
          encoding: csrf.encoding,
          algorithm: csrf.algorithm,
        })
        ctx.cookie[csrf.cookieName ?? 'csrf_token'].set({
          value: csrfToken,
          ...csrf.cookieOptions,
        })
      }

      return { session, csrfToken }
    })
    .onBeforeHandle((ctx) => {
      if (!options.csrf) return
      const csrf = options.csrf

      const safeMethods = csrf.safeMethods ?? ['GET', 'HEAD', 'OPTIONS']
      if (safeMethods.includes(ctx.request.method.toUpperCase())) return

      const headerName = (csrf.headerName ?? 'x-csrf-token').toLowerCase()
      const token = ctx.headers[headerName]
      const cookieName = options.cookieName ?? 'session'
      const sid = (ctx.cookie[cookieName]?.value as string | undefined) ?? ''
      const secret = csrf.secret ?? sid

      const valid = !!token && Bun.CSRF.verify(token, {
          secret,
          encoding: csrf.encoding,
          algorithm: csrf.algorithm,
          maxAge: csrf.maxAge,
        })

      if (!valid) {
        ctx.set.status = 403
        return 'Invalid or missing CSRF token'
      }
    })
    .onAfterHandle(async (ctx) => {
      const store = options.store
      const session = (ctx as typeof ctx & { session: Session }).session
      const cookieName = options.cookieName ?? 'session'
      const cookie = ctx.cookie[cookieName]
      const sid = (cookie?.value as string | undefined) ?? ''

      if (!sid) return

      if (session.getCache()._delete) {
        await store.deleteSession(sid as string, ctx)
        cookie?.remove()
      } else {
        // Refresh both the server-side expiry and the browser cookie's Max-Age
        // on every response so neither expires prematurely.
        session.reUpdate(options.expireAfter)
        await store.persistSession(session.getCache(), sid as string, ctx)

        if (!(store instanceof CookieStore)) {
          ctx.cookie[cookieName].set({
            value: sid,
            ...options.cookieOptions,
          })
        }
      }
    })
}
