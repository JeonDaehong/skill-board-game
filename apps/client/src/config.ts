/**
 * Where the game server is.
 *
 * One place, because two URLs that must agree are two URLs that eventually do
 * not: the account API and the match socket are the same process on the same
 * port, so they are derived from one base here rather than written out twice.
 *
 * Set `VITE_SERVER_URL` at build time to point a deployed client at a deployed
 * server:
 *
 *     VITE_SERVER_URL=https://play.example.com pnpm build
 *
 * With nothing set, a dev build talks to the local server and a production
 * build talks to whatever origin served the page — which is right when the
 * bundle is served by the game server itself, and wrong (loudly, on the first
 * login) when it is served from a separate static host.
 */
const configured = import.meta.env.VITE_SERVER_URL as string | undefined;

const base = (configured?.trim() || defaultBase()).replace(/\/+$/, "");

function defaultBase(): string {
  if (import.meta.env.DEV) return "http://localhost:8787";
  return window.location.origin;
}

/** Base for the account API — `${API_URL}/api/login` and friends. */
export const API_URL = base;

/**
 * The match socket. An https page may not open a ws:// socket, so the scheme
 * follows the base rather than being hardcoded: get this wrong and multiplayer
 * fails only in production, only behind TLS.
 */
export const SERVER_URL = base.replace(/^http/, "ws");
