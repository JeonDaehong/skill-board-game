import { type GameModule, type Player } from "@skill/games";

export interface SearchConfig<S, M> {
  /** Static evaluation from `me`'s perspective (higher = better for me). */
  evaluate: (s: S, me: Player) => number;
  /** Candidate moves for the side to move, ideally pre-ordered best-first. */
  moves: (s: S) => M[];
  maxDepth: number;
  timeMs: number;
}

const WIN = 1e9;

/**
 * Depth-limited alpha-beta minimax with iterative deepening and a wall-clock
 * budget. Generic over any @skill/games module — each game supplies its own
 * evaluation and (pruned, ordered) candidate moves. Runs on the main thread,
 * so keep `timeMs` modest.
 */
export function chooseBySearch<S, M>(
  mod: GameModule<S, M>,
  root: S,
  me: Player,
  cfg: SearchConfig<S, M>,
): M | null {
  const rootMoves = cfg.moves(root);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0]!;

  const deadline = Date.now() + cfg.timeMs;
  let aborted = false;
  let nodes = 0;

  function minimax(s: S, depth: number, alpha: number, beta: number): number {
    if (aborted) return 0;
    if ((++nodes & 1023) === 0 && Date.now() > deadline) { aborted = true; return 0; }

    const res = mod.result(s);
    if (res.done) {
      if (res.winner == null || res.winner === "draw") return 0;
      // Prefer faster wins / slower losses via the depth term.
      return res.winner === me ? WIN + depth : -WIN - depth;
    }
    if (depth === 0) return cfg.evaluate(s, me);

    const maxing = mod.turn(s) === me;
    const ms = cfg.moves(s);
    if (maxing) {
      let best = -Infinity;
      for (const m of ms) {
        best = Math.max(best, minimax(mod.apply(s, m), depth - 1, alpha, beta));
        alpha = Math.max(alpha, best);
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of ms) {
      best = Math.min(best, minimax(mod.apply(s, m), depth - 1, alpha, beta));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  let best: M = rootMoves[0]!;
  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    let localBest: M = best;
    let bestScore = -Infinity;
    // Search the previous best first for stronger pruning.
    const ordered = [best, ...rootMoves.filter((m) => m !== best)];
    for (const m of ordered) {
      const score = minimax(mod.apply(root, m), depth - 1, bestScore, Infinity);
      if (aborted) break;
      if (score > bestScore) { bestScore = score; localBest = m; }
    }
    if (aborted) break; // discard the incomplete depth
    best = localBest;
    if (bestScore >= WIN) break; // forced win found
  }
  return best;
}
