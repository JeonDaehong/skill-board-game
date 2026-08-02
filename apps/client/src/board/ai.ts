import {
  other,
  OMOK_SIZE, makesFive, omok, type OmokState, type OmokMove,
  othello, flips, type OthelloState, type OthelloMove,
  janggi, JANGGI_W, type JanggiState, type JanggiMove,
  quoridor, pawnMoves, distance, shortestPathCells, type QuoridorState, type QuoridorMove,
  type Player,
} from "@skill/games";
import { chooseBySearch } from "./search.js";

// ── Omok (threat-window eval + alpha-beta) ───────────────────
const ON = OMOK_SIZE;
const oidx = (x: number, y: number) => y * ON + x;
const OMOK_DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** Move-ordering heuristic: value of the lines (x,y) extends for `color`. */
function omokScore(board: (Player | null)[], x: number, y: number, color: Player): number {
  let score = 0;
  for (const [dx, dy] of OMOK_DIRS) {
    let run = 1, openEnds = 0;
    for (const sign of [1, -1]) {
      let cx = x + dx * sign, cy = y + dy * sign;
      while (cx >= 0 && cx < ON && cy >= 0 && cy < ON && board[oidx(cx, cy)] === color) { run++; cx += dx * sign; cy += dy * sign; }
      if (cx >= 0 && cx < ON && cy >= 0 && cy < ON && board[oidx(cx, cy)] === null) openEnds++;
    }
    score += run * run * (openEnds + 1);
  }
  return score;
}

// Positional value of a length-5 window by stone count (unblocked by opponent).
const OW = [0, 2, 16, 130, 1500, 120000];
function omokEval(s: OmokState, me: Player): number {
  const b = s.board;
  const opp = other(me);
  let score = 0;
  for (const [dx, dy] of OMOK_DIRS) {
    for (let y = 0; y < ON; y++) for (let x = 0; x < ON; x++) {
      const ex = x + 4 * dx, ey = y + 4 * dy;
      if (ex < 0 || ex >= ON || ey < 0 || ey >= ON) continue;
      let mc = 0, oc = 0;
      for (let k = 0; k < 5; k++) { const c = b[oidx(x + k * dx, y + k * dy)]; if (c === me) mc++; else if (c === opp) oc++; }
      if (oc === 0 && mc > 0) score += OW[mc]!;
      else if (mc === 0 && oc > 0) score -= OW[oc]! * 1.15;
    }
  }
  return score;
}

function omokCandidates(s: OmokState): OmokMove[] {
  const b = s.board;
  if (b.every((c) => c === null)) return [{ x: (ON - 1) / 2, y: (ON - 1) / 2 }];
  const scored: { m: OmokMove; score: number }[] = [];
  for (let y = 0; y < ON; y++) for (let x = 0; x < ON; x++) {
    if (b[oidx(x, y)] !== null) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < ON && ny >= 0 && ny < ON && b[oidx(nx, ny)] !== null) { near = true; break; }
    }
    if (!near) continue;
    scored.push({ m: { x, y }, score: omokScore(b, x, y, s.turn) + 0.8 * omokScore(b, x, y, other(s.turn)) });
  }
  scored.sort((a, b) => b.score - a.score);
  // Widened alongside the deeper search: 10 candidates was starving it.
  return scored.slice(0, 14).map((c) => c.m);
}

export function omokAI(s: OmokState): OmokMove | null {
  const me = s.turn, opp = other(me);
  const b = s.board;
  if (b.every((c) => c === null)) return { x: (ON - 1) / 2, y: (ON - 1) / 2 };
  const cands = omokCandidates(s);
  for (const c of cands) { const t = b.slice(); t[oidx(c.x, c.y)] = me; if (makesFive(t, c.x, c.y, me)) return c; }
  for (const c of cands) { const t = b.slice(); t[oidx(c.x, c.y)] = opp; if (makesFive(t, c.x, c.y, opp)) return c; }
  return chooseBySearch(omok, s, me, { evaluate: omokEval, moves: omokCandidates, maxDepth: 12, timeMs: 2600 });
}

