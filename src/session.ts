interface SessionDataEntry {
  value: unknown;
  flash: boolean;
}

export interface SessionData {
  _data: Record<string, SessionDataEntry>;
  _expire: string | null;
  _delete: boolean;
  _accessed: string | null;
}

export class Session {
  private _cache: SessionData;

  constructor() {
    this._cache = {
      _data: {},
      _expire: null,
      _delete: false,
      _accessed: null,
    };
  }

  setCache(cache: SessionData) {
    this._cache = cache;
  }

  getCache() {
    return this._cache;
  }

  setExpire(expiration: string) {
    this._cache._expire = expiration;
  }

  /**
   * Extends the session expiry by `expiration` seconds from now and
   * records the current time as the last-accessed timestamp.
   * If `expiration` is falsy (null, 0, undefined), expiry is not changed.
   */
  reUpdate(expiration?: number | null) {
    this._cache._accessed = new Date().toISOString();
    if (expiration)
      this.setExpire(new Date(Date.now() + expiration * 1000).toISOString());
  }

  /**
   * Marks the session for deletion. The session and its cookie will be
   * removed after the current request handler completes.
   */
  delete() {
    this._cache._delete = true;
  }

  /**
   * Returns `true` if the session has no expiry set, or if its expiry
   * is still in the future.
   */
  valid() {
    return (
      this._cache._expire === null ||
      new Date(this._cache._expire).getTime() > Date.now()
    );
  }

  /**
   * Updates the `_accessed` timestamp to the current time.
   * Called automatically by `reUpdate`.
   */
  updateAccessed() {
    this._cache._accessed = new Date().toISOString();
  }

  /**
   * Retrieves a value from the session by key.
   * If the value was stored as a flash message, it is deleted after reading.
   * Returns `null` if the key does not exist.
   */
  get(key: string) {
    const entry = this._cache._data[key];
    if (!entry) return null;
    const value = entry.value;
    if (entry.flash) delete this._cache._data[key];
    return value;
  }

  /**
   * Stores a value in the session under the given key.
   * The value persists until explicitly deleted or the session expires.
   */
  set(key: string, value: unknown) {
    this._cache._data[key] = {
      value,
      flash: false,
    };
  }

  /**
   * Stores a flash value in the session under the given key.
   * Flash values are automatically deleted the first time they are read
   * via `get()`. Useful for one-time messages (e.g. form errors).
   */
  flash(key: string, value: unknown) {
    this._cache._data[key] = {
      value,
      flash: true,
    };
  }
}
