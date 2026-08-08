/**
 * The card table — gameplay metadata for every skill card, and the authority
 * both server and client read for cost and turn semantics. Presentation (name,
 * rules text, art, icon) stays in the client; this file is only the numbers and
 * shapes that decide anything, so the two sides can never disagree on them.
 *
 * The list mirrors docs/skill.md. Scarcity comes from the deck: a card is
 * drawn, paid for, played and discarded, and you only ever get as many copies
 * as you put in.
 */

import type { PieceType } from "@skill/chess-core";

/**
 * When a card may be played — the rule that shapes a turn.
 *
 *   normal  (일반·부여·지속) — playing it uses up your piece move for the turn.
 *   quick   (속공)           — play it and still move a piece afterwards.
 *   counter (대응)           — held in hand and played on the *opponent's*
 *                              turn, in response to the trigger it names.
 */
export type SkillSpeed = "normal" | "quick" | "counter";

/**
 * What playing the card leaves behind.
 *
 *   active  (일반·속공·대응) — resolves once and goes to the discard pile.
 *   enchant (부여)          — attaches to a piece, a square or a player until
 *                             it is dispelled or its clock runs out.
 *   lasting (지속)          — installs a standing rule that stays until the
 *                             card itself is destroyed.
 *
 * Enchants and lasting cards differ in what removes them, which is why they are
 * not one kind: 해주/해금/정화의 빛 clear enchants, 파괴/태풍 destroy lasting
 * cards, and neither touches the other.
 */
export type SkillType = "active" | "enchant" | "lasting";

/** The opponent actions a counter card can be held up against. */
export type CounterTrigger =
  /** They moved a piece. */
  | "move"
  /** They captured one of your pieces. */
  | "capture"
  /** They played a skill card (including another counter). */
  | "skill"
  /** They summoned a piece from their deck (master mode). */
  | "summon"
  /** Their action put your king in check. */
  | "check"
  /** Their action would checkmate your king. */
  | "checkmate"
  /** One of your pieces is about to be hit by terrain — a swamp, a mine. */
  | "terrain"
  /** They aimed an enchant at one of your pieces. */
  | "enchant";

/**
 * What a card asks the player to point at before it resolves.
 *
 * Sixty-three cards cannot each carry their own action type and their own
 * targeting flow in the client — that was what made the twenty-card prototype
 * unscalable. Instead every card declares the shape of what it needs, the
 * reducer collects the picks one at a time, and the client drives a single
 * generic flow off the same declaration.
 */
export type TargetKind =
  /** A square holding one of your pieces. */
  | "own-piece"
  /** A square holding an enemy piece. */
  | "enemy-piece"
  /** An empty square. */
  | "empty"
  /** An index into your own hand. */
  | "own-hand"
  /** An index into the opponent's hand (picked blind unless revealed). */
  | "opp-hand"
  /** An index into your discard pile — destroyed and spent cards both live there. */
  | "discard"
  /** A lasting card in play, either side's. */
  | "lasting"
  /** One of a fixed set of answers, e.g. which piece a pawn promotes into. */
  | "choice";

export interface TargetSpec {
  /** The kinds this step accepts. More than one where a card offers a choice
   *  of target *type* — 파괴 takes either a lasting card or a card in hand. */
  kinds: TargetKind[];
  /** Fewest picks that make the card legal to play. */
  min: number;
  /** Most picks this step accepts. */
  max: number;
  /** Piece types this step will accept, when it is narrower than the kind. */
  pieces?: PieceType[];
  /** Whether a king may be picked. Kings are off-limits unless said otherwise. */
  king?: boolean;
  /** For `choice`: the answers offered, as ids the handler understands. */
  options?: string[];
}

export interface SkillMeta {
  id: string;
  cost: number;
  type: SkillType;
  speed: SkillSpeed;
  /** Counter cards only: the opponent action that opens this card's window. */
  trigger?: CounterTrigger;
  /**
   * Picks the card needs, in the order it asks for them.
   *
   * Counter cards leave this empty even where the card reads as a choice: a
   * counter resolves inside the window it was played into, and the targeting
   * flow it would need runs on the *other* player's turn. Declaring a target the
   * reducer then never collects is worse than not declaring one — 보디가드 and
   * 최후의 저항 each spent a release picking their own answer while the table
   * claimed the player would be asked. They resolve on their own rules instead.
   */
  targets?: TargetSpec[];
}

// Shorthands. The table below is read far more often than it is written, and
// these keep one card on one line where the shape allows it.
const one = (kind: TargetKind, extra: Partial<TargetSpec> = {}): TargetSpec =>
  ({ kinds: [kind], min: 1, max: 1, ...extra });