// ── Othello (positional + mobility, endgame solve) ───────────
const OTH_W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];
const OTH_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function countMoves(board: (Player | null)[], p: Player): number {
  let n = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (flips(board, x, y, p).length) n++;
  return n;
}
/** Frontier discs of `p`: own discs touching an empty square (fewer = safer). */
function frontier(board: (Player | null)[], p: Player): number {
  let n = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (board[y * 8 + x] !== p) continue;
    for (const [dx, dy] of OTH_DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === null) { n++; break; }
    }
  }
  return n;
}
function othelloEval(s: OthelloState, me: Player): number {
  const opp = other(me);
  const b = s.board;
  let empties = 0, my = 0, op = 0, pos = 0;
  for (let i = 0; i < 64; i++) {
    const c = b[i];
    if (c === null) { empties++; continue; }
    if (c === me) { my++; pos += OTH_W[i]!; } else { op++; pos -= OTH_W[i]!; }
  }
  if (empties === 0) return (my - op) * 1_000_000;
  if (empties <= 12) return (my - op) * 100; // endgame: maximize discs (search solves to end)
  // Midgame: square values (corners/edges) + mobility + frontier control.
  const mob = countMoves(b, me) - countMoves(b, opp);
  const fr = frontier(b, me) - frontier(b, opp);
  return pos + 15 * mob - 8 * fr;
}
function othelloCandidates(s: OthelloState): OthelloMove[] {
  return othello.legalMoves(s).sort((a, b) => OTH_W[b.y * 8 + b.x]! - OTH_W[a.y * 8 + a.x]!);
}
export function othelloAI(s: OthelloState): OthelloMove | null {
  return chooseBySearch(othello, s, s.turn, { evaluate: othelloEval, moves: othelloCandidates, maxDepth: 20, timeMs: 2600 });
}

// ── Janggi (material + captures-first ordering) ──────────────
const JVAL: Record<string, number> = { k: 100000, r: 130, c: 70, h: 50, e: 30, a: 30, s: 20 };
const JW = JANGGI_W;
function janggiEval(s: JanggiState, me: Player): number {
  let sc = 0;
  for (const p of s.board) if (p) sc += (p.c === me ? 1 : -1) * JVAL[p.t]!;
  return sc;
}
function capVal(s: JanggiState, m: JanggiMove): number {
  const t = s.board[m.to[1] * JW + m.to[0]];
  return t ? JVAL[t.t]! : 0;
}
function janggiCandidates(s: JanggiState): JanggiMove[] {
  return janggi.legalMoves(s).sort((a, b) => capVal(s, b) - capVal(s, a));
}
export function janggiAI(s: JanggiState): JanggiMove | null {
  return chooseBySearch(janggi, s, s.turn, { evaluate: janggiEval, moves: janggiCandidates, maxDepth: 8, timeMs: 2800 });
}

// ── Quoridor (shortest-path eval + focused wall pruning) ─────
function quoridorEval(s: QuoridorState, me: Player): number {
  const md = distance(s, me), od = distance(s, other(me));
  if (md === Infinity) return -1e7;
  if (od === Infinity) return 1e7;
  // Path lead dominates; a small bonus for keeping walls in reserve.
  return (od - md) * 12 + (s.walls[me] - s.walls[other(me)]) * 2;
}
function quoridorCandidates(s: QuoridorState): QuoridorMove[] {
  const me = s.turn, opp = other(me);
  // Pawn moves, ordered by how much they advance me toward my goal.
  const pawns = pawnMoves(s, me)
    .map((to) => ({ move: { kind: "move" as const, to }, d: distance(quoridor.apply(s, { kind: "move", to }), me) }))
    .sort((a, b) => a.d - b.d)
    .map((c) => c.move);

  const walls: QuoridorMove[] = [];
  if (s.walls[me] > 0) {
    const baseOpp = distance(s, opp);
    const path = shortestPathCells(s, opp);
    const seen = new Set<string>();
    const scored: { move: QuoridorMove; delta: number }[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const [x, y] = path[i]!, [nx, ny] = path[i + 1]!;
      let cands: [number, number, "h" | "v"][] = [];
      if (ny === y + 1) cands = [[x, y, "h"], [x - 1, y, "h"]];
      else if (ny === y - 1) cands = [[x, y - 1, "h"], [x - 1, y - 1, "h"]];
      else if (nx === x + 1) cands = [[x, y, "v"], [x, y - 1, "v"]];
      else if (nx === x - 1) cands = [[x - 1, y, "v"], [x - 1, y - 1, "v"]];
      for (const [wx, wy, o] of cands) {
        const key = `${wx},${wy},${o}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const move: QuoridorMove = { kind: "wall", x: wx, y: wy, o };
        if (!quoridor.isLegal(s, move)) continue;
        const delta = distance(quoridor.apply(s, move), opp) - baseOpp;
        if (delta > 0) scored.push({ move, delta }); // only walls that actually slow them
      }
    }
    scored.sort((a, b) => b.delta - a.delta);
    for (const c of scored.slice(0, 6)) walls.push(c.move);
  }
  return [...pawns, ...walls];
}
export function quoridorAI(s: QuoridorState): QuoridorMove | null {
  return chooseBySearch(quoridor, s, s.turn, { evaluate: quoridorEval, moves: quoridorCandidates, maxDepth: 6, timeMs: 2600 });
}

// ── registry ─────────────────────────────────────────────────
type AnyAI = (s: unknown) => unknown;
const REGISTRY: Record<string, AnyAI> = {
  omok: omokAI as AnyAI,
  othello: othelloAI as AnyAI,
  janggi: janggiAI as AnyAI,
  quoridor: quoridorAI as AnyAI,
};

export function getAI<S, M>(gameId: string): (s: S) => M | null {
  return (REGISTRY[gameId] ?? (() => null)) as (s: S) => M | null;
}
