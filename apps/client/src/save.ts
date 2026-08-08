/**
 * The player's progress, as one blob.
 *
 * Everything the game keeps between sessions already lives in localStorage
 * under a `skill-board:` key — coins, collection, decks, rank, cosmetics. So
 * the save the server stores is literally that: the browser's own storage,
 * copied. No schema, no per-field API, and no second definition of what a
 * collection is that could drift from the first.
 *
 * The cost of that choice is that the server cannot read inside a save, which
 * means it cannot referee one either. That is the right trade for now — this
 * is a single-player economy with an online mode bolted beside it, not an MMO
 * — but it is the thing to revisit if cards ever become tradeable or the
 * ladder ever pays out. At that point coins and collection move out of the
 * blob and into columns the server owns.
 */
const PREFIX = "skill-board:";

/**
 * Keys that stay on this device. Sound and language are properties of the
 * machine you are sitting at, not of your account — syncing them would mute a
 * phone because a desktop was muted. The token is not progress at all.
 */
const DEVICE_LOCAL = new Set([
  "skill-board:auth",
  "skill-board:muted",
  "skill-board:lang",
]);

/** Storage as the server sees it: keys to raw string values. */
export type SaveBlob = Record<string, string>;

const isSynced = (key: string): boolean => key.startsWith(PREFIX) && !DEVICE_LOCAL.has(key);

/** Everything worth uploading, read fresh. */
export function collectSave(): SaveBlob {
  const blob: SaveBlob = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isSynced(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) blob[key] = value;
    }
  } catch {
    /* storage off: nothing to sync, and nothing to be done about it */
  }
  return blob;
}

/**
 * Replace local progress with a save from the server.
 *
 * Keys absent from the blob are deleted, not left alone: a save is a complete
 * picture, and leaving stragglers behind would let a deck from whoever used
 * this browser last survive into someone else's account.
 *
 * Nothing in the game caches these values in memory — every getter reads
 * storage when asked — so the next screen to be built already shows the new
 * state. Screens standing at the time do not; callers navigate afterwards.
 */
export function applySave(blob: SaveBlob): void {
  // The write loop below trips the watcher on every key; a save we adopted
  // from the server must not be scheduled straight back up to it.
  suppress = true;
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isSynced(key) && !(key in blob)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(blob)) {
      if (isSynced(key) && typeof value === "string") localStorage.setItem(key, value);
    }
  } catch {
    /* storage off: the account works, it just will not persist locally */
  } finally {
    suppress = false;
  }
}

// ── noticing a change ───────────────────────────────────────
type Listener = () => void;
const listeners: Listener[] = [];
let suppress = false;

/** Called whenever synced progress changes. Used to schedule an upload. */
export function onSaveChanged(fn: Listener): void {
  listeners.push(fn);
}

/**
 * Watch localStorage itself rather than asking every writer to report in.
 *
 * Progress is written from a dozen places — a purchase, a pack opening, a deck
 * edit, the end of a ranked match — and more will arrive. A `markDirty()` call
 * at each of them is a line that will be forgotten in the thirteenth, and the
 * symptom of forgetting it is progress that silently fails to sync on one
 * device. Patching the two methods that can change a save catches all of them,
 * including the ones not written yet, in one place.
 */
export function watchProgress(): void {
  const proto = Storage.prototype;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;

  proto.setItem = function (key: string, value: string) {
    const before = this === localStorage && isSynced(key) ? this.getItem(key) : null;
    setItem.call(this, key, value);
    if (this === localStorage && isSynced(key) && before !== value) changed();
  };
  proto.removeItem = function (key: string) {
    const existed = this === localStorage && isSynced(key) && this.getItem(key) !== null;
    removeItem.call(this, key);
    if (existed) changed();
  };
}

function changed(): void {
  if (suppress) return;
  for (const fn of listeners) fn();
}