const upTo = (kind: TargetKind, max: number, extra: Partial<TargetSpec> = {}): TargetSpec =>
  ({ kinds: [kind], min: 0, max, ...extra });
const exactly = (kind: TargetKind, n: number, extra: Partial<TargetSpec> = {}): TargetSpec =>
  ({ kinds: [kind], min: n, max: n, ...extra });

const PAWN: PieceType[] = ["p"];
/** Everything a card may kill or crown: no king, no queen. */
const MINOR: PieceType[] = ["p", "n", "b", "r"];
/** What 희생의 대가 may spend — "킹·폰을 제외한 내 기물". */
const OFFICER: PieceType[] = ["n", "b", "r", "q"];

/**
 * The sixty-three cards, grouped by cost the way docs/skill.md lists them.
 * Costs run 1–8; the cost pool caps at 10 and refills by 1 a turn, so an 8-cost
 * card is most of a game's savings and should read that way.
 */
export const SKILLS: SkillMeta[] = [
  // ── 1 cost ────────────────────────────────────────────────
  { id: "scout", cost: 1, type: "active", speed: "quick", targets: [one("opp-hand")] },
  { id: "spy", cost: 1, type: "active", speed: "quick" },
  { id: "divination", cost: 1, type: "active", speed: "quick" },
  { id: "meditate", cost: 1, type: "active", speed: "quick" },
  { id: "offering", cost: 1, type: "active", speed: "quick", targets: [one("own-hand")] },
  { id: "disguise", cost: 1, type: "active", speed: "quick", targets: [upTo("own-hand", 2)] },
  { id: "readiness", cost: 1, type: "active", speed: "quick" },
  { id: "bait", cost: 1, type: "enchant", speed: "normal", targets: [one("own-piece", { pieces: PAWN })] },
  { id: "small-sandbag", cost: 1, type: "enchant", speed: "normal", targets: [one("enemy-piece")] },
  { id: "vigilance", cost: 1, type: "active", speed: "counter", trigger: "skill" },

  // ── 2 cost ────────────────────────────────────────────────
  { id: "dash", cost: 2, type: "active", speed: "quick", targets: [one("own-piece", { king: true }), one("empty")] },
  { id: "shove", cost: 2, type: "active", speed: "normal", targets: [one("own-piece", { king: true }), one("enemy-piece", { king: true })] },
  { id: "pull", cost: 2, type: "active", speed: "normal", targets: [one("own-piece", { king: true }), one("enemy-piece", { king: true })] },
  { id: "leap", cost: 2, type: "enchant", speed: "normal", targets: [one("own-piece", { pieces: PAWN })] },
  { id: "swamp", cost: 2, type: "lasting", speed: "normal", targets: [one("empty")] },
  { id: "small-shield", cost: 2, type: "active", speed: "counter", trigger: "capture" },

  // ── 3 cost ────────────────────────────────────────────────
  { id: "clairvoyance", cost: 3, type: "active", speed: "quick" },
  { id: "herald", cost: 3, type: "active", speed: "quick", targets: [one("discard")] },
  { id: "javelin", cost: 3, type: "active", speed: "normal", targets: [one("own-piece", { pieces: PAWN }), one("enemy-piece")] },
  { id: "citadel", cost: 3, type: "active", speed: "normal", targets: [one("choice", { options: ["king-side", "queen-side"] })] },
  { id: "large-sandbag", cost: 3, type: "enchant", speed: "normal", targets: [one("enemy-piece")] },
  { id: "beacon", cost: 3, type: "lasting", speed: "normal" },
  { id: "insight", cost: 3, type: "active", speed: "counter", trigger: "skill" },
  { id: "ward", cost: 3, type: "active", speed: "counter", trigger: "terrain" },

  // ── 4 cost ────────────────────────────────────────────────
  { id: "cleanse", cost: 4, type: "active", speed: "quick", targets: [one("own-piece", { king: true })] },
  { id: "unbind", cost: 4, type: "active", speed: "quick", targets: [one("enemy-piece", { king: true })] },
  { id: "recall", cost: 4, type: "active", speed: "quick", targets: [one("discard")] },
  { id: "coerce", cost: 4, type: "active", speed: "quick", targets: [exactly("opp-hand", 2)] },
  { id: "transpose", cost: 4, type: "active", speed: "normal", targets: [one("own-piece"), one("own-piece")] },
  { id: "guard-drill", cost: 4, type: "enchant", speed: "normal", targets: [one("own-piece", { pieces: PAWN })] },
  { id: "disarm", cost: 4, type: "enchant", speed: "normal", targets: [one("enemy-piece", { king: true })] },
  { id: "mine", cost: 4, type: "enchant", speed: "normal", targets: [one("empty")] },
  { id: "hallucination", cost: 4, type: "lasting", speed: "normal" },
  { id: "espionage", cost: 4, type: "lasting", speed: "normal" },
  { id: "evade", cost: 4, type: "active", speed: "counter", trigger: "capture" },
  { id: "sever", cost: 4, type: "active", speed: "counter", trigger: "enchant" },

  // ── 5 cost ────────────────────────────────────────────────
  { id: "double", cost: 5, type: "active", speed: "quick", targets: [one("own-piece", { king: true })] },
  { id: "blood-price", cost: 5, type: "active", speed: "quick", targets: [one("own-piece", { pieces: OFFICER })] },
  { id: "promotion", cost: 5, type: "active", speed: "normal", targets: [one("own-piece", { pieces: PAWN }), one("choice", { options: ["n", "b", "r"] })] },
  { id: "double-image", cost: 5, type: "active", speed: "normal", targets: [one("own-piece"), one("empty")] },
  { id: "kings-strike", cost: 5, type: "active", speed: "normal", targets: [one("enemy-piece")] },
  { id: "rewind", cost: 5, type: "active", speed: "normal" },
  { id: "thrift", cost: 5, type: "lasting", speed: "normal" },
  { id: "riposte", cost: 5, type: "active", speed: "counter", trigger: "skill" },
  { id: "last-stand", cost: 5, type: "active", speed: "counter", trigger: "checkmate" },

  // ── 6 cost ────────────────────────────────────────────────
  { id: "shatter", cost: 6, type: "active", speed: "quick", targets: [{ kinds: ["lasting", "opp-hand"], min: 1, max: 1 }] },
  { id: "exchange", cost: 6, type: "active", speed: "quick", targets: [one("own-hand"), one("opp-hand")] },
  { id: "awaken", cost: 6, type: "active", speed: "normal", targets: [one("own-piece", { pieces: MINOR })] },
  { id: "brainwash", cost: 6, type: "enchant", speed: "normal", targets: [{ kinds: ["enemy-piece"], min: 1, max: 3, pieces: PAWN }] },
  { id: "bond-chain", cost: 6, type: "enchant", speed: "normal", targets: [one("own-piece", { king: true }), one("enemy-piece", { king: true })] },
  { id: "fate-chain", cost: 6, type: "enchant", speed: "normal", targets: [one("own-piece", { king: true }), one("enemy-piece", { king: true })] },
  { id: "agile-knight", cost: 6, type: "lasting", speed: "normal" },
  { id: "muddy-water", cost: 6, type: "lasting", speed: "normal" },
  { id: "bodyguard", cost: 6, type: "active", speed: "counter", trigger: "check" },

  // ── 7 cost ────────────────────────────────────────────────
  { id: "pandemonium", cost: 7, type: "active", speed: "normal" },
  { id: "assassinate", cost: 7, type: "active", speed: "normal", targets: [one("enemy-piece", { pieces: MINOR })] },
  { id: "regicide", cost: 7, type: "active", speed: "normal", targets: [one("enemy-piece", { pieces: ["q"] })] },
  { id: "sanctuary", cost: 7, type: "lasting", speed: "normal" },
  { id: "plague", cost: 7, type: "lasting", speed: "normal" },

  // ── 8 cost ────────────────────────────────────────────────
  { id: "purifying-light", cost: 8, type: "active", speed: "normal" },
  { id: "typhoon", cost: 8, type: "active", speed: "normal" },
  { id: "earthquake", cost: 8, type: "active", speed: "normal" },
  { id: "gambling-den", cost: 8, type: "lasting", speed: "normal" },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillMeta(id: string): SkillMeta | undefined {
  return BY_ID.get(id);
}

/** Every counter card that answers `trigger`. */
export function countersFor(trigger: CounterTrigger): SkillMeta[] {
  return SKILLS.filter((s) => s.speed === "counter" && s.trigger === trigger);
}

/**
 * The five kinds docs/skill.md sorts cards into, and the way players talk about
 * them. `type` and `speed` are what the rules run on; this is the single label
 * that comes off them, so the deck builder and the card face agree.
 */
export type SkillKind = "normal" | "quick" | "enchant" | "lasting" | "counter";

export function skillKind(id: string): SkillKind | null {
  const meta = skillMeta(id);
  if (!meta) return null;
  if (meta.speed === "counter") return "counter";
  if (meta.type === "enchant") return "enchant";
  if (meta.type === "lasting") return "lasting";
  return meta.speed === "quick" ? "quick" : "normal";
}

/** The picks a card asks for before it resolves — empty for the many that ask none. */
export function targetSpecs(id: string): TargetSpec[] {
  return skillMeta(id)?.targets ?? [];
}

/** True if the card cannot resolve until the player points at something. */
export function needsTargets(id: string): boolean {
  return targetSpecs(id).some((t) => t.min > 0);
}
