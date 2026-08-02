import {
  applyMove,
  generateLegalMoves,
  isInCheck,
  type Color,
  type GameState,
  type Move,
  type PieceType,
  type SkillRules,
  type Square,
} from "@skill/chess-core";

/**
 * A small negamax + alpha-beta chess AI built entirely on top of chess-core's
 * pure move logic. Not a strong engine — depth 2–3 with material + piece-square
 * evaluation — but enough for a fun single-player opponent. Runs on the main
 * thread; a later pass can move it into a Web Worker for deeper search.
 */

const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

// Piece-square tables, written from White's view with index 0 = a1.
// Black mirrors vertically (sq ^ 56). Encourages sensible development/center.
// prettier-ignore
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10,-20,-20, 10, 10,  5,
   5, -5,-10,  0,  0,-10, -5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5,  5, 10, 25, 25, 10,  5,  5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
   0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
// prettier-ignore
const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
// prettier-ignore
const PST_KING = [
   20, 30, 10,  0,  0, 10, 30, 20,
   20, 20,  0,  0,  0,  0, 20, 20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
];

const PST: Partial<Record<PieceType, number[]>> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  k: PST_KING,
};

const MATE = 1_000_000;

/**
 * Static evaluation from the side-to-move's perspective (higher = better).
 * `disguise` (Cloak): pieces of that color that aren't pawns/king are valued as
 * pawns, so the AI under-rates the disguised side's material.
 */
function evaluate(state: GameState, disguise?: Color): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const effType: PieceType =
      disguise && p.color === disguise && p.type !== "p" && p.type !== "k" ? "p" : p.type;
    const table = PST[effType];
    const pstIndex = p.color === "w" ? sq : sq ^ 56;
    const val = PIECE_VALUE[effType] + (table ? table[pstIndex]! : 0);
    score += p.color === "w" ? val : -val;
  }
  return state.turn === "w" ? score : -score;
}

/** Order moves (captures first) to make alpha-beta prune more. */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => scoreMove(b) - scoreMove(a));
}

function scoreMove(m: Move): number {
  let s = 0;
  if (m.captured) s += 10 * PIECE_VALUE[m.captured.type] - PIECE_VALUE[m.piece.type];
  if (m.promotion) s += PIECE_VALUE[m.promotion];
  return s;
}

// Wall-clock budget for a full move search (iterative deepening stops here).
const TIME_MS = 900;
let deadline = 0;
let aborted = false;
function timeUp(): boolean {
  if (aborted) return true;
  if (Date.now() > deadline) aborted = true;
  return aborted;
}

/**
 * Quiescence search: at the horizon, keep resolving captures (and check
 * evasions) so the evaluation is only taken in "quiet" positions. This removes
 * most tactical blunders from the horizon effect.
 */
function quiesce(state: GameState, alpha: number, beta: number, rules?: SkillRules, disguise?: Color): number {
  if (timeUp()) return 0;
  const inCheck = isInCheck(state, state.turn, rules);
  let moves = generateLegalMoves(state, undefined, rules);
  if (moves.length === 0) return inCheck ? -MATE : 0;

  if (!inCheck) {
    const standPat = evaluate(state, disguise);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    moves = moves.filter((m) => m.captured || m.promotion); // only forcing moves
  }
  for (const move of orderMoves(moves)) {
    const score = -quiesce(applyMove(state, move), -beta, -alpha, rules, disguise);
    if (aborted) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rules?: SkillRules,
  disguise?: Color,
): number {
  if (timeUp()) return 0;
  const moves = generateLegalMoves(state, undefined, rules);
  if (moves.length === 0) {
    // Checkmate is bad for the side to move; stalemate is neutral.
    // Add depth so shallower mates score better (mate sooner).
    return isInCheck(state, state.turn, rules) ? -(MATE + depth) : 0;
  }
  if (depth === 0) return quiesce(state, alpha, beta, rules, disguise);

  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, rules, disguise);
    if (aborted) return best;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // cutoff
  }
  return best;
}

/**
 * Pick a move for the side to move. Uses iterative deepening up to `maxDepth`
 * under a wall-clock budget, so it plays as deep as time allows and returns the
 * best move from the last fully-searched depth. Ties break randomly.
 */
export function chooseMove(
  state: GameState,
  maxDepth: number,
  rules?: SkillRules,
  forbiddenFrom?: Square,
  disguise?: Color,
): Move | null {
  let rootMoves = orderMoves(generateLegalMoves(state, undefined, rules));
  // Undo: the just-undone piece may not move again this turn.
  if (forbiddenFrom !== undefined) {
    const filtered = rootMoves.filter((m) => m.from !== forbiddenFrom);
    if (filtered.length > 0) rootMoves = filtered;
  }
  if (rootMoves.length === 0) return null;

  deadline = Date.now() + TIME_MS;
  aborted = false;

  let best = rootMoves[0]!;
  let bestMoves: Move[] = [best];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let localBest = -Infinity;
    let localMoves: Move[] = [];
    let alpha = -Infinity;
    // Search the previous best move first for stronger pruning.
    const ordered = [best, ...rootMoves.filter((m) => m !== best)];
    for (const move of ordered) {
      const score = -negamax(applyMove(state, move), depth - 1, -Infinity, -alpha, rules, disguise);
      if (aborted) break;
      if (score > localBest) { localBest = score; localMoves = [move]; }
      else if (score === localBest) localMoves.push(move);
      if (localBest > alpha) alpha = localBest;
    }
    if (aborted) break; // discard incomplete depth
    best = localMoves[0]!;
    bestMoves = localMoves;
    if (localBest >= MATE) break; // forced mate found
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)]!;
}
