import { MAX_COPIES_PIECE, MAX_COPIES_SKILL, isPieceCard, pieceCardType } from "./cards.js";
import { modeRules, type GameMode } from "./modes.js";
import { skillMeta } from "./skills.js";

/**
 * Deck legality, shared by the deck builder, the server and the match setup so
 * none of them can disagree about what a deck is.
 *
 *   classic — no deck at all.
 *   skill   — exactly 30 skill cards, at most 3 of any one card.
 *   master  — exactly 50 cards mixing piece and skill cards; up to 50 copies of
 *             a piece card, still at most 3 of any one skill.
 */
export type DeckError =
  | { code: "wrong-size"; have: number; want: number }
  | { code: "unknown-card"; card: string }
  | { code: "no-piece-cards"; card: string }
  | { code: "too-many-copies"; card: string; have: number; max: number };

export type DeckCheck = { ok: true } | { ok: false; errors: DeckError[] };

/** Count copies of each card id. */
export function tally(cards: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c, (counts.get(c) ?? 0) + 1);
  return counts;
}

/**
 * Check a finished deck. `partial` skips the size check, which is what the
 * deck builder wants while a deck is still being assembled — everything else
 * (unknown cards, copy limits, piece cards in a mode that has none) is a
 * mistake at any size.
 */
export function checkDeck(mode: GameMode, cards: string[], partial = false): DeckCheck {
  const cfg = modeRules(mode);
  const errors: DeckError[] = [];

  if (!partial && cards.length !== cfg.deckSize) {
    errors.push({ code: "wrong-size", have: cards.length, want: cfg.deckSize });
  }

  for (const [card, have] of tally(cards)) {
    if (isPieceCard(card)) {
      if (!pieceCardType(card)) {
        errors.push({ code: "unknown-card", card });
        continue;
      }
      if (!cfg.pieceCards) {
        errors.push({ code: "no-piece-cards", card });
        continue;
      }
      if (have > MAX_COPIES_PIECE) {
        errors.push({ code: "too-many-copies", card, have, max: MAX_COPIES_PIECE });
      }
    } else {
      if (!skillMeta(card)) {
        errors.push({ code: "unknown-card", card });
        continue;
      }
      if (cfg.deckSize === 0) {
        errors.push({ code: "no-piece-cards", card });
        continue;
      }
      if (have > MAX_COPIES_SKILL) {
        errors.push({ code: "too-many-copies", card, have, max: MAX_COPIES_SKILL });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function isLegalDeck(mode: GameMode, cards: string[]): boolean {
  return checkDeck(mode, cards).ok;
}

/** A one-line reason, for the server's error message and the builder's tooltip. */
export function describeDeckError(e: DeckError): string {
  switch (e.code) {
    case "wrong-size":
      return `deck must hold exactly ${e.want} cards (has ${e.have})`;
    case "unknown-card":
      return `unknown card: ${e.card}`;
    case "no-piece-cards":
      return `this mode cannot use the card: ${e.card}`;
    case "too-many-copies":
      return `${e.card}: ${e.have} copies, limit is ${e.max}`;
  }
}
