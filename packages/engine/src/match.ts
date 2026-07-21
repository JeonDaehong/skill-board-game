import {
  getStatus,
  initialState,
  opposite,
  type Color,
  type SkillRules,
} from "@skill/chess-core";
import { skillMeta } from "./skills.js";
import type { MatchEvent, MatchState, PlayerState, SkillCardState } from "./types.js";

const COLORS: Color[] = ["w", "b"];

function makePlayer(color: Color, skillIds: string[]): PlayerState {
  const deck: SkillCardState[] = [];
  for (const id of skillIds) {
    const meta = skillMeta(id);
    if (!meta) continue;
    deck.push({ id, cooldownRemaining: 0, usesLeft: meta.usesPerGame });
  }
  return {
    color,
    deck,
    grave: [],
    protectedSquare: null,
    lockedFrom: null,
    extraTurnPending: false,
    cloakTurnsLeft: 0,
    tempQueens: [],
    tempQueensTurnsLeft: 0,
    revealed: [],
  };
}

/** Create a fresh match. `white`/`black` are the drafted skill-id lists. */
export function createMatch(white: string[], black: string[]): MatchState {
  const state: MatchState = {
    chess: initialState(),
    rules: {},
    players: { w: makePlayer("w", white), b: makePlayer("b", black) },
    titan: null,
    pending: null,
    undo: null,
    status: "playing",
    winner: null,
  };
  state.rules = deriveRules(state);
  return state;
}

/** Deep, structuredClone-based copy so reducers never mutate the input. */
export function cloneMatch(state: MatchState): MatchState {
  return structuredClone(state);
}

/** Build the SkillRules the chess engine reads, from both decks + active effects. */
export function deriveRules(state: MatchState): SkillRules {
  const rules: SkillRules = {};
  for (const color of COLORS) {
    for (const c of state.players[color].deck) {
      if (c.id === "peasant-revolt") rules.peasantRevolt = { ...rules.peasantRevolt, [color]: true };
      else if (c.id === "agile-knight") rules.agileKnight = { ...rules.agileKnight, [color]: true };
      else if (c.id === "chaos") rules.chaos = true;
    }
    const prot = state.players[color].protectedSquare;
    if (prot !== null) rules.protected = [...(rules.protected ?? []), prot];
  }
  return rules;
}

/** Runs when `color`'s turn begins: cooldowns tick, per-turn effects expire. */
export function onTurnStart(state: MatchState, color: Color, events: MatchEvent[]): void {
  const p = state.players[color];
  for (const c of p.deck) if (c.cooldownRemaining > 0) c.cooldownRemaining--;
  p.protectedSquare = null; // 철벽 방어 lasts only until your next turn
  p.lockedFrom = null; // 부활 lock lasts only for the turn it was cast

  if (p.cloakTurnsLeft > 0 && --p.cloakTurnsLeft === 0) {
    events.push({ type: "toast", text: "은폐 종료" });
  }
  if (p.tempQueensTurnsLeft > 0 && --p.tempQueensTurnsLeft === 0) {
    for (const sq of p.tempQueens) {
      const pc = state.chess.board[sq];
      if (pc && pc.color === color && pc.type === "q") state.chess.board[sq] = { color, type: "p" };
    }
    p.tempQueens = [];
    events.push({ type: "toast", text: "해방 종료 — 퀸이 폰으로" });
  }
}

/** Mark the match ended. */
export function endGame(
  state: MatchState,
  events: MatchEvent[],
  winner: Color | "draw",
  reason: string,
): void {
  state.status = "ended";
  state.winner = winner;
  state.endReason = reason;
  events.push({ type: "game-over", winner, reason });
}

/** Detect a natural chess ending (checkmate/stalemate/draw). Death-intercept
 * skills (loyal-vassal, kings-return) hook in here once ported. */
export function checkGameOver(state: MatchState, events: MatchEvent[]): void {
  if (state.status === "ended") return;
  const s = getStatus(state.chess, state.rules);
  if (s === "checkmate") {
    endGame(state, events, opposite(state.chess.turn), "checkmate");
  } else if (s === "stalemate" || s.startsWith("draw")) {
    endGame(state, events, "draw", s);
  }
}
