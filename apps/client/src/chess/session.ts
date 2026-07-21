import { createMatch, reduce, type Action, type MatchEvent, type MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { chooseMove } from "./ai.js";

/**
 * A session is the client's handle on an authoritative match. Both flavours
 * expose the same surface, so the game controller doesn't care whether it's a
 * local AI game (in-process `reduce`) or an online match (server round-trip).
 */
export interface Session {
  readonly myColor: Color;
  getState(): MatchState;
  subscribe(cb: (state: MatchState, events: MatchEvent[]) => void): void;
  dispatch(action: Action): void;
  dispose(): void;
}

export interface LocalConfig {
  humanColor: Color;
  humanDeck: string[];
  aiDeck: string[];
  depth: number;
}

/** Single-player: runs the same engine reducer in-process; the AI emits moves. */
export function createLocalSession(cfg: LocalConfig): Session {
  const aiColor: Color = cfg.humanColor === "w" ? "b" : "w";
  const whiteDeck = cfg.humanColor === "w" ? cfg.humanDeck : cfg.aiDeck;
  const blackDeck = cfg.humanColor === "w" ? cfg.aiDeck : cfg.humanDeck;

  let state = createMatch(whiteDeck, blackDeck);
  let listener: ((s: MatchState, e: MatchEvent[]) => void) | null = null;
  let disposed = false;
  let timer: number | undefined;

  function apply(action: Action): void {
    const res = reduce(state, action, Math.random);
    if (!res.ok) {
      console.warn("[local] rejected action", action.type, res.error);
      return;
    }
    state = res.state;
    listener?.(state, res.events);
    scheduleAi();
  }

  function scheduleAi(): void {
    if (disposed || state.status !== "playing" || state.pending) return;
    if (state.chess.turn !== aiColor) return;
    timer = window.setTimeout(() => {
      if (disposed || state.chess.turn !== aiColor || state.pending || state.status !== "playing") return;
      const disguise = state.players[cfg.humanColor].cloakTurnsLeft > 0 ? cfg.humanColor : undefined;
      const forbidden = state.players[aiColor].lockedFrom ?? undefined;
      const move = chooseMove(state.chess, cfg.depth, state.rules, forbidden, disguise);
      if (move) apply({ type: "move", from: move.from, to: move.to, promotion: move.promotion });
    }, 350);
  }

  scheduleAi(); // AI moves first if the human plays black

  return {
    myColor: cfg.humanColor,
    getState: () => state,
    subscribe: (cb) => {
      listener = cb;
    },
    dispatch: (action) => apply(action),
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** Online: dispatch sends to the server; state arrives back over the socket. */
export function createRemoteSession(ws: WebSocket, myColor: Color, initial: MatchState): Session {
  let state = initial;
  let listener: ((s: MatchState, e: MatchEvent[]) => void) | null = null;

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === "state") {
      state = msg.state as MatchState;
      listener?.(state, msg.events as MatchEvent[]);
    }
  };

  return {
    myColor,
    getState: () => state,
    subscribe: (cb) => {
      listener = cb;
    },
    dispatch: (action) => ws.send(JSON.stringify({ type: "action", action })),
    dispose: () => ws.close(),
  };
}
