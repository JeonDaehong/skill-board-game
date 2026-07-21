import { applyMove, generateLegalMoves } from "./moves.js";
import type { GameState } from "./types.js";

/**
 * Perft ("performance test"): count the number of leaf nodes in the move tree
 * to a given depth. The canonical way to prove a move generator is correct — a
 * single wrong count means a rule (castling, en passant, promotion, pins…) is
 * mishandled somewhere.
 */
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(state);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    nodes += perft(applyMove(state, move), depth - 1);
  }
  return nodes;
}
