import { other, type GameModule, type GameResult, type Player } from "./types.js";

// Korean chess. 9 files (x 0..8) × 10 ranks (y 0..9). "b" starts at the bottom
// (y 0..3) and moves upward; "w" mirrors at the top. Basic ruleset: capturing
// the enemy General (장) wins — no check/checkmate enforcement.

export const JANGGI_W = 9;
export const JANGGI_H = 10;

export type PieceType = "k" | "a" | "e" | "h" | "r" | "c" | "s";
export interface JanggiPiece { t: PieceType; c: Player; }
export interface JanggiMove { from: [number, number]; to: [number, number]; }
export interface JanggiState {
  board: (JanggiPiece | null)[];
  turn: Player;
  last: JanggiMove | null;
  winner: Player | null;
}

const W = JANGGI_W;
const H = JANGGI_H;
const idx = (x: number, y: number) => y * W + x;
const inB = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;

/** Palace column/row bounds for a side. */
const palaceRows = (c: Player): [number, number] => (c === "b" ? [0, 2] : [7, 9]);
function inPalace(c: Player, x: number, y: number): boolean {
  const [y0, y1] = palaceRows(c);
  return x >= 3 && x <= 5 && y >= y0 && y <= y1;
}
/** Palace diagonal nodes (corners + center) let 士/將 move diagonally. */
function isDiagNode(c: Player, x: number, y: number): boolean {
  const [y0, y1] = palaceRows(c);
  const cy = (y0 + y1) / 2;
  if (x === 4 && y === cy) return true; // center
  return (x === 3 || x === 5) && (y === y0 || y === y1); // corners
}

// Horse / elephant leg-paths: [destDx, destDy, ...midOffsets]
const HORSE: [number, number, [number, number][]][] = [
  [1, 2, [[0, 1]]], [-1, 2, [[0, 1]]], [1, -2, [[0, -1]]], [-1, -2, [[0, -1]]],
  [2, 1, [[1, 0]]], [2, -1, [[1, 0]]], [-2, 1, [[-1, 0]]], [-2, -1, [[-1, 0]]],
];
const ELEPHANT: [number, number, [number, number][]][] = [
  [2, 3, [[0, 1], [1, 2]]], [-2, 3, [[0, 1], [-1, 2]]],
  [2, -3, [[0, -1], [1, -2]]], [-2, -3, [[0, -1], [-1, -2]]],
  [3, 2, [[1, 0], [2, 1]]], [-3, 2, [[-1, 0], [-2, 1]]],
  [3, -2, [[1, 0], [2, -1]]], [-3, -2, [[-1, 0], [-2, -1]]],
];
const ORTH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pieceMoves(board: (JanggiPiece | null)[], x: number, y: number): [number, number][] {
  const p = board[idx(x, y)];
  if (!p) return [];
  const out: [number, number][] = [];
  const mine = (tx: number, ty: number) => board[idx(tx, ty)]?.c === p.c;
  const push = (tx: number, ty: number) => { if (inB(tx, ty) && !mine(tx, ty)) out.push([tx, ty]); };

  switch (p.t) {
    case "k":
    case "a": {
      for (const [dx, dy] of ORTH) if (inPalace(p.c, x + dx, y + dy)) push(x + dx, y + dy);
      if (isDiagNode(p.c, x, y)) {
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
          const tx = x + dx, ty = y + dy;
          if (inPalace(p.c, tx, ty) && isDiagNode(p.c, tx, ty)) push(tx, ty);
        }
      }
      break;
    }
    case "h":
    case "e": {
      const table = p.t === "h" ? HORSE : ELEPHANT;
      for (const [dx, dy, mids] of table) {
        if (mids.every(([mx, my]) => inB(x + mx, y + my) && board[idx(x + mx, y + my)] === null)) push(x + dx, y + dy);
      }
      break;
    }
    case "r": {
      for (const [dx, dy] of ORTH) {
        let tx = x + dx, ty = y + dy;
        while (inB(tx, ty) && board[idx(tx, ty)] === null) { out.push([tx, ty]); tx += dx; ty += dy; }
        if (inB(tx, ty) && board[idx(tx, ty)]!.c !== p.c) out.push([tx, ty]);
      }
      break;
    }
    case "c": {
      for (const [dx, dy] of ORTH) {
        let tx = x + dx, ty = y + dy;
        // advance to the screen piece
        while (inB(tx, ty) && board[idx(tx, ty)] === null) { tx += dx; ty += dy; }
        if (!inB(tx, ty) || board[idx(tx, ty)]!.t === "c") continue; // no screen, or screen is a cannon
        tx += dx; ty += dy;
        while (inB(tx, ty) && board[idx(tx, ty)] === null) { out.push([tx, ty]); tx += dx; ty += dy; }
        if (inB(tx, ty) && board[idx(tx, ty)]!.c !== p.c && board[idx(tx, ty)]!.t !== "c") out.push([tx, ty]);
      }
      break;
    }
    case "s": {
      const fwd = p.c === "b" ? 1 : -1;
      push(x, y + fwd);
      push(x + 1, y);
      push(x - 1, y);
      // diagonal forward inside the enemy palace
      const enemy = other(p.c);
      if (inPalace(enemy, x, y) && isDiagNode(enemy, x, y)) {
        for (const dx of [1, -1]) {
          const tx = x + dx, ty = y + fwd;
          if (inPalace(enemy, tx, ty) && isDiagNode(enemy, tx, ty)) push(tx, ty);
        }
      }
      break;
    }
  }
  return out;
}

