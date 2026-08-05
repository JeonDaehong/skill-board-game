import type { Color, GameState, Move, SkillRules, Square } from "@skill/chess-core";
import { chooseMove, type SearchOptions } from "./ai.js";
import type { AiReply, AiRequest } from "./ai.worker.js";

/**
 * Runs the AI search, preferring a worker thread.
 *
 * The search is a pure function over a plain, structured-cloneable state, so it
 * moves across the wire untouched. If the environment has no Workers the runner
 * quietly runs it in-process instead — the game still plays, it just stutters
 * while the AI thinks, which is what it did before this existed.
 */
export interface AiRunner {
  search(
    state: GameState,
    opts: SearchOptions,
    rules?: SkillRules,
    forbiddenFrom?: Square,
    disguise?: Color,
  ): Promise<Move | null>;
  dispose(): void;
}

export function createAiRunner(): AiRunner {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, (move: Move | null) => void>();

  try {
    worker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<AiReply>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) {
        pending.delete(e.data.id);
        resolve(e.data.move);
      }
    };
    worker.onerror = () => {
      // A worker that failed to start is worse than none: fall back for good so
      // the AI does not simply stop taking its turn.
      worker?.terminate();
      worker = null;
      for (const [, resolve] of pending) resolve(null);
      pending.clear();
    };
  } catch {
    worker = null;
  }

  return {
    search(state, opts, rules, forbiddenFrom, disguise) {
      if (!worker) {
        return Promise.resolve(chooseMove(state, opts, rules, forbiddenFrom, disguise));
      }
      const id = nextId++;
      const req: AiRequest = { id, state, opts, rules, forbiddenFrom, disguise };
      return new Promise<Move | null>((resolve) => {
        pending.set(id, resolve);
        worker!.postMessage(req);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
