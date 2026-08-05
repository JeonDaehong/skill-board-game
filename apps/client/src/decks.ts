import { checkDeck, modeRules, maxCopies, type GameMode } from "@skill/engine";
import { ownedCount } from "./economy.js";

/**
 * Saved decks, one per mode.
 *
 * Classic mode has no deck at all. Skill mode holds 30 skill cards; master mode
 * holds 50 cards mixing piece and skill cards. The two are stored separately —
 * building one never disturbs the other.
 *
 * A deck is kept as `cardId → copies` rather than a flat list: it is what the
 * builder actually edits, it is compact in storage, and the flat list the
 * engine wants is one expansion away.
 */
export type DeckMap = Record<string, number>;

const key = (mode: GameMode) => `skill-board:deck:v3:${mode}`;

/** Modes that actually have a deck to build. */
export const DECK_MODES: GameMode[] = ["skill", "master"];

export function loadDeck(mode: GameMode): DeckMap {
  try {
    const raw = localStorage.getItem(key(mode));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DeckMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) continue;
      // Clamp on read: the card pool, the copy limits and the player's own
      // collection can all have shrunk since this deck was saved.
      const allowed = maxAllowed(mode, id);
      if (allowed > 0) out[id] = Math.min(Math.floor(n), allowed);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDeck(mode: GameMode, deck: DeckMap): void {
  try {
    localStorage.setItem(key(mode), JSON.stringify(deck));
  } catch {
    /* private mode: the deck just does not persist */
  }
}

/** Total cards in a deck. */
export function deckTotal(deck: DeckMap): number {
  let n = 0;
  for (const v of Object.values(deck)) n += v;
  return n;
}

/** The flat card list the engine and the server want. */
export function deckList(deck: DeckMap): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(deck)) {
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/**
 * How many copies of `cardId` this deck may hold: the card's own limit (3 for a
 * skill, 50 for a piece), but never more than the player actually owns. You
 * cannot field cards you do not have.
 */
export function maxAllowed(mode: GameMode, cardId: string): number {
  const cfg = modeRules(mode);
  if (cfg.deckSize === 0) return 0;
  const res = checkDeck(mode, [cardId], true);
  if (!res.ok) return 0; // wrong kind of card for this mode, or unknown
  return Math.min(maxCopies(cardId), ownedCount(cardId));
}

/** Is this deck complete and legal enough to start a match with? */
export function deckReady(mode: GameMode, deck: DeckMap): boolean {
  if (modeRules(mode).deckSize === 0) return true; // classic needs nothing
  for (const [id, n] of Object.entries(deck)) {
    if (n > maxAllowed(mode, id)) return false;
  }
  return checkDeck(mode, deckList(deck)).ok;
}

/** The deck to send into a match for `mode` — empty for classic. */
export function deckForMatch(mode: GameMode): string[] {
  if (modeRules(mode).deckSize === 0) return [];
  return deckList(loadDeck(mode));
}

/**
 * Every mode's deck at once. Joining a room needs this: the room already chose
 * the mode, and a code-based join has not seen the room list to learn which.
 */
export function allDecksForMatch(): Record<GameMode, string[]> {
  return {
    classic: [],
    skill: deckForMatch("skill"),
    master: deckForMatch("master"),
  };
}
