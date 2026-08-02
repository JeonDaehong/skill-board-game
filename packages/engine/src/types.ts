import type {
  Color,
  GameState,
  PieceType,
  SkillRules,
  Square,
} from "@skill/chess-core";

/** Live per-card state during a match. */
export interface SkillCardState {
  id: string;
  cooldownRemaining: number;
  usesLeft: number | null;
}

/** Everything one side carries through a match. Pure data (serializable). */
export interface PlayerState {
  color: Color;
  deck: SkillCardState[];
  /** Types of this side's own pieces that have died (Revive pool). */
  grave: PieceType[];
  /** Iron Guard: this side's currently protected square, or null. */
  protectedSquare: Square | null;
  /** Revive: a revived piece that can't move for the rest of this turn. */
  lockedFrom: Square | null;
  /** One More: the next turn-ending action returns the turn to this side. */
  extraTurnPending: boolean;
  /** Cloak: turns left during which the opponent sees these pieces as pawns. */
  cloakTurnsLeft: number;
  /** Liberation: squares holding skill-made queens, and turns until they revert. */
  tempQueens: Square[];
  tempQueensTurnsLeft: number;
  /** Foresight: indices of the opponent's deck this side has revealed. */
  revealed: number[];
}

/** Titan: a fused 4-cell unit. */
export interface TitanState {
  owner: Color;
  cells: Square[];
  hp: number;
}

/** A multi-step skill awaiting further actions from `color`. */
export type Pending =
  | { kind: "sacrifice"; color: Color; movesLeft: number; moved: Square[] }
  | { kind: "revive-place"; color: Color; piece: PieceType }
  | { kind: "kings-return"; color: Color };

/** Snapshot the last mover left behind, so Undo can revert their turn. */
export interface UndoInfo {
  mover: Color;
  chess: GameState;
  /** Piece captured by that move (opponent's), for revive-pool bookkeeping. */
  captured: PieceType | null;
  from: Square;
}

/** The full authoritative match state. Plain data — structuredClone-safe. */
export interface MatchState {
  chess: GameState;
  /** Rules derived from both decks' passives + active effects; refreshed on change. */
  rules: SkillRules;
  players: { w: PlayerState; b: PlayerState };
  titan: TitanState | null;
  pending: Pending | null;
  undo: UndoInfo | null;
  status: "playing" | "ended";
  winner: Color | "draw" | null;
  /** Human-readable end reason (checkmate, titan-explode…). */
  endReason?: string;
}

/**
 * Every intent a client can send. Actions are serializable and validated by
 * the reducer, so the same code runs on server and client. Multi-step skills
 * (sacrifice, revive placement, kings-return) send one action per step.
 */
export type Action =
  | { type: "move"; from: Square; to: Square; promotion?: PieceType }
  | { type: "resign" }
  | { type: "phantom-move"; from: Square; to: Square }
  | { type: "teleport"; a: Square; b: Square }
  | { type: "retreat"; from: Square; to: Square }
  | { type: "cross-diagonal"; from: Square; to: Square }
  | { type: "raid-march"; from: Square; to: Square }
  | { type: "iron-guard"; sq: Square }
  | { type: "one-more" }
  | { type: "undo" }
  | { type: "cloak" }
  | { type: "foresight"; index: number }
  | { type: "sacrifice-start"; sq: Square }
  | { type: "sacrifice-move"; from: Square; to: Square }
  | { type: "sacrifice-end" }
  | { type: "evolve"; sq: Square }
  | { type: "revive"; fuel: Square }
  | { type: "revive-place"; sq: Square }
  | { type: "kings-return-place"; sq: Square }
  | { type: "liberation" }
  | { type: "titan-fuse" }
  | { type: "titan-move"; cells: Square[] };

/** Side-effects the reducer reports for the UI (toasts, animations, endings). */
export type MatchEvent =
  | { type: "toast"; text: string }
  | { type: "gamble"; success: boolean }
  | { type: "game-over"; winner: Color | "draw"; reason: string };

/** Deterministic randomness source (server-owned; seeded for reproducibility). */
export type Rng = () => number;

/** Result of applying an action. `ok:false` means the action was rejected. */
export type ReduceResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; error: string };
