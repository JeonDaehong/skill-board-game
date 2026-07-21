import { skillById } from "../skills.js";

/**
 * Draft the AI a small deck of movement passives (they auto-apply through the
 * engine's derived rules). Active-skill AI usage is a later phase.
 */
export function draftAiDeck(): string[] {
  const pool = ["chaos", "agile-knight", "peasant-revolt"];
  pool.sort(() => Math.random() - 0.5);
  const deck: string[] = [];
  let cost = 0;
  for (const id of pool) {
    const c = skillById(id)?.cost ?? 99;
    if (cost + c <= 5) {
      deck.push(id);
      cost += c;
    }
  }
  return deck.length ? deck : ["agile-knight"];
}
