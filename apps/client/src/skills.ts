/**
 * Skill definitions for the deck-building / draft screen.
 *
 * Deck rule: pick any set of cards whose total `cost` is ≤ 5.
 * `type`      — active (cast on your turn) / passive (always on).
 * `cooldown`  — turns to wait before recasting. null = no cooldown.
 * `usesPerGame` — how many times it can be used in one game. null = unlimited.
 * `image`     — card art path. null = placeholder; fill in later.
 *
 * NOTE: this is the rule spec (metadata) only — the actual effect logic is not
 * implemented yet. Effects hook into chess-core in the skill-engine stage.
 * [[skill-system-spec]]
 */
export type SkillType = "active" | "passive";

export interface Skill {
  id: string;
  name: string;
  cost: number;
  type: SkillType;
  cooldown: number | null;
  usesPerGame: number | null;
  desc: string;
  icon: string;
  image: string | null;
  /** Marks the "gambler" line (chance-based activation). */
  gambler?: boolean;
}

export const SKILLS: Skill[] = [
  {
    id: "retreat", name: "Retreat", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "Move a pawn one square back, left or right. Uses your turn.",
    icon: "↩", image: null,
  },
  {
    id: "cross-diagonal", name: "Cross & Diagonal", cost: 1, type: "active", cooldown: 5, usesPerGame: null,
    desc: "Move a bishop 1 square orthogonally, or a rook 1 square diagonally (may capture). Uses your turn.",
    icon: "✚", image: null,
  },
  {
    id: "raid-march", name: "Raid March", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "Move one piece 1 square ignoring its move rules. It can't be captured this turn. Does not use your turn.",
    icon: "⚑", image: null,
  },
  {
    id: "chaos", name: "Chaos", cost: 1, type: "passive", cooldown: null, usesPerGame: null,
    desc: "For the rest of the game both sides' rooks and bishops swap roles (bishop = orthogonal, rook = diagonal).",
    icon: "⇆", image: null,
  },
  {
    id: "agile-knight", name: "Agile Knight", cost: 1, type: "passive", cooldown: null, usesPerGame: null,
    desc: "Knights may also move like a Janggi elephant: forward-diagonal-diagonal (normal moves still allowed).",
    icon: "♘", image: null,
  },
  {
    id: "foresight", name: "Foresight", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "Point at one of the opponent's skill cards to reveal what it is.",
    icon: "◉", image: null,
  },
  {
    id: "iron-guard", name: "Iron Guard", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "Pick one piece other than the king. It can't be attacked until your next turn begins.",
    icon: "🛡", image: null,
  },
  {
    id: "sacrifice-pact", name: "Sacrifice Pact", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "Destroy one of your pieces to move three pieces instead (those pieces can't capture this turn).",
    icon: "✖", image: null,
  },
  {
    id: "phantom", name: "Phantom", cost: 2, type: "active", cooldown: 3, usesPerGame: null,
    desc: "All your pieces except the king may jump over allies within their range (not over enemies). Uses your turn.",
    icon: "👻", image: null,
  },
  {
    id: "teleport", name: "Teleport", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "Swap the positions of two of your pieces (not the king). Uses your turn and ends it.",
    icon: "✦", image: null,
  },
  {
    id: "cloak", name: "Cloak", cost: 2, type: "active", cooldown: null, usesPerGame: 2,
    desc: "For 5 turns all your pieces look like pawns to the opponent.",
    icon: "☁", image: null,
  },
  {
    id: "loyal-vassal", name: "Loyal Vassal", cost: 2, type: "passive", cooldown: null, usesPerGame: 1,
    desc: "When your king would be taken and a pawn is alive, they swap places and the pawn dies instead.",
    icon: "♟", image: null,
  },
  {
    id: "undo", name: "Undo", cost: 3, type: "active", cooldown: 5, usesPerGame: 5,
    desc: "Cancel the opponent's last turn and rewind one turn (that piece can't move this turn; captured pieces return).",
    icon: "⟲", image: null,
  },
  {
    id: "one-more", name: "One More", cost: 3, type: "active", cooldown: 5, usesPerGame: 5,
    desc: "Take one extra turn.",
    icon: "⥁", image: null,
  },
  {
    id: "revive-gamble", name: "Revive (Gambler)", cost: 3, type: "active", cooldown: 3, usesPerGame: null, gambler: true,
    desc: "Pick a piece other than king or queen. Chance to revive a captured piece (on failure the picked piece explodes). Does not use your turn. Pawn 50% / minor·rook 30% / queen 15%.",
    icon: "🎲", image: null,
  },
  {
    id: "evolve-gamble", name: "Evolve (Gambler)", cost: 3, type: "active", cooldown: 3, usesPerGame: null, gambler: true,
    desc: "Pick a piece other than king or queen. Chance to evolve it (on failure it explodes). Uses your turn. Pawn 25% → minor·rook, minor·rook 10% → queen.",
    icon: "🎲", image: null,
  },
  {
    id: "peasant-revolt", name: "Peasant Revolt", cost: 4, type: "passive", cooldown: null, usesPerGame: null,
    desc: "Pawns may capture the enemy piece directly in front of them.",
    icon: "⚔", image: null,
  },
  {
    id: "kings-return", name: "King's Return", cost: 4, type: "passive", cooldown: null, usesPerGame: 1,
    desc: "When your king dies it revives on a square you choose and summons 2 pawns beside it. It can't move on the revival turn.",
    icon: "♔", image: null,
  },
  {
    id: "titan-fusion", name: "Fusion (Titan)", cost: 4, type: "active", cooldown: null, usesPerGame: 1,
    desc: "Cast with 2 rooks beside the king and the queen in front. They fuse into a 4-square Titan that moves up to 4 squares in any direction, wiping out enemies in range. Explodes on the 3rd hit — you lose.",
    icon: "◆", image: null,
  },
  {
    id: "liberation", name: "Liberation", cost: 5, type: "active", cooldown: null, usesPerGame: 1,
    desc: "Every piece except kings and pawns becomes a queen. Queens made this way revert to pawns after 5 turns.",
    icon: "♛", image: null,
  },
];

/** Deck cost cap. */
export const MAX_DECK_COST = 5;

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
