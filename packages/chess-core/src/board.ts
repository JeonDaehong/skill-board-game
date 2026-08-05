import type {
  CastlingRights,
  Color,
  Dims,
  GameState,
  Piece,
  PieceType,
  Square,
} from "./types.js";

/** File letters, indexed by file number. Long enough for the 10-wide board. */
export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

/** Classic and skill mode. */
export const STANDARD_DIMS: Dims = { width: 8, height: 8 };
/** Master mode: a wider board, because both sides keep summoning onto it. */
export const MASTER_DIMS: Dims = { width: 10, height: 10 };

/** Standard starting position in FEN. */
export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Master mode opens with a king and two pawns a side on 10x10 — everything
 * else has to be summoned from the deck. The pawns flank the king's file
 * rather than standing in front of it, so the king is not walled in on move
 * one and both pawns still guard its approach.
 */
export const MASTER_START_FEN =
  "4k5/3p1p4/10/10/10/10/10/10/3P1P4/4K5 w - - 0 1";

export function fileOf(sq: Square, dims: Dims): number {
  return sq % dims.width;
}

export function rankOf(sq: Square, dims: Dims): number {
  return Math.floor(sq / dims.width);
}

export function makeSquare(file: number, rank: number, dims: Dims): Square {
  return rank * dims.width + file;
}

/** True if file/rank pair is on the board. */
export function onBoard(file: number, rank: number, dims: Dims): boolean {
  return file >= 0 && file < dims.width && rank >= 0 && rank < dims.height;
}

/** Number of squares on a board of these dimensions. */
export function squareCount(dims: Dims): number {
  return dims.width * dims.height;
}

/** Convert a square index to algebraic notation, e.g. 0 -> "a1". */
export function squareToAlgebraic(sq: Square, dims: Dims = STANDARD_DIMS): string {
  return `${FILES[fileOf(sq, dims)]}${rankOf(sq, dims) + 1}`;
}

/** Convert algebraic notation to a square index, e.g. "e4" -> 28. */
export function algebraicToSquare(alg: string, dims: Dims = STANDARD_DIMS): Square {
  const file = alg.charCodeAt(0) - 97; // 'a'
  // Ranks run to 10 on the master board, so the number is the rest of the string.
  const rank = Number(alg.slice(1)) - 1;
  return makeSquare(file, rank, dims);
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/** Deep-ish clone of a game state (board array copied, pieces treated immutable). */
export function cloneState(state: GameState): GameState {
  return {
    width: state.width,
    height: state.height,
    board: state.board.slice(),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };
}

const PIECE_CHARS: Record<string, Piece> = {
  P: { color: "w", type: "p" },
  N: { color: "w", type: "n" },
  B: { color: "w", type: "b" },
  R: { color: "w", type: "r" },
  Q: { color: "w", type: "q" },
  K: { color: "w", type: "k" },
  p: { color: "b", type: "p" },
  n: { color: "b", type: "n" },
  b: { color: "b", type: "b" },
  r: { color: "b", type: "r" },
  q: { color: "b", type: "q" },
  k: { color: "b", type: "k" },
};

function pieceToChar(piece: Piece): string {
  const c = piece.type;
  return piece.color === "w" ? c.toUpperCase() : c;
}

/**
 * Parse a FEN string into a GameState. The board's width and height are read
 * from the placement field itself — the row count is the height, and the first
 * row's squares add up to the width — so one parser covers both board sizes.
 *
 * Skip counts may be multi-digit ("10" is a whole empty rank on the master
 * board), which is why digits are accumulated rather than read one at a time.
 */
export function parseFen(fen: string): GameState {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn, castling, enPassant, halfmove, fullmove] = parts;
  if (!placement || !turn) throw new Error(`Invalid FEN: ${fen}`);

  const rows = placement.split("/");
  const height = rows.length;
  const width = rowWidth(rows[0]!);
  if (width < 1 || width > FILES.length) throw new Error(`Invalid FEN width: ${width}`);
  const dims: Dims = { width, height };

  const board: (Piece | null)[] = new Array(width * height).fill(null);

  // FEN lists the top rank first, down to rank 1.
  for (let r = 0; r < height; r++) {
    const row = rows[r]!;
    if (rowWidth(row) !== width) throw new Error(`Invalid FEN row: ${row}`);
    const rank = height - 1 - r;
    let file = 0;
    let digits = "";
    for (const ch of row) {
      if (ch >= "0" && ch <= "9") {
        digits += ch;
        continue;
      }
      if (digits) {
        file += Number(digits);
        digits = "";
      }
      const piece = PIECE_CHARS[ch];
      if (!piece) throw new Error(`Invalid FEN piece: ${ch}`);
      board[makeSquare(file, rank, dims)] = piece;
      file++;
    }
  }

  const rights: CastlingRights = {
    wK: castling?.includes("K") ?? false,
    wQ: castling?.includes("Q") ?? false,
    bK: castling?.includes("k") ?? false,
    bQ: castling?.includes("q") ?? false,
  };

  return {
    width,
    height,
    board,
    turn: turn === "b" ? "b" : "w",
    castling: rights,
    enPassant:
      enPassant && enPassant !== "-" ? algebraicToSquare(enPassant, dims) : null,
    halfmoveClock: halfmove ? Number(halfmove) : 0,
    fullmoveNumber: fullmove ? Number(fullmove) : 1,
  };
}

/** How many squares one FEN row covers (pieces count 1, digit runs count their value). */
function rowWidth(row: string): number {
  let n = 0;
  let digits = "";
  for (const ch of row) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
    } else {
      if (digits) {
        n += Number(digits);
        digits = "";
      }
      n++;
    }
  }
  return n + (digits ? Number(digits) : 0);
}

/** Serialize a GameState back to FEN. */
export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let rank = state.height - 1; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < state.width; file++) {
      const piece = state.board[makeSquare(file, rank, state)];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        row += pieceToChar(piece);
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }

  const c = state.castling;
  let castling = "";
  if (c.wK) castling += "K";
  if (c.wQ) castling += "Q";
  if (c.bK) castling += "k";
  if (c.bQ) castling += "q";
  if (castling === "") castling = "-";

  const ep = state.enPassant !== null ? squareToAlgebraic(state.enPassant, state) : "-";

  return `${rows.join("/")} ${state.turn} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

/** Create a fresh game in the standard starting position. */
export function initialState(): GameState {
  return parseFen(START_FEN);
}

/** Create a fresh master-mode game: 10x10, king plus two pawns a side. */
export function masterInitialState(): GameState {
  return parseFen(MASTER_START_FEN);
}

/** Find the square of the given color's king, or -1 if absent. */
export function findKing(board: (Piece | null)[], color: Color): Square {
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (p && p.type === "k" && p.color === color) return sq;
  }
  return -1;
}

export const PROMOTION_TYPES: PieceType[] = ["q", "r", "b", "n"];
