import { SKILLS as SKILL_META, skillMeta, type SkillMeta, type SkillSpeed } from "@skill/engine";

/**
 * Presentation for skill cards. The numbers that decide anything — cost, type,
 * speed, trigger — live in @skill/engine so the client and the server can never
 * disagree about them; this file only adds what is on the face of the card.
 *
 * Names and rules text come from i18n.ts (`skillName` / `skillDesc`), so the
 * only thing left here is the glyph each card falls back to before its painted
 * art has loaded.
 */
export interface Skill extends SkillMeta {
  /** Fallback glyph, used wherever the art is missing or too small to read. */
  icon: string;
}

const ICONS: Record<string, string> = {
  // 1 cost
  scout: "👁", spy: "🕵", divination: "🔮", meditate: "🧘", offering: "🕯",
  disguise: "🎭", readiness: "⚡", bait: "🪤", "small-sandbag": "🧱", vigilance: "👂",
  // 2 cost
  dash: "💨", shove: "👊", pull: "🪝", leap: "🦘", swamp: "🌿", "small-shield": "🛡",
  // 3 cost
  clairvoyance: "🔭", herald: "📯", javelin: "🗡", citadel: "🏰",
  "large-sandbag": "🪨", beacon: "🔥", insight: "💡", ward: "✋",
  // 4 cost
  cleanse: "💧", unbind: "🔓", recall: "↩", coerce: "⛓", transpose: "⇄",
  "guard-drill": "🎖", disarm: "🚫", mine: "💣", hallucination: "🌀",
  espionage: "🎲", evade: "🌪", sever: "✂",
  // 5 cost
  double: "⏩", "blood-price": "🩸", promotion: "⬆", "double-image": "👥",
  "kings-strike": "👑", rewind: "⟲", thrift: "🪙", riposte: "🔁", "last-stand": "🏃",
  // 6 cost
  shatter: "💥", exchange: "🔄", awaken: "♛", brainwash: "🧠",
  "bond-chain": "🤝", "fate-chain": "☠", "agile-knight": "♘",
  "muddy-water": "🌊", bodyguard: "🦺",
  // 7 cost
  pandemonium: "🌪", assassinate: "🗡", regicide: "♕", sanctuary: "⛪", plague: "☣",
  // 8 cost
  "purifying-light": "✨", typhoon: "🌀", earthquake: "🌋", "gambling-den": "🎰",
};

export const SKILLS: Skill[] = SKILL_META.map((m) => ({ ...m, icon: ICONS[m.id] ?? "◈" }));

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): Skill | undefined {
  return BY_ID.get(id);
}

/** The glyph for a card id, whether or not it is a known skill. */
export function skillIcon(id: string): string {
  return ICONS[id] ?? "◈";
}

/** True if this card is answered on the opponent's turn rather than your own. */
export function isCounter(id: string): boolean {
  return skillMeta(id)?.speed === "counter";
}

export type { SkillSpeed };
