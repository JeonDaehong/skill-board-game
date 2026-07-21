import type { Color, SkillRules } from "@skill/chess-core";
import { skillById, type Skill } from "../skills.js";

/** Live per-card state during a match. */
export interface SkillCardState {
  skill: Skill;
  /** Turns remaining before this active can be used again (0 = ready). */
  cooldownRemaining: number;
  /** Uses left this game, or null for unlimited. */
  usesLeft: number | null;
}

/**
 * Tracks one side's drafted skills during a match: cooldowns, per-game uses,
 * and which passives are active. Both the human and (eventually) the AI get a
 * runtime; their passive rules merge into the single SkillRules the engine
 * reads. Effect logic for actives lands skill-by-skill; this is the loop that
 * governs *when* a card may fire.
 */
export class SkillRuntime {
  readonly cards: SkillCardState[];

  constructor(skillIds: string[], readonly owner: Color) {
    this.cards = skillIds
      .map((id) => skillById(id))
      .filter((s): s is Skill => !!s)
      .map((skill) => ({
        skill,
        cooldownRemaining: 0,
        usesLeft: skill.usesPerGame,
      }));
  }

  /** Rule modifications from always-on passives this side has drafted. */
  passiveRules(): SkillRules {
    const rules: SkillRules = {};
    for (const c of this.cards) {
      if (c.skill.type !== "passive") continue;
      if (c.skill.id === "peasant-revolt") {
        rules.peasantRevolt = { ...rules.peasantRevolt, [this.owner]: true };
      } else if (c.skill.id === "agile-knight") {
        rules.agileKnight = { ...rules.agileKnight, [this.owner]: true };
      } else if (c.skill.id === "chaos") {
        rules.chaos = true;
      }
      // Other passives get wired here as they're implemented.
    }
    return rules;
  }

  /** Can this active card be fired right now (ignoring effect-specific conditions)? */
  canActivate(c: SkillCardState): boolean {
    if (c.skill.type !== "active") return false;
    if (c.cooldownRemaining > 0) return false;
    if (c.usesLeft !== null && c.usesLeft <= 0) return false;
    return true;
  }

  /** Tick cooldowns down — call at the start of this owner's turn. */
  tickCooldowns(): void {
    for (const c of this.cards) {
      if (c.cooldownRemaining > 0) c.cooldownRemaining--;
    }
  }

  /** Record that an active fired: start its cooldown and spend a use. */
  markUsed(c: SkillCardState): void {
    if (c.skill.cooldown) c.cooldownRemaining = c.skill.cooldown;
    if (c.usesLeft !== null) c.usesLeft--;
  }
}

/** Merge the passive rules of several runtimes into one SkillRules object. */
export function mergeRules(runtimes: SkillRuntime[]): SkillRules {
  const merged: SkillRules = {};
  for (const rt of runtimes) {
    const r = rt.passiveRules();
    if (r.peasantRevolt) {
      merged.peasantRevolt = { ...merged.peasantRevolt, ...r.peasantRevolt };
    }
    if (r.agileKnight) {
      merged.agileKnight = { ...merged.agileKnight, ...r.agileKnight };
    }
    if (r.chaos) merged.chaos = true;
  }
  return merged;
}
