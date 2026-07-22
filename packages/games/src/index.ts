export * from "./types.js";
export * from "./omok.js";
export * from "./othello.js";
export * from "./janggi.js";
export * from "./quoridor.js";

import type { GameModule } from "./types.js";
import { omok } from "./omok.js";
import { othello } from "./othello.js";
import { janggi } from "./janggi.js";
import { quoridor } from "./quoridor.js";

/** Rules modules keyed by game id. Chess lives in its own (@skill/engine) path. */
export const GAME_MODULES: Record<string, GameModule> = {
  omok: omok as GameModule,
  othello: othello as GameModule,
  janggi: janggi as GameModule,
  quoridor: quoridor as GameModule,
};

export function getGameModule(id: string): GameModule | undefined {
  return GAME_MODULES[id];
}
