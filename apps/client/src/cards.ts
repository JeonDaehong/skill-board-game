import { SUMMON_COST, isPieceCard, pieceCardType, skillMeta } from "@skill/engine";

/**
 * Client-side card helpers that both the collection screens and the in-match UI
 * need. The rules themselves live in @skill/engine; this only reads them.
 */

/** What playing this card costs: its printed cost, or the piece's summon rate. */
export function cardCostOf(cardId: string): number {
  const piece = pieceCardType(cardId);
  if (piece) return SUMMON_COST[piece];
  return skillMeta(cardId)?.cost ?? 0;
}

/** True if the card exists in this build at all. */
export function isKnownCard(cardId: string): boolean {
  return isPieceCard(cardId) ? !!pieceCardType(cardId) : !!skillMeta(cardId);
}

/**
 * Sort order for a hand, a deck tray or a pool: cheapest first, pieces before
 * skills at the same cost, then alphabetical so the order never jitters between
 * repaints.
 */
export function compareCards(a: string, b: string): number {
  const byCost = cardCostOf(a) - cardCostOf(b);
  if (byCost !== 0) return byCost;
  const byKind = Number(isPieceCard(b)) - Number(isPieceCard(a));
  if (byKind !== 0) return byKind;
  return a.localeCompare(b);
}
