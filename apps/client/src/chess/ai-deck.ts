import {
  MAX_COPIES_SKILL,
  SKILLS,
  modeRules,
  pieceCardId,
  type GameMode,
} from "@skill/engine";
import type { PieceType } from "@skill/chess-core";

/**
 * Build the AI a legal deck for the mode it is about to play. Unlike a player
 * the AI has no collection to spend from, so it simply gets a sound list.
 *
 * The master-mode army is shaped like a chess set scaled up — mostly pawns,
 * a couple of queens — because that is the material curve the position wants,
 * and it keeps the AI from drawing three queens it cannot afford in the opening.
 */
export function draftAiDeck(mode: GameMode): string[] {
  const cfg = modeRules(mode);
  if (cfg.deckSize === 0) return [];

  const deck: string[] = [];
  if (cfg.pieceCards) {
    const army: ReadonlyArray<readonly [PieceType, number]> = [
      ["p", 14],
      ["n", 5],
      ["b", 5],
      ["r", 4],
      ["q", 2],
    ];
    for (const [type, count] of army) {
      for (let i = 0; i < count; i++) deck.push(pieceCardId(type));
    }
  }

  // Fill the rest with skills, cheapest first so the AI has something it can
  // actually pay for in the opening, three copies at a time.
  const byCost = [...SKILLS].sort((a, b) => a.cost - b.cost);
  let copy = 0;
  while (deck.length < cfg.deckSize && copy < MAX_COPIES_SKILL) {
    for (const skill of byCost) {
      if (deck.length >= cfg.deckSize) break;
      deck.push(skill.id);
    }
    copy++;
  }

  // A pool smaller than the deck size would leave it short; pad with the
  // cheapest card, which is always legal at three copies of several ids.
  while (deck.length < cfg.deckSize) deck.push(byCost[0]!.id);
  return deck.slice(0, cfg.deckSize);
}
