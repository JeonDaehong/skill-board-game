/**
 * The account API — plain HTTP/JSON on the same port the game socket uses.
 *
 * It is written against node:http directly rather than a framework: there are
 * seven routes, none of them stream anything, and the whole surface fits on a
 * screen. Adding Express to serve seven routes would be more code to audit,
 * not less.
 *
 * The shape every route agrees on: a failure is `{ error: <code> }` with a
 * status, and the code is a stable identifier the client localises itself —
 * never an English sentence. The server does not know what language the player
 * reads in, and the client already has both.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  checkNickname, checkPassword, checkUsername, clearAttempts, hashPassword,
  newToken, tooManyAttempts, verifyPassword,
} from "./auth.js";
import {
  accountForToken, createAccount, dropSession, findByUsername, markLogin,
  nicknameTaken, readSave, renameAccount, storeSession, writeSave,
  type Account,
} from "./db.js";

/** Largest request we will read at all — a save blob is a few kilobytes. */
const MAX_BODY = 512 * 1024;
/** Largest save we will store. Well past a full collection and every deck. */
const MAX_SAVE = 256 * 1024;

/** What the client is told about an account. Never the hash, never the id. */
interface PublicAccount {
  username: string;
  nickname: string;
}

const publicOf = (a: Account): PublicAccount => ({ username: a.username, nickname: a.nickname });

export interface SavePayload {
  data: Record<string, string>;
  revision: number;
}

/**
 * True if this request is for the account API. The socket upgrade and any
 * future static serving fall through to whoever else is listening.
 */
export function isApiRequest(req: IncomingMessage): boolean {
  return (req.url ?? "").startsWith("/api/");
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(req, res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();

  const path = (req.url ?? "").split("?")[0] ?? "";
  const method = req.method ?? "GET";

  try {
    if (path === "/api/health") return json(res, 200, { ok: true });
    if (path === "/api/signup" && method === "POST") return await signup(req, res);
    if (path === "/api/login" && method === "POST") return await login(req, res);
    if (path === "/api/logout" && method === "POST") return logout(req, res);
    if (path === "/api/me" && method === "GET") return me(req, res);
    if (path === "/api/save" && method === "PUT") return await putSave(req, res);
    if (path === "/api/nickname" && method === "POST") return await postNickname(req, res);
    json(res, 404, { error: "not-found" });
  } catch (err) {
    console.error("[api]", err);
    json(res, 500, { error: "server" });
  }
}

// ── routes ──────────────────────────────────────────────────

async function signup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (tooManyAttempts(`signup:${addressOf(req)}`)) return json(res, 429, { error: "rate-limited" });

  const body = await readJson(req);
  if (!body) return json(res, 400, { error: "malformed" });

  const { username, password, nickname } = body as Record<string, unknown>;
  const bad = checkUsername(username) ?? checkPassword(password) ?? checkNickname(nickname);
  if (bad) return json(res, 400, { error: bad });

  const name = (username as string).trim();
  const nick = (nickname as string).trim();
  if (findByUsername(name)) return json(res, 409, { error: "username-taken" });
  if (nicknameTaken(nick)) return json(res, 409, { error: "nickname-taken" });

  const account = createAccount(name, nick, await hashPassword(password as string));
  const token = newToken();
  storeSession(token, account.id);
  markLogin(account.id);
  // No save row yet: a brand new account is told so explicitly, and the client
  // uploads whatever the browser was already holding rather than wiping it.
  json(res, 200, { token, account: publicOf(account), save: null });
}

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const throttleKey = `login:${addressOf(req)}`;
  if (tooManyAttempts(throttleKey)) return json(res, 429, { error: "rate-limited" });

  const body = await readJson(req);
  if (!body) return json(res, 400, { error: "malformed" });
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") {
    return json(res, 400, { error: "malformed" });
  }

  const account = findByUsername(username);
  // One answer for "no such account" and "wrong password". Telling them apart
  // turns the login form into a way to ask which names exist.
  const ok = account ? await verifyPassword(password, account.password_hash) : false;
  if (!account || !ok) return json(res, 401, { error: "bad-credentials" });

  clearAttempts(throttleKey);
  const token = newToken();
  storeSession(token, account.id);
  markLogin(account.id);
  json(res, 200, { token, account: publicOf(account), save: saveOf(account.id) });
}

