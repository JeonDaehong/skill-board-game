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
  /**
   * Turns until this card expires on its own. Most lasting cards run until
   * destroyed and leave it unset; 환각 is the one on a clock.
   *
   * Nothing else may borrow this field. 역병 used to keep its every-third-turn
   * cycle here, and the expiry sweep read that cycle as a countdown — so the
   * card destroyed itself two turns after it was played and its effect never
   * fired once. Cards that count their own cycle use `cycle` below.
   */
  turnsLeft?: number | null;
  /**
   * Turns this card has counted, per side. 역병 fires on every third turn of a
   * given player, so the count has to be per player rather than per card.
   */
  cycle?: Partial<Record<Color, number>>;
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
  /** Indices of the opponent's hand this side has seen (정찰·첩보). */
  revealed: number[];
  /** 밀정: the opponent's top card, as last looked at. */
  seenTop: string | null;
  /** 더블: this piece may move a second time this turn. */
  doubleMove: { sq: Square; movesLeft: number } | null;
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
  /**
   * A 지속 card in play, by its effect id.
   *
   * Not an `index`, even though both are numbers: 파괴 accepts either a lasting
   * card or a card in the opponent's hand, and it had no way to tell which a
   * bare number meant. Effect ids count from 1 and hand indices from 0, so
   * aiming at their second card destroyed whichever lasting card had been
   * played first instead.
   */
  | { kind: "lasting"; id: number }
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
  /**
   * Turn-spending cards played this turn — 일반, 부여 and 지속. One is the limit.
   *
   * 속공 and 대응 are not counted. docs/skill.md exempts both: a quick card is
   * "코스트만 있으면 다른 카드와 함께 사용 가능", and a counter is played on the
   * opponent's turn entirely. Counting quick cards here made 준비 태세 grant cost
   * it then forbade you from spending.
   */
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
  /**
   * Take the turn's draw. The draw is not automatic: you click your own deck
   * for it, or pass the step. A drawn card that overflows the hand turns into
   * a `draw-choice` for the client to answer.
   */
  | { type: "draw" }
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
  | { type: "target"; sq?: Square; index?: number; lasting?: number; option?: string }
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

/**
 * Side-effects the reducer reports for the UI (toasts, animations, endings).
 *
 * `toast.text` is a stable key, never prose: the engine has no language, and a
 * sentence baked in here reaches the screen untranslated. The client looks the
 * key up (see i18n's PASSTHROUGH) and shows the result.
 */
export type MatchEvent =
  | { type: "toast"; text: string }
  | { type: "dice"; color: Color; value: number }
  | { type: "drew"; color: Color; card: string }
  | { type: "played"; color: Color; card: string }
  /** A card was destroyed in play — countered, shattered, blown away. */
  | { type: "destroyed"; color: Color; card: string }
  /** An enchant or a timed lasting card ran out on its own. */
  | { type: "expired"; color: Color; card: string }
  /**
   * A piece left the board. Captures raise it too, so the board has one hook to
   * animate a death from — a card that kills a piece silently looks like the
   * piece was never there.
   */
  | { type: "slain"; color: Color; sq: Square; piece: PieceType }
  | { type: "game-over"; winner: Color | "draw"; reason: string };

/** Deterministic randomness source (server-owned; seeded for reproducibility). */
export type Rng = () => number;

/** Result of applying an action. `ok:false` means the action was rejected. */
export type ReduceResult =
  | { ok: true; state: MatchState; events: MatchEvent[] }
  | { ok: false; error: string };
