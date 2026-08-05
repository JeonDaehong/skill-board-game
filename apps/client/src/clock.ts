/**
 * Match clocks.
 *
 * Two ways to hand out time once the main budget is spent, because the two
 * families of game here disagree about it:
 *
 *  - "increment" (Fischer) — every completed move adds `stepMs` back. Time you
 *    don't spend is kept, so a fast player banks it. This is what FIDE runs:
 *    rapid is 15+10, blitz 3+2, classical 90+30. It is also the answer to
 *    "what happens when the main time is gone" — you are left playing at
 *    exactly `stepMs` per move, forever, which never ends the game by itself.
 *  - "byoyomi" (초읽기) — the main time drains, and after that each turn gets a
 *    fresh `stepMs` that does NOT accumulate. Miss it once and you flag. This
 *    is the janggi/baduk convention.
 *
 * The clock is wall-clock based (`Date.now()` deltas, not tick counting), so a
 * throttled background tab or a slow frame cannot hand a player free time.
 */
export type ClockMode = "increment" | "byoyomi";

/** Structurally the same as chess-core's `Color` and the games package's
 *  `Player`; kept local so the clock depends on neither rules package. */
export type Side = "w" | "b";

export interface TimeControl {
  id: string;
  /** Bracket name. `[en, ko]`, matching the ordering the rest of i18n uses. */
  name: readonly [en: string, ko: string];
  /** Compact face for a tile — the notation a chess player already reads. */
  short: string;
  /** Main budget in ms. 0 with mode "increment" and stepMs 0 = untimed. */
  mainMs: number;
  /** Increment added per move, or the byoyomi period. */
  stepMs: number;
  mode: ClockMode;
}

const min = (n: number) => n * 60_000;
const sec = (n: number) => n * 1000;

/**
 * The offered controls. Blitz/rapid/classical are the FIDE brackets verbatim;
 * "untimed" exists because a casual game against the AI should not lose on
 * time while you take a phone call, and the byoyomi row is there for the
 * janggi/gomoku side of the roadmap.
 */
export const TIME_CONTROLS: TimeControl[] = [
  { id: "untimed", name: ["Untimed", "무제한"], short: "∞", mainMs: 0, stepMs: 0, mode: "increment" },
  { id: "bullet", name: ["Bullet", "불릿"], short: "1+0", mainMs: min(1), stepMs: 0, mode: "increment" },
  { id: "blitz", name: ["Blitz", "블리츠"], short: "3+2", mainMs: min(3), stepMs: sec(2), mode: "increment" },
  { id: "rapid", name: ["Rapid", "래피드"], short: "15+10", mainMs: min(15), stepMs: sec(10), mode: "increment" },
  { id: "classical", name: ["Classical", "클래식"], short: "90+30", mainMs: min(90), stepMs: sec(30), mode: "increment" },
  // Digits only: the display face renders a lowercase "s" as a capital, and
  // the name below already says which of the two "+30" means.
  { id: "byoyomi", name: ["Byoyomi", "초읽기"], short: "10+30", mainMs: min(10), stepMs: sec(30), mode: "byoyomi" },
];

/** One-line form for places without room for a tile (room lists, chips). */
export function timeControlLabel(tc: TimeControl, ko: boolean): string {
  const name = ko ? tc.name[1] : tc.name[0];
  return isUntimed(tc) ? name : `${name} ${tc.short}`;
}

export const DEFAULT_TIME_CONTROL = "rapid";

export function timeControlById(id: string): TimeControl {
  return TIME_CONTROLS.find((c) => c.id === id) ?? TIME_CONTROLS.find((c) => c.id === DEFAULT_TIME_CONTROL)!;
}

/** An untimed control has no clock to show and can never flag. */
export const isUntimed = (tc: TimeControl): boolean => tc.mainMs === 0 && tc.stepMs === 0;

const KEY = "skill-board:time-control";

export function getTimeControlId(): string {
  const saved = localStorage.getItem(KEY);
  return saved && TIME_CONTROLS.some((c) => c.id === saved) ? saved : DEFAULT_TIME_CONTROL;
}
export function setTimeControlId(id: string): void {
  localStorage.setItem(KEY, id);
}

/** What one side's clock reads right now. */
export interface ClockSide {
  /** Main time left, in ms. Floors at 0. */
  mainMs: number;
  /**
   * Byoyomi period left, in ms, once the main time is gone — null while there
   * is still main time, and always null in increment mode.
   */
  byoyomiMs: number | null;
  /** True once this side has flagged. */
  flagged: boolean;
}

