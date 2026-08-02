import { other, type GameModule, type GameResult, type Player } from "./types.js";

// Quoridor. 9×9 pawn grid. "b" starts bottom (4,0), goal row y=8; "w" starts
// top (4,8), goal row y=0. Each side has 10 walls. A turn is one pawn move OR
// one wall placement. Walls may not fully block either pawn's path (BFS check).

export const QUORIDOR_SIZE = 9;
const N = QUORIDOR_SIZE;
const S = N - 1; // 8 wall-slot lines

export type Cell = [number, number];
export type QuoridorMove =
  | { kind: "move"; to: Cell }
  | { kind: "wall"; x: number; y: number; o: "h" | "v" };

export interface QuoridorState {
  pb: Cell;
  pw: Cell;
  /** horizontal / vertical wall slots, indexed sy*S+sx (sx,sy in 0..S-1). */
  hw: boolean[];
  vw: boolean[];
  walls: { b: number; w: number };
  turn: Player;
  last: QuoridorMove | null;
}

const slot = (x: number, y: number) => y * S + x;
const inB = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N;

function blockedN(st: QuoridorState, x: number, y: number): boolean {
  if (y >= N - 1) return true;
  return !!((x < S && st.hw[slot(x, y)]) || (x - 1 >= 0 && st.hw[slot(x - 1, y)]));
}
function blockedE(st: QuoridorState, x: number, y: number): boolean {
  if (x >= N - 1) return true;
  return !!((y < S && st.vw[slot(x, y)]) || (y - 1 >= 0 && st.vw[slot(x, y - 1)]));
}
const blockedS = (st: QuoridorState, x: number, y: number) => blockedN(st, x, y - 1);
const blockedW = (st: QuoridorState, x: number, y: number) => blockedE(st, x - 1, y);

/** Is the edge from (x,y) one step in dir open? (dir index: 0=N,1=S,2=E,3=W) */
function open(st: QuoridorState, x: number, y: number, d: number): boolean {
  if (d === 0) return !blockedN(st, x, y);
  if (d === 1) return !blockedS(st, x, y);
  if (d === 2) return !blockedE(st, x, y);
  return !blockedW(st, x, y);
}
const STEP: Cell[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function pawnOf(st: QuoridorState, p: Player): Cell {
  return p === "b" ? st.pb : st.pw;
}

/** Legal pawn destinations from `p`'s pawn, including jumps over the opponent. */
export function pawnMoves(st: QuoridorState, p: Player): Cell[] {
  const [x, y] = pawnOf(st, p);
  const [ox, oy] = pawnOf(st, other(p));
  const out: Cell[] = [];
  for (let d = 0; d < 4; d++) {
    if (!open(st, x, y, d)) continue;
    const nx = x + STEP[d]![0], ny = y + STEP[d]![1];
    if (!inB(nx, ny)) continue;
    if (nx !== ox || ny !== oy) { out.push([nx, ny]); continue; }
    // Opponent is there — try to jump straight over.
    if (open(st, nx, ny, d)) {
      const bx = nx + STEP[d]![0], by = ny + STEP[d]![1];
      if (inB(bx, by)) { out.push([bx, by]); continue; }
    }
    // Straight blocked → diagonal around the opponent.
    for (const dd of d < 2 ? [2, 3] : [0, 1]) {
      if (!open(st, nx, ny, dd)) continue;
      const dx = nx + STEP[dd]![0], dy = ny + STEP[dd]![1];
      if (inB(dx, dy)) out.push([dx, dy]);
    }
  }
  return out;
}

/** BFS: can `p`'s pawn still reach its goal row given the current walls? */
function hasPath(st: QuoridorState, p: Player): boolean {
  const goalY = p === "b" ? N - 1 : 0;
  const [sx, sy] = pawnOf(st, p);
  const seen = new Set<number>([sy * N + sx]);
  const queue: Cell[] = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (y === goalY) return true;
    for (let d = 0; d < 4; d++) {
      if (!open(st, x, y, d)) continue;
      const nx = x + STEP[d]![0], ny = y + STEP[d]![1];
      const key = ny * N + nx;
      if (inB(nx, ny) && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
    }
  }
  return false;
}

/** Shortest number of steps for `p`'s pawn to reach its goal row (∞ if none). */
export function distance(st: QuoridorState, p: Player): number {
  const goalY = p === "b" ? N - 1 : 0;
  const [sx, sy] = pawnOf(st, p);
  const dist = new Map<number, number>([[sy * N + sx, 0]]);
  const queue: Cell[] = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(y * N + x)!;
    if (y === goalY) return d;
    for (let dir = 0; dir < 4; dir++) {
      if (!open(st, x, y, dir)) continue;
      const nx = x + STEP[dir]![0], ny = y + STEP[dir]![1];
      const key = ny * N + nx;
      if (inB(nx, ny) && !dist.has(key)) { dist.set(key, d + 1); queue.push([nx, ny]); }
    }
  }
  return Infinity;
}

