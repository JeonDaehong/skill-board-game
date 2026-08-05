import type {
  Color,
  GameState,
  PieceType,
  SkillRules,
  Square,
} from "@skill/chess-core";
import type { CounterTrigger } from "./skills.js";
import type { GameMode } from "./modes.js";

/**
 * An enchant in play (부여) — the card attached itself to something and stays
 * there until it is dispelled or its clock runs out.
 *
 * Enchants are kept in one list on the match rather than on the pieces because
 * pieces are plain board entries with no identity: a piece is a square, and a
 * square's occupant changes. Following the square is the whole bookkeeping job,
 * and one list makes it a single loop.
 */
export interface Enchant {
  /** Unique within a match, so the client can animate one without index churn. */
  id: number;
  /** The card that made it. */
  card: string;
  /** Who played it — decides whose 해주/해금 can lift it, and whose turn ticks it. */
  owner: Color;
  /** What it is stuck to. Square targets follow the piece as it moves. */
  on: { kind: "piece" | "square"; sq: Square } | { kind: "player"; color: Color };
  /** Turns left, or null for "until dispelled". */
  turnsLeft: number | null;
  /**
   * Whose turns the clock counts. Usually the owner's, because that is how
   * docs/skill.md words durations ("자신 턴 기준"); 무장해제 is the exception
   * that runs on the victim's turns instead.
   */
  ticksOn: Color;
  /** Effect-specific payload: a chain's partner square, a converted piece's
   *  original colour, and so on. */
  data?: Record<string, number | string>;
}

/** A lasting card in play (지속). It stays until something destroys the card. */
export interface LastingCard {
  id: number;
  card: string;
  owner: Color;
  /** Terrain-style lasting cards (늪지) hold a square. */
  sq?: Square;
  /** Most lasting cards run until destroyed; 환각 is on a clock. */
  turnsLeft?: number | null;
}

/** Everything one side carries through a match. Pure data (serializable). */
export interface PlayerState {
  color: Color;

  // ── the deck ────────────────────────────────────────────────
  /** Face-down draw pile, top of the deck last. Card ids (see cards.ts). */
  library: string[];
  /** Cards held. Only its owner may see these. */
  hand: string[];
  /** Played, discarded and destroyed cards. 전령/회수 fish out of here. */
  discard: string[];
  /** Banked cost, 0..costCap. Spent to play cards and summon pieces. */
  cost: number;
  /** Cost granted for this turn only (준비 태세). Cleared when the turn ends. */
  bonusCost: number;
  /** 지속 cards this side has in play. */
  lasting: LastingCard[];

  // ── in-play bookkeeping ─────────────────────────────────────
  /** Pieces summoned this turn — they may not move under their own power. */
  summonSick: Square[];
  /** Squares whose piece may not move this turn (늪지, 무르기). */
  locked: Square[];
  /** Indices of the opponent's hand this side has seen (정찰·첩보). */
  revealed: number[];
  /** 천리안: the whole opposing hand is open until that hand next changes. */
  seesHand: boolean;
  /** 밀정: the opponent's top card, as last looked at. */
  seenTop: string | null;
  /** 더블: this piece may move a second time this turn. */
  doubleMove: { sq: Square; movesLeft: number } | null;
  /** How many pieces this side may still move this turn without capturing
   *  (희생의 대가). Zero the rest of the time. */
  freeMoves: number;
}

/**
 * Where the active player is in their turn.
 *
 *   draw   → summon (master only) → skill → move → (turn ends)
 *
 * `move` is reached only if nothing that costs the turn has been played; a
 * 일반 card skips straight from `skill` to the end of the turn.
 */
export type Phase = "draw" | "summon" | "skill" | "move";

/** One answer to a card's targeting step. */
export type Pick =
  /** A square on the board. */
  | { kind: "square"; sq: Square }
  /** An index into a hand or a discard pile. */
  | { kind: "index"; index: number }
  /** One of the answers the step offered. */
  | { kind: "option"; option: string };

/** A step the match is waiting on before it can continue. */
export type Pending =
  /** Hand is at the cap: skip the draw, or draw and pitch a card. */
  | { kind: "draw-choice"; color: Color }
  /** Drew over the cap: choose which card to let go. */
  | { kind: "discard"; color: Color }
  /**
   * `color` may answer the stashed action with a counter card. The action is
   * held here, unapplied, until they play a counter or pass. `chain` counts how
   * deep the counter chain already is — it resolves last-played-first.
   */
  | { kind: "counter"; color: Color; trigger: CounterTrigger; action: Action; chain: number }
  /** Master mode: choose where the summoned piece lands. */
  | { kind: "summon-place"; color: Color; piece: PieceType; card: string }
  /**
   * A card is paid for and waiting on its targets. `step` indexes the card's
   * target specs and `picks` holds one array of answers per step so far.
   */
  | { kind: "targeting"; color: Color; card: string; step: number; picks: Pick[][] }
  /** 희생의 대가: move pieces, no captures, until they run out or stop. */
  | { kind: "free-moves"; color: Color; movesLeft: number; moved: Square[] }
  /** 점술: put these back on the deck in whatever order you like. */
  | { kind: "arrange"; color: Color; cards: string[] };