export interface Clock {
  readonly control: TimeControl;
  /** Hand the running clock to `who`, banking increment for the side that just moved. */
  switchTo(who: Side): void;
  /** Freeze both clocks (game over, or a screen teardown). */
  stop(): void;
  /** Back to the opening budget, stopped. */
  reset(): void;
  read(who: Side): ClockSide;
  /**
   * Overwrite both main clocks from an authoritative source. Online matches
   * are clocked by the server and the client only mirrors it; between syncs
   * the local clock keeps ticking so the display stays smooth. Main time only,
   * which is all the wire carries — online play uses increment controls.
   */
  sync(mainW: number, mainB: number): void;
  /** Whose clock is currently running, or null when stopped. */
  running(): Side | null;
  /** Fires ~10×/s while running, for repainting. */
  onTick(cb: () => void): void;
  /** Fires once, when a side hits zero. The caller decides what that means. */
  onFlag(cb: (loser: Side) => void): void;
  dispose(): void;
}

const TICK_MS = 100;

/**
 * Build a clock for `control`. It starts stopped: call `switchTo(firstMover)`
 * when the game actually begins, so the opening position isn't burning time
 * while the board is still fading in.
 */
export function createClock(control: TimeControl): Clock {
  const sides: Record<Side, ClockSide> = {
    w: fresh(control),
    b: fresh(control),
  };
  let active: Side | null = null;
  /** Wall-clock stamp of the last time we charged the active side. */
  let since = 0;
  let ticker: number | undefined;
  let tickCb: (() => void) | null = null;
  let flagCb: ((loser: Side) => void) | null = null;
  let dead = false;

  /** Charge the running side for the wall time since the last settle. */
  function settle(): void {
    if (active === null) return;
    const now = Date.now();
    const spent = now - since;
    since = now;
    if (spent <= 0) return;
    charge(sides[active], spent);
  }

  function charge(side: ClockSide, spent: number): void {
    if (side.byoyomiMs !== null) {
      side.byoyomiMs = Math.max(0, side.byoyomiMs - spent);
      if (side.byoyomiMs === 0) side.flagged = true;
      return;
    }
    side.mainMs = Math.max(0, side.mainMs - spent);
    if (side.mainMs > 0) return;
    if (control.mode === "byoyomi" && control.stepMs > 0) {
      // Main time gone: drop into the first byoyomi period rather than flagging.
      side.byoyomiMs = control.stepMs;
    } else {
      side.flagged = true;
    }
  }

  function pump(): void {
    if (dead) return;
    settle();
    tickCb?.();
    if (active !== null && sides[active].flagged) {
      const loser = active;
      halt();
      flagCb?.(loser);
    }
  }

  function halt(): void {
    active = null;
    if (ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
  }

  return {
    control,
    switchTo(who) {
      if (dead || isUntimed(control)) return;
      if (active === who) return;
      if (active !== null) {
        settle();
        const mover = sides[active];
        if (mover.flagged) return; // already lost; nothing to bank
        if (control.mode === "increment") mover.mainMs += control.stepMs;
        // Byoyomi periods don't accumulate: a completed move refills the period.
        else if (mover.byoyomiMs !== null) mover.byoyomiMs = control.stepMs;
      }
      active = who;
      since = Date.now();
      if (ticker === undefined) ticker = window.setInterval(pump, TICK_MS);
    },
    stop() {
      settle();
      halt();
    },
    reset() {
      halt();
      sides.w = fresh(control);
      sides.b = fresh(control);
    },
    read: (who) => ({ ...sides[who] }),
    sync(mainW, mainB) {
      sides.w.mainMs = Math.max(0, mainW);
      sides.b.mainMs = Math.max(0, mainB);
      // The sync lands mid-interval; restart the charge window so the elapsed
      // time already billed by the server isn't billed again locally.
      since = Date.now();
    },
    running: () => active,
    onTick(cb) { tickCb = cb; },
    onFlag(cb) { flagCb = cb; },
    dispose() {
      dead = true;
      halt();
      tickCb = null;
      flagCb = null;
    },
  };
}

function fresh(control: TimeControl): ClockSide {
  // A pure-byoyomi control (no main time) starts in its first period.
  const inByoyomi = control.mode === "byoyomi" && control.mainMs === 0 && control.stepMs > 0;
  return {
    mainMs: control.mainMs,
    byoyomiMs: inByoyomi ? control.stepMs : null,
    flagged: false,
  };
}

/**
 * Clock face. Under a minute it switches to tenths — the standard blitz
 * convention, and the only range where a tenth is worth reading.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 60_000) {
    const s = Math.floor(total / 1000);
    const tenth = Math.floor((total % 1000) / 100);
    return `${s}.${tenth}`;
  }
  const totalSec = Math.ceil(total / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}
