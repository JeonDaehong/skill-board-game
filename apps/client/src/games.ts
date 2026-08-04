/** A game shown in the picker carousel. */
export interface GameEntry {
  id: string;
  name: string;
  /** Short tagline under the title. */
  tagline: string;
  /** Accent color for the card. */
  color: string;
  /** Playable now? false = coming soon (locked). */
  playable: boolean;
}

/**
 * The three games we ship. Only chess is released: janggi and gomoku are shown
 * as coming-soon so the roadmap is visible, and their engines (packages/games)
 * stay wired up behind the flag so flipping `playable` is the whole launch.
 * Rules are plain for now — the card-deck system is still being reworked.
 * (Othello / Quoridor engines live in @skill/games and can be re-added here
 * once they earn a slot.)
 */
export const GAMES: GameEntry[] = [
  { id: "chess", name: "Chess", tagline: "Classic", color: "#d9b45f", playable: true },
  { id: "janggi", name: "Janggi", tagline: "Korean chess", color: "#d0645a", playable: false },
  { id: "omok", name: "Gomoku", tagline: "Five in a row", color: "#5a8bd0", playable: false },
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
