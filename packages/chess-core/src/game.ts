import { initialState, opposite } from "./board.js";
import {
  applyMove,
  generateLegalMoves,
  isInCheck,
} from "./moves.js";
import type {
  Color,
  GameState,
  GameStatus,
  Move,
  PieceType,
  SkillRules,
  Square,
} from "./types.js";

/** Determine insufficient-material draws (K vs K, K+minor vs K, etc.). */
function isInsufficientMaterial(state: GameState): boolean {
  const minors: { color: Color; type: PieceType }[] = [];
  for (const p of state.board) {
    if (!p) continue;
    if (p.type === "p" || p.type === "r" || p.type === "q") return false;
    if (p.type === "b" || p.type === "n") minors.push(p);
  }
  // Kings only, or a single minor piece: cannot force mate.
  if (minors.length <= 1) return true;
  // Two knights or bishop+knight can technically not force mate in the
  // simplest bare cases, but the strictly guaranteed draws are K vs K and
  // K+minor vs K; keep it conservative here.
  return false;
}

/** Compute the status of a position for the side to move. */
export function getStatus(state: GameState, rules?: SkillRules): GameStatus {
  // In master mode a bare board is not a dead position — either side can still
  // summon a queen out of its deck — so the material draw is switched off.
  if (!rules?.summonable && isInsufficientMaterial(state)) {
    return "draw-insufficient-material";
  }

  const legal = generateLegalMoves(state, undefined, rules);
  const inCheck = isInCheck(state, state.turn, rules);

  if (legal.length === 0) {
    return inCheck ? "checkmate" : "stalemate";
  }
  if (state.halfmoveClock >= 100) return "draw-fifty-move";
  return inCheck ? "check" : "playing";
}

/**
 * A thin, mutable wrapper over GameState that tracks history so the UI and
 * networking layers have one clear object to talk to. All rule logic lives in
 * the pure functions; this just orchestrates them.
 */
export class ChessGame {
  private state: GameState;
  private history: Move[] = [];
  /** Active skill rule modifications (mutable — actives can toggle these). */
  rules: SkillRules;

  constructor(state: GameState = initialState(), rules: SkillRules = {}) {
    this.state = state;
    this.rules = rules;
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * Replace the current position. Used by skill effects that change the board
   * outside the normal move rules (teleport, sacrifice, revive…). The caller is
   * responsible for producing a consistent state (turn, clocks, en passant).
   */
  setState(state: GameState): void {
    this.state = state;
  }

  getTurn(): Color {
    return this.state.turn;
  }

  getHistory(): readonly Move[] {
    return this.history;
  }

  getStatus(): GameStatus {
    return getStatus(this.state, this.rules);
  }

  isGameOver(): boolean {
    const s = this.getStatus();
    return (
      s === "checkmate" ||
      s === "stalemate" ||
      s === "draw-fifty-move" ||
      s === "draw-insufficient-material"
    );
  }

  /** Winner if checkmate, else null. */
  getWinner(): Color | null {
    return this.getStatus() === "checkmate" ? opposite(this.state.turn) : null;
  }

  legalMoves(from?: Square): Move[] {
    return generateLegalMoves(this.state, from, this.rules);
  }

  /** Destination squares reachable from `from` (for UI highlighting). */
  legalTargets(from: Square): Square[] {
    return this.legalMoves(from).map((m) => m.to);
  }

  /**
   * Attempt a move from `from` to `to`. `promotion` picks the promotion piece
   * when relevant (defaults to queen). Returns the applied Move or null if
   * illegal.
   */
  move(from: Square, to: Square, promotion: PieceType = "q"): Move | null {
    const candidates = this.legalMoves(from).filter((m) => m.to === to);
    if (candidates.length === 0) return null;

    const chosen =
      candidates.find((m) => !m.promotion || m.promotion === promotion) ??
      candidates[0]!;

    this.state = applyMove(this.state, chosen);
    this.history.push(chosen);
    return chosen;
  }
}
