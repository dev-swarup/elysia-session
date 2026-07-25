import type { CookieOptions, Context } from "elysia";
import type { Store } from "../store";
import type { SessionData } from "../session";

export interface CookieStoreOptions {
  /** Cookie serialization options (httpOnly, secure, sameSite, etc.). */
  cookieOptions?: CookieOptions;
  /**
   * The name of the cookie used to store the session data.
   * Must match the `cookieName` passed to `sessionPlugin`. Defaults to `"session"`.
   */
  cookieName?: string;
}

/**
 * A session store that serializes the entire session as JSON inside a single
 * browser cookie. No server-side storage is required.
 *
 * **Note:** Cookie size is limited to ~4 KB. Use a server-side store
 * (Redis, SQLite, Memory) for larger sessions.
 */
export class CookieStore implements Store {
  private options: CookieStoreOptions;

  constructor(options?: CookieStoreOptions) {
    this.options = options ?? { cookieName: "session" };
    // Ensure cookieName always has a default even when partial options are supplied.
    this.options.cookieName ??= "session";
  }

  getSession(id?: string, ctx?: Context): SessionData | null {
    const cookie = ctx?.cookie[this.options.cookieName!];
    if (!cookie?.value) return null;
    try {
      return JSON.parse(cookie.value as string) as SessionData;
    } catch {
      return null;
    }
  }

  createSession(data: SessionData, id: string, ctx?: Context): void {
    ctx?.cookie[this.options.cookieName!].set({
      value: JSON.stringify(data),
      ...this.options.cookieOptions,
    });
  }

  /**
   * Clears the session cookie from the browser by calling `.remove()`,
   * which sends a `Set-Cookie` header with `Max-Age=0`.
   */
  deleteSession(id: string, ctx?: Context): void {
    ctx?.cookie[this.options.cookieName!]?.remove();
  }

  persistSession(data: SessionData, id: string, ctx?: Context): void {
    ctx?.cookie[this.options.cookieName!].set({
      value: JSON.stringify(data),
      ...this.options.cookieOptions,
    });
  }
}