function logout(req: IncomingMessage, res: ServerResponse): void {
  const token = bearer(req);
  if (token) dropSession(token);
  json(res, 200, { ok: true });
}

/** Resume: the client has a token from a previous visit and wants its state back. */
function me(req: IncomingMessage, res: ServerResponse): void {
  const account = authed(req);
  if (!account) return json(res, 401, { error: "unauthorised" });
  json(res, 200, { account: publicOf(account), save: saveOf(account.id) });
}

/**
 * Store the player's progress.
 *
 * The revision is a lost-update guard, not a merge: two browsers that both
 * played offline cannot be reconciled by a server that treats the save as
 * opaque, so the second one to arrive is told it is stale and is handed the
 * winning copy to adopt. Which is the honest outcome — silently picking one
 * would lose the same data without saying so.
 */
async function putSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const account = authed(req);
  if (!account) return json(res, 401, { error: "unauthorised" });

  const body = await readJson(req);
  if (!body) return json(res, 400, { error: "malformed" });
  const { data, revision } = body as Record<string, unknown>;
  if (!isSaveData(data)) return json(res, 400, { error: "malformed" });

  const encoded = JSON.stringify(data);
  if (encoded.length > MAX_SAVE) return json(res, 413, { error: "save-too-large" });

  const current = readSave(account.id);
  const base = current?.revision ?? 0;
  if (typeof revision === "number" && revision !== base) {
    return json(res, 409, { error: "stale", save: saveOf(account.id) });
  }

  const next = base + 1;
  writeSave(account.id, encoded, next);
  json(res, 200, { revision: next });
}

async function postNickname(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const account = authed(req);
  if (!account) return json(res, 401, { error: "unauthorised" });

  const body = await readJson(req);
  if (!body) return json(res, 400, { error: "malformed" });
  const { nickname } = body as Record<string, unknown>;
  const bad = checkNickname(nickname);
  if (bad) return json(res, 400, { error: bad });

  const nick = (nickname as string).trim();
  if (nicknameTaken(nick, account.id)) return json(res, 409, { error: "nickname-taken" });
  renameAccount(account.id, nick);
  json(res, 200, { account: { username: account.username, nickname: nick } });
}

// ── plumbing ────────────────────────────────────────────────

function saveOf(accountId: number): SavePayload | null {
  const row = readSave(accountId);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data) as Record<string, string>, revision: row.revision };
  } catch {
    // A blob that will not parse is a blob we cannot hand back; treat it as
    // absent rather than failing the login it is attached to.
    return null;
  }
}

/** A save is a flat map of strings — the client's own storage, as it stands. */
function isSaveData(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

export function authed(req: IncomingMessage): Account | undefined {
  const token = bearer(req);
  return token ? accountForToken(token) : undefined;
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

function addressOf(req: IncomingMessage): string {
  // Behind a proxy the socket address is the proxy's. Trust the forwarded
  // header only when we were told to sit behind one, since a client can send
  // it too and a per-address limit that any client can dodge is not a limit.
  if (process.env.TRUST_PROXY === "1") {
    const fwd = req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  // The client is served from a different origin in development (vite on 5280)
  // and may well be in production too — the game is a static bundle and this is
  // a game server. Allowed origins can be pinned with ALLOWED_ORIGIN once the
  // deploy has a fixed address.
  const allowed = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", allowed ?? origin ?? "*");
  if (allowed || origin) res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function readJson(req: IncomingMessage): Promise<unknown | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        // Stop reading rather than buffering an unbounded upload to reject it.
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}
