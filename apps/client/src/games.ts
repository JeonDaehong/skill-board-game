/** A game shown in the picker carousel. */
export interface GameEntry {
  id: string;
  name: string;
  /** Emoji/glyph shown on the card. */
  icon: string;
  /** Short tagline under the title. */
  tagline: string;
  /** Accent color for the card. */
  color: string;
  /** Playable now? false = 준비중 (locked). */
  playable: boolean;
}

/**
 * The five games. Chess is playable now (plain rules — the card-deck system is
 * being reworked); the other four are 준비중 until their engines are built.
 */
export const GAMES: GameEntry[] = [
  { id: "chess", name: "체스", icon: "♞", tagline: "클래식", color: "#d9b45f", playable: true },
  { id: "omok", name: "오목", icon: "⚫", tagline: "5목 승부", color: "#5a8bd0", playable: true },
  { id: "othello", name: "오셀로", icon: "◑", tagline: "뒤집기", color: "#4caf7d", playable: true },
  { id: "janggi", name: "장기", icon: "將", tagline: "궁성 대결", color: "#d0645a", playable: true },
  { id: "quoridor", name: "쿼리도", icon: "▦", tagline: "벽 미로", color: "#9a6bd0", playable: true },
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
