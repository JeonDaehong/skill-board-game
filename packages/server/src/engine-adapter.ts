import {
  createMatch,
  reduce,
  type Action,
  type MatchEvent,
  type MatchState,
  type Rng,
} from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { getGameModule, type GameModule } from "@skill/games";
import { viewFor } from "./view.js";

/**
 * Uniform server-side view of a match, regardless of which game it is. Chess
 * runs on the skill engine (hidden info, RNG); the other games run on their
 * pure @skill/games module. The room code only ever talks to this interface.
 */
export interface RoomEngine {
  /** Whose move the engine expects next. */
  turn(): Color;
  isEnded(): boolean;
  winner(): Color | "draw" | null;
  /** Apply an action from `color`. Turn ownership is checked by the caller. */
  apply(action: unknown, color: Color): { ok: true; events: MatchEvent[] } | { ok: false; error: string };
  /** The state payload to send to `color` (hidden info filtered for chess). */
  view(color: Color): unknown;
  /** Start a fresh game with the same setup (rematch). */
  reset(): void;
}

function makeChessEngine(whiteDeck: string[], blackDeck: string[]): RoomEngine {
  let match: MatchState = createMatch(whiteDeck, blackDeck);
  let rng: Rng = mulberry32((Math.random() * 2 ** 31) | 0);
  return {
    turn: () => (match.pending ? match.pending.color : match.chess.turn),
    isEnded: () => match.status === "ended",
    winner: () => match.winner,
    apply(action, _color) {
      const res = reduce(match, action as Action, rng);
      if (!res.ok) return { ok: false, error: res.error };
      match = res.state;
      return { ok: true, events: res.events };
    },
    view: (color) => viewFor(match, color),
    reset() {
      match = createMatch(whiteDeck, blackDeck);
      rng = mulberry32((Math.random() * 2 ** 31) | 0);
    },
  };
}

function makeBoardEngine(mod: GameModule): RoomEngine {
  let state = mod.createState();
  return {
    turn: () => mod.turn(state) as Color,
    isEnded: () => mod.result(state).done,
    winner: () => mod.result(state).winner as Color | "draw" | null,
    apply(action, _color) {
      if (!mod.isLegal(state, action)) return { ok: false, error: "illegal move" };
      state = mod.apply(state, action);
      return { ok: true, events: [] };
    },
    view: () => state, // full-information games: everyone sees the same board
    reset() {
      state = mod.createState();
    },
  };
}

/** Build the right engine for a game id. Unknown ids fall back to chess. */
export function makeEngine(gameId: string, whiteDeck: string[], blackDeck: string[]): RoomEngine {
  if (gameId === "chess") return makeChessEngine(whiteDeck, blackDeck);
  const mod = getGameModule(gameId);
  if (mod) return makeBoardEngine(mod);
  return makeChessEngine(whiteDeck, blackDeck);
}

/** Small seeded PRNG so a room's randomness is reproducible for debugging. */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
