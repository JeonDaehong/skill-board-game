import { MASTER_DIMS, STANDARD_DIMS, type Dims } from "@skill/chess-core";

/**
 * The three ways chess is played here.
 *
 *  classic — ordinary chess. No deck, no cost, no cards at all.
 *  skill   — ordinary chess plus a 30-card skill deck.
 *  master  — 10x10, opening with a king and two pawns; a 50-card deck of
 *            piece cards and skill cards builds the army as the game runs.
 */
export type GameMode = "classic" | "skill" | "master";

export const GAME_MODES: GameMode[] = ["classic", "skill", "master"];

export interface ModeRules {
  mode: GameMode;
  /** Board extent. */
  dims: Dims;
  /** Exact number of cards a legal deck holds. 0 = this mode uses no deck. */
  deckSize: number;
  /** May the deck hold piece cards (and may they be summoned mid-game)? */
  pieceCards: boolean;
  /** Cards held in hand before the draw step forces a choice. */
  handCap: number;
  /** Cost the pool can bank. */
  costCap: number;
  /** Cost gained at the start of each of your turns. */
  costPerTurn: number;
  /** Cards drawn at the start of a match. */
  openingHand: number;
}

const COST_CAP = 10;
const COST_PER_TURN = 1;
const HAND_CAP = 5;
/**
 * One under the cap, so the first turn's draw fills the hand instead of
 * opening every single game with a "your hand is full" prompt.
 */
const OPENING_HAND = HAND_CAP - 1;

export const MODE_RULES: Record<GameMode, ModeRules> = {
  classic: {
    mode: "classic",
    dims: STANDARD_DIMS,
    deckSize: 0,
    pieceCards: false,
    handCap: 0,
    costCap: 0,
    costPerTurn: 0,
    openingHand: 0,
  },
  skill: {
    mode: "skill",
    dims: STANDARD_DIMS,
    deckSize: 30,
    pieceCards: false,
    handCap: HAND_CAP,
    costCap: COST_CAP,
    costPerTurn: COST_PER_TURN,
    openingHand: OPENING_HAND,
  },
  master: {
    mode: "master",
    dims: MASTER_DIMS,
    deckSize: 50,
    pieceCards: true,
    handCap: HAND_CAP,
    costCap: COST_CAP,
    costPerTurn: COST_PER_TURN,
    openingHand: OPENING_HAND,
  },
};

export function modeRules(mode: GameMode): ModeRules {
  return MODE_RULES[mode];
}

/** Does this mode play with cards at all? */
export function usesCards(mode: GameMode): boolean {
  return MODE_RULES[mode].deckSize > 0;
}
