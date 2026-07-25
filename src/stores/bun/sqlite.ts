import type { Store } from "../../store";
import type { SessionData } from "../../session";
import type { Database } from "bun:sqlite";
import type { Context } from "elysia";

/** Pattern that valid SQL identifier table names must match. */
const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * A session store backed by Bun's built-in SQLite driver (`bun:sqlite`).
 *
 * @example
 * ```ts
 * import { Database } from "bun:sqlite";
 * import { BunSQLiteStore } from "@dev-swarup/elysia-session/stores/sqlite";
 *
 * const db = new Database(":memory:");
 * const store = new BunSQLiteStore(db, "sessions");
 * ```
 */
export class BunSQLiteStore implements Store {
  private db: Database;
  private tableName: string;

  // Prepared statements — compiled once at construction time, reused per call.
  private stmtGet: ReturnType<Database["query"]>;
  private stmtUpsert: ReturnType<Database["query"]>;
  private stmtUpdate: ReturnType<Database["query"]>;
  private stmtDelete: ReturnType<Database["query"]>;

  constructor(db: Database, tableName: string) {
    if (!VALID_TABLE_NAME.test(tableName)) {
      throw new Error(
        `BunSQLiteStore: invalid tableName "${tableName}". ` +
        `Only letters, digits, and underscores are allowed, and the name must not start with a digit.`
      );
    }

    this.db = db;
    this.tableName = tableName;

    // Create the table if it doesn't exist yet.
    this.db
      .query(`CREATE TABLE IF NOT EXISTS ${this.tableName} (id TEXT PRIMARY KEY, data TEXT)`)
      .run();

    // Pre-compile all statements to avoid per-call SQL parsing overhead.
    this.stmtGet = this.db.query(`SELECT data FROM ${this.tableName} WHERE id = $id`);
    this.stmtUpsert = this.db.query(
      `INSERT INTO ${this.tableName} (id, data) VALUES ($id, $data)
       ON CONFLICT(id) DO UPDATE SET data = $data`
    );
    this.stmtUpdate = this.db.query(
      `UPDATE ${this.tableName} SET data = $data WHERE id = $id`
    );
    this.stmtDelete = this.db.query(`DELETE FROM ${this.tableName} WHERE id = $id`);
  }

  getSession(id?: string, _ctx?: Context): SessionData | null {
    if (!id) return null;
    const row = this.stmtGet.get({ $id: id }) as { data: string } | null;
    if (!row) return null;
    try {
      return JSON.parse(row.data) as SessionData;
    } catch {
      // Corrupt data — treat as missing session.
      return null;
    }
  }

  createSession(data: SessionData, id: string, _ctx?: Context): void {
    this.stmtUpsert.run({ $id: id, $data: JSON.stringify(data) });
  }

  deleteSession(id?: string, _ctx?: Context): void {
    if (!id) return;
    this.stmtDelete.run({ $id: id });
  }

  /**
   * Updates an existing session row. Uses an upsert so that if the row has
   * been externally removed (e.g. DB reset), data is re-inserted rather than
   * silently discarded.
   */
  persistSession(data: SessionData, id?: string, _ctx?: Context): void {
    if (!id) return;
    this.stmtUpsert.run({ $id: id, $data: JSON.stringify(data) });
  }
}
