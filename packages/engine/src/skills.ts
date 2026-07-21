/**
 * Gameplay metadata for skills — the authoritative source both server and
 * client use for deck cost, cooldowns, and turn semantics. Presentation
 * (name/icon/description/art) stays in the client; this is only the numbers
 * that affect rules, so the two sides can never disagree on them.
 */
export type SkillType = "active" | "passive";

export interface SkillMeta {
  id: string;
  cost: number;
  type: SkillType;
  /** Turns before an active may fire again. null = no cooldown. */
  cooldown: number | null;
  /** Uses allowed per game. null = unlimited. */
  usesPerGame: number | null;
  /** For actives: does firing it end the caster's turn? (passives: ignored) */
  consumesTurn?: boolean;
}

export const SKILLS: SkillMeta[] = [
  { id: "retreat", cost: 1, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: true },
  { id: "cross-diagonal", cost: 1, type: "active", cooldown: 5, usesPerGame: null, consumesTurn: true },
  { id: "raid-march", cost: 1, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: false },
  { id: "chaos", cost: 1, type: "passive", cooldown: null, usesPerGame: null },
  { id: "agile-knight", cost: 1, type: "passive", cooldown: null, usesPerGame: null },
  { id: "foresight", cost: 1, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: false },
  { id: "iron-guard", cost: 2, type: "active", cooldown: 5, usesPerGame: null, consumesTurn: false },
  { id: "sacrifice-pact", cost: 2, type: "active", cooldown: 5, usesPerGame: null, consumesTurn: true },
  { id: "phantom", cost: 2, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: true },
  { id: "teleport", cost: 2, type: "active", cooldown: 5, usesPerGame: null, consumesTurn: true },
  { id: "cloak", cost: 2, type: "active", cooldown: null, usesPerGame: 2, consumesTurn: true },
  { id: "loyal-vassal", cost: 2, type: "passive", cooldown: null, usesPerGame: 1 },
  { id: "undo", cost: 3, type: "active", cooldown: 5, usesPerGame: 5, consumesTurn: false },
  { id: "one-more", cost: 3, type: "active", cooldown: 5, usesPerGame: 5, consumesTurn: false },
  { id: "revive-gamble", cost: 3, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: false },
  { id: "evolve-gamble", cost: 3, type: "active", cooldown: 3, usesPerGame: null, consumesTurn: true },
  { id: "peasant-revolt", cost: 4, type: "passive", cooldown: null, usesPerGame: null },
  { id: "kings-return", cost: 4, type: "passive", cooldown: null, usesPerGame: 1 },
  { id: "titan-fusion", cost: 4, type: "active", cooldown: null, usesPerGame: 1, consumesTurn: true },
  { id: "liberation", cost: 5, type: "active", cooldown: null, usesPerGame: 1, consumesTurn: true },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillMeta(id: string): SkillMeta | undefined {
  return BY_ID.get(id);
}

export const MAX_DECK_COST = 5;

/** True if a deck of skill ids is within the cost budget and all ids exist. */
export function isLegalDeck(ids: string[]): boolean {
  let cost = 0;
  for (const id of ids) {
    const m = skillMeta(id);
    if (!m) return false;
    cost += m.cost;
  }
  return cost <= MAX_DECK_COST;
}