/** One shortest path (list of cells) for `p`'s pawn to its goal, or []. */
export function shortestPathCells(st: QuoridorState, p: Player): Cell[] {
  const goalY = p === "b" ? N - 1 : 0;
  const [sx, sy] = pawnOf(st, p);
  const prev = new Map<number, number>();
  const seen = new Set<number>([sy * N + sx]);
  const queue: Cell[] = [[sx, sy]];
  let end = -1;
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (y === goalY) { end = y * N + x; break; }
    for (let dir = 0; dir < 4; dir++) {
      if (!open(st, x, y, dir)) continue;
      const nx = x + STEP[dir]![0], ny = y + STEP[dir]![1];
      const key = ny * N + nx;
      if (inB(nx, ny) && !seen.has(key)) { seen.add(key); prev.set(key, y * N + x); queue.push([nx, ny]); }
    }
  }
  if (end < 0) return [];
  const path: Cell[] = [];
  for (let k: number | undefined = end; k !== undefined; k = prev.get(k)) path.push([k % N, Math.floor(k / N)]);
  return path.reverse();
}

function wallPlaceable(st: QuoridorState, x: number, y: number, o: "h" | "v"): boolean {
  if (x < 0 || x >= S || y < 0 || y >= S) return false;
  if (o === "h") {
    if (st.hw[slot(x, y)] || st.vw[slot(x, y)]) return false;
    if (x - 1 >= 0 && st.hw[slot(x - 1, y)]) return false;
    if (x + 1 < S && st.hw[slot(x + 1, y)]) return false;
  } else {
    if (st.vw[slot(x, y)] || st.hw[slot(x, y)]) return false;
    if (y - 1 >= 0 && st.vw[slot(x, y - 1)]) return false;
    if (y + 1 < S && st.vw[slot(x, y + 1)]) return false;
  }
  // Tentatively place and confirm both pawns still have a path.
  const trial = clone(st);
  (o === "h" ? trial.hw : trial.vw)[slot(x, y)] = true;
  return hasPath(trial, "b") && hasPath(trial, "w");
}

function clone(st: QuoridorState): QuoridorState {
  return { ...st, pb: [...st.pb], pw: [...st.pw], hw: st.hw.slice(), vw: st.vw.slice(), walls: { ...st.walls } };
}

export const quoridor: GameModule<QuoridorState, QuoridorMove> = {
  id: "quoridor",
  cols: N,
  rows: N,

  createState(): QuoridorState {
    return {
      pb: [4, 0],
      pw: [4, 8],
      hw: Array(S * S).fill(false),
      vw: Array(S * S).fill(false),
      walls: { b: 10, w: 10 },
      turn: "b",
      last: null,
    };
  },

  turn: (s) => s.turn,

  legalMoves(s): QuoridorMove[] {
    if (this.result(s).done) return [];
    const moves: QuoridorMove[] = pawnMoves(s, s.turn).map((to) => ({ kind: "move", to }));
    if (s.walls[s.turn] > 0) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (wallPlaceable(s, x, y, "h")) moves.push({ kind: "wall", x, y, o: "h" });
        if (wallPlaceable(s, x, y, "v")) moves.push({ kind: "wall", x, y, o: "v" });
      }
    }
    return moves;
  },

  isLegal(s, m): boolean {
    if (this.result(s).done) return false;
    if (m.kind === "move") return pawnMoves(s, s.turn).some(([x, y]) => x === m.to[0] && y === m.to[1]);
    return s.walls[s.turn] > 0 && wallPlaceable(s, m.x, m.y, m.o);
  },

  apply(s, m): QuoridorState {
    const st = clone(s);
    if (m.kind === "move") {
      if (s.turn === "b") st.pb = [...m.to]; else st.pw = [...m.to];
    } else {
      (m.o === "h" ? st.hw : st.vw)[slot(m.x, m.y)] = true;
      st.walls[s.turn]--;
    }
    st.turn = other(s.turn);
    st.last = m;
    return st;
  },

  result(s): GameResult {
    if (s.pb[1] === N - 1) return { done: true, winner: "b", reason: "Reached the goal" };
    if (s.pw[1] === 0) return { done: true, winner: "w", reason: "Reached the goal" };
    return { done: false, winner: null };
  },
};
