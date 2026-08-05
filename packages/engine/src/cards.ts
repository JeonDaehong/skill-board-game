import type { PieceType } from "@skill/chess-core";

/**
 * A deck holds two kinds of card, and both are identified by a plain string so
 * a deck list stays `string[]` — trivially serializable for storage, the wire,
 * and the reducer's state.
 *
 *   skill card  →  the skill's own id, e.g. "teleport"
 *   piece card  →  "piece:" + the piece letter, e.g. "piece:n"
 *
 * Skill ids never contain a colon, so the prefix is unambiguous.
 */
export const PIECE_CARD_PREFIX = "piece:";

/** Piece types that can be printed on a card. Kings are never summoned. */
export const SUMMONABLE: PieceType[] = ["p", "n", "b", "r", "q"];

export function pieceCardId(type: PieceType): string {
  return `${PIECE_CARD_PREFIX}${type}`;
}

export function isPieceCard(cardId: string): boolean {
  return cardId.startsWith(PIECE_CARD_PREFIX);
}

/** The piece a card summons, or null if it is not a piece card. */
export function pieceCardType(cardId: string): PieceType | null {
  if (!isPieceCard(cardId)) return null;
  const t = cardId.slice(PIECE_CARD_PREFIX.length) as PieceType;
  return SUMMONABLE.includes(t) ? t : null;
}

/**
 * Summoning cost, by piece. It tracks the classical value table (1/3/3/5/9)
 * compressed into the 10-cost pool, so a queen is a whole bank of saved-up
 * cost while a pawn is small change.
 */
export const SUMMON_COST: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 4,
  q: 7,
  k: 0, // never summoned; present so the record is total
};

/** How many copies of one card a deck may hold. */
export const MAX_COPIES_SKILL = 3;
export const MAX_COPIES_PIECE = 50;

export function maxCopies(cardId: string): number {
  return isPieceCard(cardId) ? MAX_COPIES_PIECE : MAX_COPIES_SKILL;
}
