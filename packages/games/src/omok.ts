import { other, type GameModule, type GameResult, type Player } from "./types.js";

export const OMOK_SIZE = 15;

export interface OmokMove {
  x: number;
  y: number;
}

export interface OmokState {
  /** row-major board of size N*N; null = empty. */
  board: (Player | null)[];
  turn: Player;
  last: number | null;
  winner: Player | null;
}

const N = OMOK_SIZE;
const idx = (x: number, y: number) => y * N + x;
const inBounds = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N;

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Longest run through (x,y) for `player` along `[dx,dy]` (both directions). */
function runLength(board: (Player | null)[], x: number, y: number, dx: number, dy: number, player: Player): number {
  let count = 1;
  for (const sign of [1, -1]) {
    let cx = x + dx * sign;
    let cy = y + dy * sign;
    while (inBounds(cx, cy) && board[idx(cx, cy)] === player) {
      count++;
      cx += dx * sign;
      cy += dy * sign;
    }
  }
  return count;
}

/** Did placing `player` at (x,y) make five (or more) in a row? */
export function makesFive(board: (Player | null)[], x: number, y: number, player: Player): boolean {
  return DIRS.some(([dx, dy]) => runLength(board, x, y, dx, dy, player) >= 5);
}

export const omok: GameModule<OmokState, OmokMove> = {
  id: "omok",
  cols: N,
  rows: N,

  createState(): OmokState {
    return { board: Array(N * N).fill(null), turn: "b", last: null, winner: null };
  },

  turn: (s) => s.turn,

  legalMoves(s): OmokMove[] {
    if (s.winner) return [];
    const moves: OmokMove[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (s.board[idx(x, y)] === null) moves.push({ x, y });
    return moves;
  },

  isLegal(s, m): boolean {
    return !s.winner && inBounds(m.x, m.y) && s.board[idx(m.x, m.y)] === null;
  },

  apply(s, m): OmokState {
    const board = s.board.slice();
    board[idx(m.x, m.y)] = s.turn;
    const winner = makesFive(board, m.x, m.y, s.turn) ? s.turn : null;
    return { board, turn: other(s.turn), last: idx(m.x, m.y), winner };
  },

  result(s): GameResult {
    if (s.winner) return { done: true, winner: s.winner, reason: "5목" };
    if (s.board.every((c) => c !== null)) return { done: true, winner: "draw", reason: "무승부" };
    return { done: false, winner: null };
  },
};
