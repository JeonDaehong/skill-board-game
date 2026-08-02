/** Per-game deck-building rules. Card effects are not implemented yet; these
 *  constrain how many cards a deck holds, the in-play hand size, and the clock. */
export interface DeckConfig {
  gameId: string;
  name: string;
  /** How many cards a deck may hold. */
  deckSize: number;
  /** How many cards may be held in hand during play. */
  handSize: number;
  /** Main clock, in minutes. */
  totalMinutes: number;
  /** Per-turn byoyomi once the main clock runs out, in seconds. */
  byoyomiSeconds: number;
  /** How many copies of the same card one deck may hold. */
  maxCopies: number;
}

export const DECK_CONFIGS: DeckConfig[] = [
  { gameId: "chess", name: "Chess", deckSize: 25, handSize: 3, totalMinutes: 10, byoyomiSeconds: 10, maxCopies: 3 },
  { gameId: "janggi", name: "Janggi", deckSize: 25, handSize: 3, totalMinutes: 10, byoyomiSeconds: 10, maxCopies: 3 },
  { gameId: "omok", name: "Gomoku", deckSize: 10, handSize: 2, totalMinutes: 5, byoyomiSeconds: 5, maxCopies: 2 },
];

export function deckConfig(gameId: string): DeckConfig | undefined {
  return DECK_CONFIGS.find((c) => c.gameId === gameId);
}
