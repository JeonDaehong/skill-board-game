/**
 * Serving the built client from the game server.
 *
 * Optional — in development vite serves the client on its own port and this
 * does nothing. It exists for the deployed case, where having one process
 * hand out both the page and the socket removes an entire class of problem:
 * no CORS, no second host to point `VITE_SERVER_URL` at, no https page trying
 * to open a ws:// socket, and one certificate instead of two.
 *
 * Set `CLIENT_DIR` to the client's `dist`, or drop that dist at
 * `packages/server/public`.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

const dir = process.env.CLIENT_DIR
  ? resolve(process.env.CLIENT_DIR)
  : fileURLToPath(new URL("../public", import.meta.url));

/** Whether there is anything to serve at all. Checked once, at startup. */
export const hasClient = existsSync(join(dir, "index.html"));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

export function serveClient(req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  const file = resolveFile(url);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }

  const ext = extname(file);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    // Vite fingerprints everything under /assets, so those can be cached hard.
    // index.html must not be, or a deploy never reaches anyone's browser.
    "Cache-Control": file.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(file).pipe(res);
}

/**
 * The file a URL means, or null. Anything that is not a real file falls back
 * to index.html — the client is a single page with its own router, so a
 * refresh on a deep link has to reach it rather than 404.
 */
function resolveFile(url: string): string | null {
  // `normalize` first, then confirm the result is still inside the directory:
  // "/../../etc/passwd" is a request the server will receive eventually.
  const target = resolve(join(dir, normalize(decodeURIComponent(url))));
  if (target === dir || target.startsWith(dir + sep)) {
    try {
      if (statSync(target).isFile()) return target;
    } catch {
      /* fall through to the app shell */
    }
  }
  const shell = join(dir, "index.html");
  return existsSync(shell) ? shell : null;
}
