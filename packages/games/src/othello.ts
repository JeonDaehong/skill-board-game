import { other, type GameModule, type GameResult, type Player } from "./types.js";

export const OTHELLO_SIZE = 8;

export interface OthelloMove {
  x: number;
  y: number;
}

export interface OthelloState {
  board: (Player | null)[];
  turn: Player;
  last: number | null;
}

const N = OTHELLO_SIZE;
const idx = (x: number, y: number) => y * N + x;
const inBounds = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N;

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Discs that would flip if `player` places at (x,y). Empty ⇒ illegal move. */
export function flips(board: (Player | null)[], x: number, y: number, player: Player): number[] {
  if (board[idx(x, y)] !== null) return [];
  const opp = other(player);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const line: number[] = [];
    let cx = x + dx;
    let cy = y + dy;
    while (inBounds(cx, cy) && board[idx(cx, cy)] === opp) {
      line.push(idx(cx, cy));
      cx += dx;
      cy += dy;
    }
    if (line.length && inBounds(cx, cy) && board[idx(cx, cy)] === player) out.push(...line);
  }
  return out;
}

function hasMove(board: (Player | null)[], player: Player): boolean {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (flips(board, x, y, player).length) return true;
  return false;
}

/** After a move by `justMoved`, whose turn is it? (auto-passes a stuck side). */
function nextTurn(board: (Player | null)[], justMoved: Player): Player {
  const opp = other(justMoved);
  if (hasMove(board, opp)) return opp;
  if (hasMove(board, justMoved)) return justMoved; // opponent passes
  return opp; // neither can move → game over (result() detects it)
}

export const othello: GameModule<OthelloState, OthelloMove> = {
  id: "othello",
  cols: N,
  rows: N,

  createState(): OthelloState {
    const board: (Player | null)[] = Array(N * N).fill(null);
    board[idx(3, 3)] = "w";
    board[idx(4, 4)] = "w";
    board[idx(3, 4)] = "b";
    board[idx(4, 3)] = "b";
    return { board, turn: "b", last: null };
  },

  turn: (s) => s.turn,

  legalMoves(s): OthelloMove[] {
    const moves: OthelloMove[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (flips(s.board, x, y, s.turn).length) moves.push({ x, y });
    return moves;
  },

  isLegal(s, m): boolean {
    return inBounds(m.x, m.y) && flips(s.board, m.x, m.y, s.turn).length > 0;
  },

  apply(s, m): OthelloState {
    const board = s.board.slice();
    const toFlip = flips(board, m.x, m.y, s.turn);
    board[idx(m.x, m.y)] = s.turn;
    for (const i of toFlip) board[i] = s.turn;
    return { board, turn: nextTurn(board, s.turn), last: idx(m.x, m.y) };
  },

  result(s): GameResult {
    const empty = s.board.some((c) => c === null);
    if (empty && (hasMove(s.board, "b") || hasMove(s.board, "w"))) return { done: false, winner: null };
    let b = 0, w = 0;
    for (const c of s.board) { if (c === "b") b++; else if (c === "w") w++; }
    const winner: Player | "draw" = b === w ? "draw" : b > w ? "b" : "w";
    return { done: true, winner, reason: `${b} : ${w}` };
  },
};
