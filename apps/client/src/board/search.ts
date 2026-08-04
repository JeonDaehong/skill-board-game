import { type GameModule, type Player } from "@skill/games";

export interface SearchConfig<S, M> {
  /** Static evaluation from `me`'s perspective (higher = better for me). */
  evaluate: (s: S, me: Player) => number;
  /** Candidate moves for the side to move, ideally pre-ordered best-first. */
  moves: (s: S) => M[];
  maxDepth: number;
  timeMs: number;
  /**
   * Root-score window in this game's own evaluation units: any move within
   * `margin` of the best is a candidate, chosen at random. 0 = always best.
   * This is how the lower difficulty rungs are made losable — see ../difficulty.
   */
  margin?: number;
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

  const margin = cfg.margin ?? 0;
  let best: M = rootMoves[0]!;
  let bestScored: { move: M; score: number }[] = [];

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    let localBest: M = best;
    let bestScore = -Infinity;
    const scored: { move: M; score: number }[] = [];
    // Search the previous best first for stronger pruning.
    const ordered = [best, ...rootMoves.filter((m) => m !== best)];
    for (const m of ordered) {
      // A weakened level needs a real score for every root move, so it cannot
      // narrow the window down to the best score found so far.
      const alpha = margin > 0 ? -Infinity : bestScore;
      const score = minimax(mod.apply(root, m), depth - 1, alpha, Infinity);
      if (aborted) break;
      if (margin > 0) scored.push({ move: m, score });
      if (score > bestScore) { bestScore = score; localBest = m; }
    }
    if (aborted) break; // discard the incomplete depth
    best = localBest;
    bestScored = scored;
    if (bestScore >= WIN) break; // forced win found
  }

  if (margin > 0 && bestScored.length > 0) {
    const top = Math.max(...bestScored.map((s) => s.score));
    const near = bestScored.filter((s) => s.score >= top - margin);
    return near[Math.floor(Math.random() * near.length)]!.move;
  }
  return best;
}
