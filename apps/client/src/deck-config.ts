/** Per-game deck-building rules. Card effects are 구현 예정; these constrain
 *  how many cards a deck holds, the in-play hand size, and the time control. */
export interface DeckConfig {
  gameId: string;
  name: string;
  icon: string;
  /** 들고 갈 수 있는 카드 수 (deck size). */
  deckSize: number;
  /** 들고 있을 수 있는 카드 수 (hand size). */
  handSize: number;
  /** 부여된 전체 시간 (분). */
  totalMinutes: number;
  /** 전체 시간을 다 쓰면 적용되는 턴당 초읽기 (초). */
  byoyomiSeconds: number;
  /** 구현 예정 카드 풀 크기. */
  poolSize: number;
}

export const DECK_CONFIGS: DeckConfig[] = [
  { gameId: "omok", name: "오목", icon: "⚫", deckSize: 10, handSize: 2, totalMinutes: 5, byoyomiSeconds: 5, poolSize: 40 },
  { gameId: "othello", name: "오셀로", icon: "◑", deckSize: 10, handSize: 2, totalMinutes: 5, byoyomiSeconds: 5, poolSize: 40 },
  { gameId: "chess", name: "체스", icon: "♞", deckSize: 25, handSize: 3, totalMinutes: 10, byoyomiSeconds: 10, poolSize: 100 },
  { gameId: "janggi", name: "장기", icon: "將", deckSize: 25, handSize: 3, totalMinutes: 10, byoyomiSeconds: 10, poolSize: 100 },
  { gameId: "quoridor", name: "쿼리도", icon: "▦", deckSize: 10, handSize: 2, totalMinutes: 5, byoyomiSeconds: 15, poolSize: 40 },
];

export function deckConfig(gameId: string): DeckConfig | undefined {
  return DECK_CONFIGS.find((c) => c.gameId === gameId);
}