/** Snapshot the last mover left behind, so 무르기 can revert their turn. */
export interface UndoInfo {
  mover: Color;
  chess: GameState;
  /** Piece captured by that move (opponent's), for bookkeeping. */
  captured: PieceType | null;
  from: Square;
  to: Square;
}

/** The full authoritative match state. Plain data — structuredClone-safe. */
export interface MatchState {
  mode: GameMode;
  chess: GameState;
  /** Rules derived from played 지속 cards + enchants; refreshed on change. */
  rules: SkillRules;
  players: { w: PlayerState; b: PlayerState };
  /** Where the side to move is in their turn. */
  phase: Phase;
  /**
   * Set when a 일반 card was played this turn: the move step is skipped, so
   * playing one is genuinely a choice between the card and the move.
   */
  moveSpent: boolean;
  /** Skill cards played this turn. One per turn, counters excluded. */
  skillsPlayed: number;
  /** Every enchant in play, both sides'. */
  enchants: Enchant[];
  /** Next enchant / lasting id. Monotonic so ids are never reused. */
  nextEffectId: number;
  pending: Pending | null;
  undo: UndoInfo | null;
  status: "playing" | "ended";
  winner: Color | "draw" | null;
  /** Human-readable end reason (checkmate, resign…). */
  endReason?: string;
}

/**
 * Every intent a client can send. Actions are serializable and validated by
 * the reducer, so the same code runs on server and client.
 *
 * Cards do not get their own action types any more: a card is played by index
 * and then answered with `target` actions shaped by its own target specs. Sixty
 * three cards times a bespoke action each was what made the old model collapse.
 */
export type Action =
  // ── turn flow ─────────────────────────────────────────────
  | { type: "move"; from: Square; to: Square; promotion?: PieceType }
  | { type: "resign" }
  /** The side to move ran out of clock. Whoever owns the clock sends this. */
  | { type: "flag" }
  /** Leave the current phase without acting (draw→summon→skill→move→end). */
  | { type: "pass-phase" }
  /** End the turn without moving a piece. */
  | { type: "end-turn" }
  // ── draw step ─────────────────────────────────────────────
  /** Hand is full: decline the draw and keep the hand as it is. */
  | { type: "draw-skip" }
  /** Hand is full: draw anyway, then pitch a card. */
  | { type: "draw-take" }
  | { type: "discard"; index: number }
  /** 점술: the order to put the looked-at cards back, top of deck last. */
  | { type: "arrange"; order: number[] }
  // ── cards ─────────────────────────────────────────────────
  /** Play a skill card from hand by its index. Targets follow. */
  | { type: "play-skill"; index: number }
  /** Master mode: play a piece card from hand, then place it. */
  | { type: "summon"; index: number }
  | { type: "summon-place"; sq: Square }
  // ── targeting ─────────────────────────────────────────────
  /** Answer the current target step. Exactly one field is meaningful, per kind. */
  | { type: "target"; sq?: Square; index?: number; option?: string }
  /** Finish a step that accepts a variable number of picks. */
  | { type: "target-done" }
  /** Abandon a card mid-targeting. The cost and the card come back. */
  | { type: "target-cancel" }
  // ── counter window ────────────────────────────────────────
  | { type: "counter-play"; index: number }
  | { type: "counter-pass" }
  // ── 희생의 대가 ────────────────────────────────────────────
  | { type: "free-move"; from: Square; to: Square }
  | { type: "free-move-end" }
  /**
   * Terrain catching a piece that just walked onto it. The reducer raises this
   * on its own rather than a client sending it, so that 방어 gets a counter
   * window against it like any other action.
   */
  | { type: "terrain"; sq: Square; victim: Color; card: string };

/** Side-effects the reducer reports for the UI (toasts, animations, endings). */
export type MatchEvent =
  | { type: "toast"; text: string }
  | { type: "dice"; color: Color; value: number }
  | { type: "drew"; color: Color; card: string }
  | { type: "played"; color: Color; card: string }
  /** A card was destroyed in play — countered, shattered, blown away. */
  | { type: "destroyed"; color: Color; card: string }
  | { type: "game-over"; winner: Color | "draw"; reason: string };

/** Deterministic randomness source (server-owned; seeded for reproducibility). */
export type Rng = () => number;

/** Result of applying an action. `ok:false` means the action was rejected. */
export type ReduceResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; error: string };
