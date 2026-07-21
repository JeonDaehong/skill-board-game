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
 * `disguise` (은폐): pieces of that color that aren't pawns/king are valued as
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

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rules?: SkillRules,
  disguise?: Color,
): number {
  const moves = generateLegalMoves(state, undefined, rules);
  if (moves.length === 0) {
    // Checkmate is bad for the side to move; stalemate is neutral.
    // Add depth so shallower mates score better (mate sooner).
    return isInCheck(state, state.turn, rules) ? -(MATE + depth) : 0;
  }
  if (depth === 0) return evaluate(state, disguise);

  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, rules, disguise);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // cutoff
  }
  return best;
}

/**
 * Pick a move for the side to move, searching to `depth`. Returns null if there
 * are no legal moves (game already over). Ties are broken randomly so the AI
 * doesn't play identically every game.
 */
export function chooseMove(
  state: GameState,
  depth: number,
  rules?: SkillRules,
  forbiddenFrom?: Square,
  disguise?: Color,
): Move | null {
  let moves = orderMoves(generateLegalMoves(state, undefined, rules));
  // 무르기: the just-undone piece may not move again this turn.
  if (forbiddenFrom !== undefined) {
    const filtered = moves.filter((m) => m.from !== forbiddenFrom);
    if (filtered.length > 0) moves = filtered;
  }
  if (moves.length === 0) return null;

  let best = -Infinity;
  let bestMoves: Move[] = [];
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha, rules, disguise);
    if (score > best) {
      best = score;
      bestMoves = [move];
    } else if (score === best) {
      bestMoves.push(move);
    }
    if (best > alpha) alpha = best;
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)]!;
}
