/**
 * The account store.
 *
 * One SQLite file next to the server, opened once for the life of the process.
 * SQLite is the right size for this: a board game's accounts are a few hundred
 * bytes each, every query here is a primary-key lookup, and the whole thing
 * backs up by copying one file. When it stops being the right size, everything
 * that touches storage is in this module and the statements below are the only
 * thing that has to change.
 *
 * Three tables, and the split between them is the point:
 *
 *   accounts  who you are — login name, nickname, password verifier.
 *   sessions  a token you are holding right now. Deletable without touching
 *             the account, which is what "log out everywhere" means.
 *   saves     one opaque JSON blob per account: coins, collection, decks,
 *             rank, cosmetics. The server does not read inside it — the game
 *             rules that give those numbers meaning live in the client and the
 *             engine, and a server that parsed the blob would be a second
 *             place to keep them in sync.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the file lives. Resolved against this module rather than the working
 * directory, so `pnpm server` from the repo root and `node dist/index.js` from
 * a deploy directory open the same database.
 */
const DB_PATH = process.env.SKILL_DB
  ? resolve(process.env.SKILL_DB)
  : fileURLToPath(new URL("../data/skill.db", import.meta.url));

mkdirSync(dirname(DB_PATH), { recursive: true });

// Module-private on purpose: every query in the server goes through a named
// function below, so there is exactly one place that knows the schema.
const db = new Database(DB_PATH);

// WAL lets a reader run while a writer commits, and the busy timeout turns the
// rare overlap into a short wait instead of an SQLITE_BUSY thrown at a player
// mid-login.
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL,
    username_key  TEXT    NOT NULL UNIQUE,
    nickname      TEXT    NOT NULL,
    nickname_key  TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);

  CREATE TABLE IF NOT EXISTS saves (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    data       TEXT    NOT NULL,
    revision   INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export interface Account {
  id: number;
  username: string;
  nickname: string;
  password_hash: string;
  created_at: number;
}

/**
 * Names are compared case- and width-insensitively, so "Rook" cannot sign up
 * beside "rook" and pass for it in a lobby. The display form is stored as
 * typed; the `_key` columns carry the folded form the UNIQUE index works on.
 */
export const fold = (s: string): string => s.trim().normalize("NFKC").toLowerCase();

const stmt = {
  byUsername: db.prepare<[string], Account>(
    "SELECT id, username, nickname, password_hash, created_at FROM accounts WHERE username_key = ?",
  ),
  byId: db.prepare<[number], Account>(
    "SELECT id, username, nickname, password_hash, created_at FROM accounts WHERE id = ?",
  ),
  nicknameTaken: db.prepare<[string], { id: number }>(
    "SELECT id FROM accounts WHERE nickname_key = ?",
  ),
  insertAccount: db.prepare(
    `INSERT INTO accounts (username, username_key, nickname, nickname_key, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  touchLogin: db.prepare("UPDATE accounts SET last_login_at = ? WHERE id = ?"),
  setNickname: db.prepare("UPDATE accounts SET nickname = ?, nickname_key = ? WHERE id = ?"),

  insertSession: db.prepare(
    "INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ),
  session: db.prepare<[string], { account_id: number; expires_at: number }>(
    "SELECT account_id, expires_at FROM sessions WHERE token = ?",
  ),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  sweepSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),

  save: db.prepare<[number], { data: string; revision: number }>(
    "SELECT data, revision FROM saves WHERE account_id = ?",
  ),
  putSave: db.prepare(
    `INSERT INTO saves (account_id, data, revision, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET data = excluded.data,
                                           revision = excluded.revision,
                                           updated_at = excluded.updated_at`,
  ),
};

export function findByUsername(username: string): Account | undefined {
  return stmt.byUsername.get(fold(username));
}

export function findById(id: number): Account | undefined {
  return stmt.byId.get(id);
}

export function nicknameTaken(nickname: string, exceptId?: number): boolean {
  const row = stmt.nicknameTaken.get(fold(nickname));
  return !!row && row.id !== exceptId;
}

export function createAccount(
  username: string,
  nickname: string,
  passwordHash: string,
): Account {
  const now = Date.now();
  const res = stmt.insertAccount.run(
    username, fold(username), nickname, fold(nickname), passwordHash, now,
  );
  return {
    id: Number(res.lastInsertRowid),
    username,
    nickname,
    password_hash: passwordHash,
    created_at: now,
  };
}

export function renameAccount(id: number, nickname: string): void {
  stmt.setNickname.run(nickname, fold(nickname), id);
}

export function markLogin(id: number): void {
  stmt.touchLogin.run(Date.now(), id);
}

// ── sessions ────────────────────────────────────────────────
/** How long a token stays good. Long: this is a game, not a bank. */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function storeSession(token: string, accountId: number): void {
  const now = Date.now();
  stmt.insertSession.run(token, accountId, now, now + SESSION_MS);
}

/** The account a token belongs to, or undefined if it is unknown or expired. */
export function accountForToken(token: string): Account | undefined {
  const row = stmt.session.get(token);
  if (!row) return undefined;
  if (row.expires_at < Date.now()) {
    stmt.deleteSession.run(token);
    return undefined;
  }
  return findById(row.account_id);
}

export function dropSession(token: string): void {
  stmt.deleteSession.run(token);
}

/** Clear out tokens nobody can use any more. Called once at startup. */
export function sweepSessions(): void {
  stmt.sweepSessions.run(Date.now());
}

// ── saves ───────────────────────────────────────────────────
export interface SaveRow {
  data: string;
  revision: number;
}

export function readSave(accountId: number): SaveRow | undefined {
  return stmt.save.get(accountId);
}

export function writeSave(accountId: number, data: string, revision: number): void {
  stmt.putSave.run(accountId, data, revision, Date.now());
}
