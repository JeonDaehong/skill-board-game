/** Piece colors. */
export type Color = "w" | "b";

/** Piece kinds: pawn, knight, bishop, rook, queen, king. */
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/** A piece on the board. */
export interface Piece {
  color: Color;
  type: PieceType;
}

/**
 * A board square, encoded as `rank * width + file`, where file 0 = 'a' and
 * rank 0 = white's home rank ('1'). On the standard 8x8 board that makes
 * a1 = 0, h1 = 7, a8 = 56, h8 = 63.
 *
 * The width is *not* implied by the index — master mode plays on 10x10, where
 * the same integer means a different square. Every geometry helper therefore
 * takes the board's `Dims`, and a `GameState` satisfies `Dims` so it can be
 * passed straight through.
 */
export type Square = number;

/**
 * Board extent. Classic and skill mode use 8x8; master mode uses 10x10.
 * `GameState` carries these fields, so `fileOf(sq, state)` reads naturally.
 */
export interface Dims {
  readonly width: number;
  readonly height: number;
}

/** Castling availability for both sides. K/Q = kingside/queenside. */
export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

/** Extra information a move carries beyond from/to. */
export type MoveFlag =
  | "normal"
  | "capture"
  | "double-pawn" // pawn advancing two squares (sets en passant target)
  | "en-passant"
  | "castle-king"
  | "castle-queen"
  | "promotion";

/** A fully specified move. */
export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  /** Piece captured, if any (for en passant this is the pawn behind `to`). */
  captured?: Piece;
  /** Promotion target type, only present on promotion moves. */
  promotion?: PieceType;
  flags: MoveFlag[];
}

/** Immutable snapshot of a game position. */
export interface GameState {
  /** Board files (8 normally, 10 in master mode). */
  width: number;
  /** Board ranks (8 normally, 10 in master mode). */
  height: number;
  /** `width * height` entries in rank-major order; null = empty square. */
  board: (Piece | null)[];
  turn: Color;
  castling: CastlingRights;
  /** Square a pawn could be captured on via en passant this turn, else null. */
  enPassant: Square | null;
  /** Half-moves since last capture or pawn move (for 50-move rule). */
  halfmoveClock: number;
  /** Increments after each black move; starts at 1. */
  fullmoveNumber: number;
}

/**
 * Optional rule modifications contributed by skills. An absent field means
 * "standard chess". As movement-altering skills get implemented, add a typed
 * field here and thread it through move generation + attack detection. This
 * keeps the engine correct and readable while staying extensible.
 */
export interface SkillRules {
  /** Peasant Revolt: the listed colors' pawns may capture the piece directly ahead. */
  peasantRevolt?: Partial<Record<Color, boolean>>;
  /**
   * Agile Knight: the listed colors' knights gain a Janggi-elephant-style
   * forward jump (one step forward + two diagonal, net (±2, +3) toward the
   * enemy) in addition to normal knight moves.
   */
  agileKnight?: Partial<Record<Color, boolean>>;
  /**
   * Chaos: rook and bishop swap movement roles for BOTH sides — bishops move
   * like rooks (orthogonal), rooks move like bishops (diagonal). Queens are
   * unaffected.
   */
  chaos?: boolean;
  /**
   * Phantom: the listed colors' sliding pieces may pass over friendly pieces
   * (enemies still block). Applied only for that side's own move generation;
   * it does not change attack/check detection (a jump affects the path, not the
   * final attacking square).
   */
  phantom?: Partial<Record<Color, boolean>>;
  /**
   * Pieces on these squares cannot be captured (성역, and any card that shields
   * a piece). They still occupy the square, so they block sliders, but no
   * capture move may land on them.
   */
  protected?: Square[];
  /**
   * Per-square movement modifiers, keyed by the square the affected piece
   * stands on. Enchants that slow, free or muzzle a single piece all land here
   * — a sandbagged rook, a pawn taught to leap, a disarmed knight.
   *
   * Squares are the only handle a board position gives you on a piece, so the
   * engine re-keys these as their pieces move; move generation just reads them.
   */
  squareRules?: Record<Square, SquareRule>;
  /**
   * Master mode: either side can still summon pieces from its deck, so a bare
   * position is not dead — insufficient-material draws are suppressed.
   */
  summonable?: boolean;
}

/** What a card has done to the piece standing on one particular square. */
export interface SquareRule {
  /** Cannot move at all (a sandbagged pawn, a piece stuck in a swamp). */
  immobile?: boolean;
  /** A slider may travel at most this many squares (sandbagged queen/rook/bishop). */
  maxSteps?: number;
  /** A knight loses its jump: the square it turns through must be empty. */
  noJump?: boolean;
  /** May move but may not capture (무장해제). */
  noCapture?: boolean;
  /** May pass over any piece in its path, friend or enemy (도약). */
  mayJump?: boolean;
  /** Ignores its own pattern and steps one square in any direction, capturing
   *  allowed (위병 훈련). */
  freeStep?: boolean;
  /** Squares this piece specifically may not capture on (동맹사슬). */
  noCaptureOn?: Square[];
}

/** Outcome of a position. */
export type GameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw-fifty-move"
  | "draw-insufficient-material";
