/**
 * The player's account: signing up, signing in, and staying signed in.
 *
 * Everything the game already knows how to do — coins, decks, rank, cosmetics
 * — keeps working exactly as it did, out of localStorage, synchronously. This
 * module sits beside that rather than in front of it: on login it fills local
 * storage from the server's copy, and after that it pushes changes back up.
 * The alternative (every screen awaiting the network to read a coin balance)
 * would mean rewriting every screen in the game to be async for a number that
 * fits in a register.
 *
 * The token lives in localStorage rather than in a cookie: the client is a
 * static bundle that may be served from a different origin than the API, and a
 * cross-site cookie is a fight with three browsers' defaults for no gain here.
 */
import { API_URL } from "./config.js";
import { applySave, collectSave, onSaveChanged, watchProgress, type SaveBlob } from "./save.js";
import { setNickname } from "./player.js";
import { grantStarterIfNew } from "./economy.js";

const TOKEN_KEY = "skill-board:auth";

export interface Account {
  username: string;
  nickname: string;
}

/** Error codes the server returns. Screens turn these into localised text. */
export type AuthError =
  | "username-length" | "username-chars" | "username-taken"
  | "password-length" | "password-mismatch"
  | "nickname-length" | "nickname-taken"
  | "bad-credentials" | "rate-limited" | "unauthorised"
  | "offline" | "server";

export type AuthResult = { ok: true; account: Account } | { ok: false; error: AuthError };

let account: Account | null = null;
let token: string | null = readToken();
/** Server revision of the save we are working from — the lost-update guard. */
let revision = 0;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function keepToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage off: the session lasts until the tab closes, which is survivable.
  }
}

/** Who is signed in, or null. Synchronous — screens read it while building. */
export function currentAccount(): Account | null {
  return account;
}

export function isSignedIn(): boolean {
  return account !== null;
}

/**
 * True if this browser is holding a token, whether or not it has been checked
 * yet. Boot uses it to tell "signed out" apart from "signed in, but the server
 * did not answer" — the second must not be sent back to the login screen.
 */
export function hasStoredToken(): boolean {
  return token !== null;
}

/** The token, for the match socket to identify itself with. */
export function authToken(): string | null {
  return token;
}

// ── the calls ───────────────────────────────────────────────

interface ApiResponse {
  status: number;
  body: Record<string, unknown> | null;
}

/**
 * How long to wait on the server before calling it unreachable. A refused
 * connection already takes a couple of seconds on some stacks and a black hole
 * takes forever, and neither is worth making a player watch.
 */
const CALL_TIMEOUT_MS = 8000;

