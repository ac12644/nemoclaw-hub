import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { DB_PATH, CONFIG_DIR } from "../lib/config.js";

export { DB_PATH };

let _db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db;

  const p = dbPath || DB_PATH;
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(p);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  migrate(_db);
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sandbox    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_sandbox
      ON messages(sandbox, created_at);

    CREATE TABLE IF NOT EXISTS audit_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sandbox    TEXT,
      event_type TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_sandbox
      ON audit_events(sandbox, created_at);

    CREATE INDEX IF NOT EXISTS idx_audit_type
      ON audit_events(event_type, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      yaml_content TEXT NOT NULL,
      schedule     TEXT,
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id           TEXT PRIMARY KEY,
      workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      status       TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','cancelled')),
      trigger      TEXT NOT NULL DEFAULT 'manual',
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wfruns_workflow
      ON workflow_runs(workflow_id, started_at);

    CREATE TABLE IF NOT EXISTS workflow_step_runs (
      id           TEXT PRIMARY KEY,
      run_id       TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      step_name    TEXT NOT NULL,
      status       TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','skipped')),
      output       TEXT,
      started_at   TEXT,
      completed_at TEXT,
      error        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_wfstepruns_run
      ON workflow_step_runs(run_id);
  `);
}

export function close(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Message queries ─────────────────────────────────────────────────────

export interface Message {
  id: number;
  sandbox: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export function insertMessage(
  sandbox: string,
  role: "user" | "assistant" | "system",
  content: string
): Database.RunResult {
  const db = getDb();
  return db
    .prepare("INSERT INTO messages (sandbox, role, content) VALUES (?, ?, ?)")
    .run(sandbox, role, content);
}

export function getMessages(
  sandbox: string,
  opts: { limit?: number; offset?: number } = {}
): Message[] {
  const db = getDb();
  const { limit = 50, offset = 0 } = opts;
  return db
    .prepare(
      "SELECT * FROM messages WHERE sandbox = ? ORDER BY created_at ASC LIMIT ? OFFSET ?"
    )
    .all(sandbox, limit, offset) as Message[];
}

// ── Audit queries ───────────────────────────────────────────────────────

export interface AuditEvent {
  id: number;
  sandbox: string | null;
  event_type: string;
  detail: string | null;
  created_at: string;
}

export function insertAudit(
  sandbox: string | null,
  eventType: string,
  detail?: unknown
): Database.RunResult {
  const db = getDb();
  const detailStr =
    detail == null ? null : typeof detail === "string" ? detail : JSON.stringify(detail);
  return db
    .prepare("INSERT INTO audit_events (sandbox, event_type, detail) VALUES (?, ?, ?)")
    .run(sandbox, eventType, detailStr);
}

export function getAuditEvents(
  opts: { sandbox?: string; eventType?: string; limit?: number; offset?: number } = {}
): AuditEvent[] {
  const db = getDb();
  const { sandbox, eventType, limit = 50, offset = 0 } = opts;

  let sql = "SELECT * FROM audit_events WHERE 1=1";
  const params: (string | number)[] = [];

  if (sandbox) {
    sql += " AND sandbox = ?";
    params.push(sandbox);
  }
  if (eventType) {
    sql += " AND event_type = ?";
    params.push(eventType);
  }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.prepare(sql).all(...params) as AuditEvent[];
}

// ── Session queries ─────────────────────────────────────────────────────

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
}

export function createSession(id: string, expiresAt: string): void {
  const db = getDb();
  db.prepare("INSERT INTO sessions (id, expires_at) VALUES (?, ?)").run(id, expiresAt);
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session | undefined;
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function cleanExpiredSessions(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}
