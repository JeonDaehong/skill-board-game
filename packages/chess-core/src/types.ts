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
 * A board square, encoded as an index 0..63.
 * index = rank * 8 + file, where file 0 = 'a', rank 0 = white's home rank ('1').
 * So a1 = 0, h1 = 7, a8 = 56, h8 = 63.
 */
export type Square = number;

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
  /** 64-length array; null = empty square. */
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
   * Iron Guard: pieces on these squares cannot be captured. They still occupy
   * the square (so they block sliders), but no capture move may land on them.
   */
  protected?: Square[];
}

/** Outcome of a position. */
export type GameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw-fifty-move"
  | "draw-insufficient-material";