const BACK: PieceType[] = ["r", "h", "e", "a", "k", "a", "e", "h", "r"];

export const janggi: GameModule<JanggiState, JanggiMove> = {
  id: "janggi",
  cols: W,
  rows: H,

  createState(): JanggiState {
    const board: (JanggiPiece | null)[] = Array(W * H).fill(null);
    const setup = (c: Player, backRank: number, genRank: number, cannonRank: number, soldierRank: number) => {
      for (let x = 0; x < W; x++) {
        const t = BACK[x]!;
        board[idx(x, backRank)] = t === "k" ? null : { t, c };
      }
      board[idx(4, genRank)] = { t: "k", c };
      board[idx(1, cannonRank)] = { t: "c", c };
      board[idx(7, cannonRank)] = { t: "c", c };
      for (const x of [0, 2, 4, 6, 8]) board[idx(x, soldierRank)] = { t: "s", c };
    };
    setup("b", 0, 1, 2, 3);
    setup("w", 9, 8, 7, 6);
    return { board, turn: "b", last: null, winner: null };
  },

  turn: (s) => s.turn,

  legalMoves(s): JanggiMove[] {
    if (s.winner) return [];
    const moves: JanggiMove[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (s.board[idx(x, y)]?.c === s.turn) {
        for (const [tx, ty] of pieceMoves(s.board, x, y)) moves.push({ from: [x, y], to: [tx, ty] });
      }
    }
    return moves;
  },

  isLegal(s, m): boolean {
    const p = s.board[idx(m.from[0], m.from[1])];
    if (s.winner || !p || p.c !== s.turn) return false;
    return pieceMoves(s.board, m.from[0], m.from[1]).some(([tx, ty]) => tx === m.to[0] && ty === m.to[1]);
  },

  apply(s, m): JanggiState {
    const board = s.board.slice();
    const captured = board[idx(m.to[0], m.to[1])];
    board[idx(m.to[0], m.to[1])] = board[idx(m.from[0], m.from[1])] ?? null;
    board[idx(m.from[0], m.from[1])] = null;
    const winner = captured?.t === "k" ? s.turn : null;
    return { board, turn: other(s.turn), last: m, winner };
  },

  result(s): GameResult {
    if (s.winner) return { done: true, winner: s.winner, reason: "장 포획" };
    if (this.legalMoves(s).length === 0) return { done: true, winner: other(s.turn), reason: "외통" };
    return { done: false, winner: null };
  },
};
