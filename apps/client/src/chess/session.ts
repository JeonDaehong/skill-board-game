import {
  createMatch,
  reduce,
  type Action,
  type GameMode,
  type MatchEvent,
  type MatchState,
} from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { type SearchOptions } from "./ai.js";
import { createAiRunner } from "./ai-runner.js";
import { aiCardAction } from "./ai-cards.js";

/**
 * A session is the client's handle on an authoritative match. Both flavours
 * expose the same surface, so the game controller doesn't care whether it's a
 * local AI game (in-process `reduce`) or an online match (server round-trip).
 */
/** Out-of-band events that only a remote (server) session produces. */
export type SessionNotice = "rematch-waiting" | "opponent-left";

export interface Session {
  readonly myColor: Color;
  /**
   * True when this client owns the clock and may call a flag. A local AI game
   * does; an online match is clocked by the server, and a client that flagged
   * its opponent on its own reading would be trusting its own lag.
   */
  readonly ownsClock: boolean;
  getState(): MatchState;
  /** Latest server-reported main clocks (ms), or null when there are none. */
  clocks(): { w: number; b: number } | null;
  subscribe(cb: (state: MatchState, events: MatchEvent[]) => void): void;
  /** Notices that aren't state changes (rematch pending, opponent quit). */
  onNotice(cb: (notice: SessionNotice) => void): void;
  dispatch(action: Action): void;
  /** Ask to play again with the same decks. Local restarts at once; remote
   *  needs the opponent to agree, then a fresh state arrives over the socket. */
  rematch(): void;
  dispose(): void;
}

export interface LocalConfig {
  mode: GameMode;
  humanColor: Color;
  humanDeck: string[];
  aiDeck: string[];
  /** Search budget for the AI, taken from the chosen difficulty rung. */
  search: SearchOptions;
}

/** How long the AI pauses before each of its own actions. */
const AI_MOVE_DELAY_MS = 350;
/** A card step is bookkeeping, not thinking — it should not feel deliberated. */
const AI_CARD_DELAY_MS = 220;

/** Single-player: runs the same engine reducer in-process; the AI emits moves. */
export function createLocalSession(cfg: LocalConfig): Session {
  const aiColor: Color = cfg.humanColor === "w" ? "b" : "w";
  const whiteDeck = cfg.humanColor === "w" ? cfg.humanDeck : cfg.aiDeck;
  const blackDeck = cfg.humanColor === "w" ? cfg.aiDeck : cfg.humanDeck;

  let state = createMatch(cfg.mode, whiteDeck, blackDeck, Math.random);
  let listener: ((s: MatchState, e: MatchEvent[]) => void) | null = null;
  let disposed = false;
  let timer: number | undefined;
  // The search runs on its own thread; on the main one it froze the clocks and
  // every repaint until the AI was done thinking.
  const ai = createAiRunner();
  // Local play has no opponent to negotiate with, so notices never fire.

  function apply(action: Action): boolean {
    const res = reduce(state, action, Math.random);
    if (!res.ok) {
      console.warn("[local] rejected action", action.type, res.error);
      return false;
    }
    state = res.state;
    listener?.(state, res.events);
    scheduleAi();
    return true;
  }

  /** True when the engine is waiting on the AI for anything at all. */
  function aiOnTheHook(): boolean {
    if (state.status !== "playing") return false;
    return state.pending ? state.pending.color === aiColor : state.chess.turn === aiColor;
  }

  function scheduleAi(): void {
    if (disposed || !aiOnTheHook()) return;
    if (timer) clearTimeout(timer);
    // The AI's turn is now several steps — draw, summon, skills, then the move
    // — so each step is scheduled on its own and re-schedules the next.
    const cardStep = aiCardAction(state, aiColor);
    const delay = cardStep ? AI_CARD_DELAY_MS : AI_MOVE_DELAY_MS;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (disposed || !aiOnTheHook()) return;

      const step = aiCardAction(state, aiColor);
      if (step) {
        // A rejected card step would loop forever if it were retried, so a
        // refusal falls through to the move instead.
        if (apply(step)) return;
      }
      if (state.pending || state.chess.turn !== aiColor) return;

      // 환각 makes the human's pieces read as pawns to whoever is fooled.
      const fooled = state.players[cfg.humanColor].lasting.some((l) => l.card === "hallucination");
      const disguise = fooled ? cfg.humanColor : undefined;
      const forbidden = state.players[aiColor].locked[0];
      const thinkingFrom = state;
      void ai.search(state.chess, cfg.search, state.rules, forbidden, disguise).then((move) => {
        // The search took real time; the match may have been torn down, or the
        // human may have taken a counter window, while it ran.
        if (disposed || state !== thinkingFrom || !aiOnTheHook()) return;
        if (move) {
          apply({ type: "move", from: move.from, to: move.to, promotion: move.promotion });
        } else if (state.moveSpent || state.phase !== "move") {
          // Nothing to move (or the move was spent on a card): hand the turn
          // over rather than sitting on it forever.
          apply({ type: "end-turn" });
        }
      });
    }, delay);
  }

  scheduleAi(); // AI moves first if the human plays black

  return {
    myColor: cfg.humanColor,
    ownsClock: true,
    getState: () => state,
    clocks: () => null,
    subscribe: (cb) => {
      listener = cb;
    },
    onNotice: () => {},
    dispatch: (action) => void apply(action),
    rematch: () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      state = createMatch(cfg.mode, whiteDeck, blackDeck, Math.random);
      listener?.(state, []);
      scheduleAi(); // AI moves first again if the human plays black
    },
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      ai.dispose();
    },
  };
}

/** Online: dispatch sends to the server; state arrives back over the socket. */
export function createRemoteSession(ws: WebSocket, myColor: Color, initial: MatchState): Session {
  let state = initial;
  let clocks: { w: number; b: number } | null = null;
  let listener: ((s: MatchState, e: MatchEvent[]) => void) | null = null;
  let noticer: ((n: SessionNotice) => void) | null = null;

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === "state") {
      state = msg.state as MatchState;
      if (msg.clocks) clocks = msg.clocks as { w: number; b: number };
      listener?.(state, msg.events as MatchEvent[]);
    } else if (msg.type === "rematch-waiting") {
      noticer?.("rematch-waiting");
    } else if (msg.type === "opponent-left") {
      noticer?.("opponent-left");
    }
  };

  return {
    myColor,
    ownsClock: false,
    getState: () => state,
    clocks: () => clocks,
    subscribe: (cb) => {
      listener = cb;
    },
    onNotice: (cb) => {
      noticer = cb;
    },
    dispatch: (action) => ws.send(JSON.stringify({ type: "action", action })),
    rematch: () => ws.send(JSON.stringify({ type: "rematch" })),
    dispose: () => ws.close(),
  };
}
