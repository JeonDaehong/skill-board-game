import type { Color, GameState, Move, SkillRules, Square } from "@skill/chess-core";
import { chooseMove, type SearchOptions } from "./ai.js";

/**
 * The AI search, off the main thread.
 *
 * `chooseMove` runs a wall-clock-budgeted search — up to five seconds on the
 * hardest rung — and it is synchronous. On the main thread that froze
 * everything: the clocks stopped repainting and then jumped by the whole
 * thinking time the moment the move landed. Here it blocks a thread nobody is
 * looking at.
 */
export interface AiRequest {
  id: number;
  state: GameState;
  opts: SearchOptions;
  rules?: SkillRules;
  forbiddenFrom?: Square;
  disguise?: Color;
}

export interface AiReply {
  id: number;
  move: Move | null;
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, state, opts, rules, forbiddenFrom, disguise } = e.data;
  const move = chooseMove(state, opts, rules, forbiddenFrom, disguise);
  (self as unknown as Worker).postMessage({ id, move } satisfies AiReply);
};