async function call(path: string, init: RequestInit = {}): Promise<ApiResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/${path}`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body };
  } catch {
    // Network failure, DNS, CORS, server down — all one thing to a caller who
    // can only ever say "we could not reach the server".
    return null;
  }
}

const post = (path: string, body: unknown): Promise<ApiResponse | null> =>
  call(path, { method: "POST", body: JSON.stringify(body) });

function fail(res: ApiResponse | null): { ok: false; error: AuthError } {
  if (!res) return { ok: false, error: "offline" };
  const code = res.body?.["error"];
  return { ok: false, error: (typeof code === "string" ? code : "server") as AuthError };
}

/**
 * Create an account and sign into it.
 *
 * A new account has no save on the server, so whatever this browser already
 * collected — the starter cards, a deck built before signing up — is uploaded
 * as its first one. Signing up should not cost a player the deck they built on
 * the way to the signup screen.
 */
export async function signUp(
  username: string, password: string, nickname: string,
): Promise<AuthResult> {
  const res = await post("signup", { username, password, nickname });
  if (!res || res.status !== 200 || !res.body?.["token"]) return fail(res);

  keepToken(res.body["token"] as string);
  account = res.body["account"] as Account;
  revision = 0;
  setNickname(account.nickname);
  await pushSave({ force: true });
  return { ok: true, account };
}

/**
 * Sign in and adopt the account's save.
 *
 * The server's copy wins outright. It has to: this browser's storage might be
 * a stranger's leftovers, or this player's own progress from three versions
 * ago, and there is no way to merge two collections without inventing rules
 * the game does not have. An account that has never saved (its first login on
 * a second device) keeps what is here and uploads it instead.
 */
export async function signIn(username: string, password: string): Promise<AuthResult> {
  const res = await post("login", { username, password });
  if (!res || res.status !== 200 || !res.body?.["token"]) return fail(res);

  keepToken(res.body["token"] as string);
  account = res.body["account"] as Account;
  await adopt(res.body["save"] as SavePayload | null);
  setNickname(account.nickname);
  return { ok: true, account };
}

interface SavePayload {
  data: SaveBlob;
  revision: number;
}

async function adopt(save: SavePayload | null): Promise<void> {
  if (save) {
    applySave(save.data);
    revision = save.revision;
    // A save written by an older build may predate the starter grant; without
    // this the account signs in owning nothing and cannot build a deck.
    grantStarterIfNew();
  } else {
    revision = 0;
    await pushSave({ force: true });
  }
}

/**
 * Pick up a session left by a previous visit. Returns the account if the token
 * still works. A token the server has forgotten is dropped here rather than
 * failing later, mid-game, on a save.
 */
export async function restoreSession(): Promise<Account | null> {
  if (!token) return null;
  const res = await call("me");
  if (!res) return null;            // offline: keep the token, try again later
  if (res.status === 401) {
    keepToken(null);
    account = null;
    return null;
  }
  if (res.status !== 200 || !res.body?.["account"]) return null;

  account = res.body["account"] as Account;
  const save = res.body["save"] as SavePayload | null;
  // Only adopt a save that exists — an empty response must not wipe a browser
  // that has been played offline since the last upload.
  if (save) {
    applySave(save.data);
    revision = save.revision;
    grantStarterIfNew();
  } else {
    revision = 0;
  }
  setNickname(account.nickname);
  return account;
}

export async function signOut(): Promise<void> {
  // Push whatever is unsaved before the token goes: signing out is the moment
  // a shared machine is about to be handed over.
  await pushSave({ force: true });
  await post("logout", {});
  keepToken(null);
  account = null;
  revision = 0;
}

/** Change the name other players see. Unique across accounts, so it can fail. */
export async function changeNickname(nickname: string): Promise<AuthResult> {
  if (!account) return { ok: false, error: "unauthorised" };
  const res = await post("nickname", { nickname });
  if (!res || res.status !== 200) return fail(res);
  account = res.body?.["account"] as Account;
  setNickname(account.nickname);
  return { ok: true, account };
}

// ── uploading progress ──────────────────────────────────────
/**
 * Saves are coalesced: opening five card packs in a row is one upload, not
 * five. The delay is short enough that a player who closes the tab after
 * buying something has almost always already sent it, and `flushSave` covers
 * the rest from the page's own teardown.
 */
const PUSH_DELAY_MS = 1200;
let pushTimer: number | undefined;
let pushing: Promise<void> | null = null;

/** Note that local progress changed; the upload follows shortly. */
export function markDirty(): void {
  if (!account) return;
  clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void pushSave(), PUSH_DELAY_MS);
}

export async function pushSave({ force = false } = {}): Promise<void> {
  if (!account) return;
  if (!force && pushTimer === undefined) return;
  clearTimeout(pushTimer);
  pushTimer = undefined;
  // One upload in flight at a time; a second caller waits for it and then runs,
  // so the last state of the game is always the one that lands.
  if (pushing) await pushing.catch(() => {});
  pushing = upload();
  await pushing;
  pushing = null;
}

async function upload(): Promise<void> {
  const res = await call("save", {
    method: "PUT",
    body: JSON.stringify({ data: collectSave(), revision }),
  });
  if (!res) return;                                 // offline: try again next change
  if (res.status === 200) {
    revision = res.body?.["revision"] as number;
    return;
  }
  if (res.status === 409) {
    // Another device saved since we last read. It wins — see `signIn`.
    const save = res.body?.["save"] as SavePayload | null;
    if (save) {
      applySave(save.data);
      revision = save.revision;
      window.dispatchEvent(new CustomEvent("skill-board:save-replaced"));
    }
    return;
  }
  if (res.status === 401) {
    keepToken(null);
    account = null;
  }
}

/**
 * Start syncing: watch progress, upload it when it changes, and take one last
 * chance to save before the page goes away. `pagehide` rather than `unload` —
 * it is the one a phone browser actually fires when the game is swiped away,
 * and `keepalive` lets the request outlive the document.
 *
 * Called once at boot, before any screen exists.
 */
export function installSaveSync(): void {
  watchProgress();
  onSaveChanged(markDirty);

  window.addEventListener("pagehide", () => {
    if (!account || pushTimer === undefined) return;
    clearTimeout(pushTimer);
    pushTimer = undefined;
    try {
      void fetch(`${API_URL}/api/save`, {
        method: "PUT",
        keepalive: true,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: collectSave(), revision }),
      });
    } catch {
      /* nothing left to do at this point in the page's life */
    }
  });
}
