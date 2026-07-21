import type {
  CastlingRights,
  Color,
  GameState,
  Piece,
  PieceType,
  Square,
} from "./types.js";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Standard starting position in FEN. */
export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function fileOf(sq: Square): number {
  return sq & 7;
}

export function rankOf(sq: Square): number {
  return sq >> 3;
}

export function makeSquare(file: number, rank: number): Square {
  return rank * 8 + file;
}

/** True if file/rank pair is on the board. */
export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

/** Convert a square index to algebraic notation, e.g. 0 -> "a1". */
export function squareToAlgebraic(sq: Square): string {
  return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
}

/** Convert algebraic notation to a square index, e.g. "e4" -> 28. */
export function algebraicToSquare(alg: string): Square {
  const file = alg.charCodeAt(0) - 97; // 'a'
  const rank = alg.charCodeAt(1) - 49; // '1'
  return makeSquare(file, rank);
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/** Deep-ish clone of a game state (board array copied, pieces treated immutable). */
export function cloneState(state: GameState): GameState {
  return {
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

/** Parse a FEN string into a GameState. */
export function parseFen(fen: string): GameState {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn, castling, enPassant, halfmove, fullmove] = parts;
  if (!placement || !turn) throw new Error(`Invalid FEN: ${fen}`);

  const board: (Piece | null)[] = new Array(64).fill(null);
  const rows = placement.split("/");
  if (rows.length !== 8) throw new Error(`Invalid FEN board: ${placement}`);

  // FEN lists rank 8 first, down to rank 1.
  for (let r = 0; r < 8; r++) {
    const row = rows[r]!;
    const rank = 7 - r;
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else {
        const piece = PIECE_CHARS[ch];
        if (!piece) throw new Error(`Invalid FEN piece: ${ch}`);
        board[makeSquare(file, rank)] = piece;
        file++;
      }
    }
  }

  const rights: CastlingRights = {
    wK: castling?.includes("K") ?? false,
    wQ: castling?.includes("Q") ?? false,
    bK: castling?.includes("k") ?? false,
    bQ: castling?.includes("q") ?? false,
  };

  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: rights,
    enPassant: enPassant && enPassant !== "-" ? algebraicToSquare(enPassant) : null,
    halfmoveClock: halfmove ? Number(halfmove) : 0,
    fullmoveNumber: fullmove ? Number(fullmove) : 1,
  };
}

/** Serialize a GameState back to FEN. */
export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = state.board[makeSquare(file, rank)];
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

  const ep = state.enPassant !== null ? squareToAlgebraic(state.enPassant) : "-";

  return `${rows.join("/")} ${state.turn} ${castling} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

/** Create a fresh game in the standard starting position. */
export function initialState(): GameState {
  return parseFen(START_FEN);
}

/** Find the square of the given color's king, or -1 if absent. */
export function findKing(board: (Piece | null)[], color: Color): Square {
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p && p.type === "k" && p.color === color) return sq;
  }
  return -1;
}

export const PROMOTION_TYPES: PieceType[] = ["q", "r", "b", "n"];
