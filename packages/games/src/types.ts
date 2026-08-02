/** The two sides. In these games "b" (black) always moves first. */
export type Player = "b" | "w";

export function other(p: Player): Player {
  return p === "b" ? "w" : "b";
}

export interface GameResult {
  done: boolean;
  winner: Player | "draw" | null;
  reason?: string;
}

/**
 * A pure, serializable board-game rules module. Both the client (local play +
 * AI) and the authoritative server run the same module, so game logic lives in
 * exactly one place. State and Move are plain data (structuredClone-safe).
 */
export interface GameModule<S = unknown, M = unknown> {
  id: string;
  /** Board dimensions, for the generic renderer. */
  cols: number;
  rows: number;
  createState(): S;
  /** Whose turn it is (only meaningful while not `done`). */
  turn(s: S): Player;
  /** Every legal move for the side to move. */
  legalMoves(s: S): M[];
  isLegal(s: S, m: M): boolean;
  /** Apply a (legal) move, returning a fresh state. Never mutates the input. */
  apply(s: S, m: M): S;
  result(s: S): GameResult;
}
