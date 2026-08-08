/**
 * Passwords, tokens, and the rules a name has to pass.
 *
 * Hashing is scrypt out of node:crypto — memory-hard, in the standard library,
 * and therefore one less dependency to keep patched on a machine that is also
 * running the game. Nothing here reaches for a JWT: a token that the server
 * cannot revoke is a bad trade for a game where "log me out of that old
 * browser" is a thing players ask for, and the session table is one lookup.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string, salt: Buffer, keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 32;

/** `scrypt$<salt hex>$<key hex>` — the algorithm travels with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  // Constant time: a fast "wrong" and a slow "wrong" together leak the prefix.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

// ── what a valid signup looks like ──────────────────────────
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

/**
 * Login names are ASCII letters, digits and underscore. Not because anything
 * downstream breaks on more, but because a login name is typed from memory on
 * a phone keyboard — and a name that can contain a zero-width space is a name
 * that can be impersonated.
 */
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/** Error codes the client turns into its own localised sentences. */
export type FieldError =
  | "username-length" | "username-chars" | "username-taken"
  | "password-length"
  | "nickname-length" | "nickname-taken";

export function checkUsername(username: unknown): FieldError | null {
  if (typeof username !== "string") return "username-length";
  const v = username.trim();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) return "username-length";
  if (!USERNAME_RE.test(v)) return "username-chars";
  return null;
}

export function checkPassword(password: unknown): FieldError | null {
  if (typeof password !== "string") return "password-length";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return "password-length";
  return null;
}

export function checkNickname(nickname: unknown): FieldError | null {
  if (typeof nickname !== "string") return "nickname-length";
  const v = nickname.trim();
  // Counted in code points: an emoji nickname should cost what it looks like it
  // costs, not four characters of a sixteen character budget.
  const len = [...v].length;
  if (len < NICKNAME_MIN || len > NICKNAME_MAX) return "nickname-length";
  return null;
}

// ── rate limiting ───────────────────────────────────────────
/**
 * A fixed window per address, in memory. Guessing passwords over the network
 * is the one attack a game this small will actually see, and it is stopped by
 * making the guesses slow rather than by anything clever. Memory only: the
 * process restarting hands an attacker one free window, which is cheaper than
 * a table that has to be swept.
 */
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; until: number }>();

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) {
    attempts.set(key, { count: 1, until: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

/** A successful login clears the window, so a typo streak costs a real user nothing. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}
