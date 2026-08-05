import { el } from "../router.js";

/**
 * Paths into the generated art set (`public/assets`, cut by tools/slice-assets.py)
 * plus the helpers that put those images on screen. Everything the UI used to
 * draw with emoji now comes from here.
 */
export type IconName =
  | "home" | "profile" | "shop" | "single-play" | "online" | "deck" | "options"
  | "quit" | "quick-match" | "create-room" | "join-room" | "locked" | "coin"
  | "avatar" | "unknown-card" | "dice"
  // The five card kinds and the four turn steps, from the second batch.
  | "kind-normal" | "kind-quick" | "kind-enchant" | "kind-lasting" | "kind-counter"
  | "phase-draw" | "phase-summon" | "phase-skill" | "phase-move"
  | "cost-gem" | "counter-horn" | "card-burn" | "sandbag" | "trap" | "watch-eye";

export type ObjectName =
  | "chess" | "janggi" | "gomoku" | "dice-generic" | "pack-starter"
  | "queen-gold" | "pack-premium" | "theme-board" | "boost" | "trophy";

/** Board counters for enchants and terrain, keyed by what put them there. */
export type TokenName =
  | "sandbag" | "leap" | "disarm" | "swamp" | "mine" | "bond-chain"
  | "fate-chain" | "crown";

export const iconUrl = (name: IconName) => `/assets/icons/${name}.png`;
export const objectUrl = (name: string) => `/assets/objects/${name}.png`;
export const skillArtUrl = (id: string) => `/assets/skills/${id}.png`;
export const frameUrl = (tier: string) => `/assets/frames/${tier}.png`;
export const pieceUrl = (code: string) => `/assets/pieces/${code}.png`;
export const textureUrl = (name: string) => `/assets/textures/${name}.png`;
export const tokenUrl = (name: TokenName) => `/assets/tokens/${name}.png`;
export const modeUrl = (mode: string) => `/assets/modes/${mode}.png`;

/**
 * Which board token a card leaves behind. Several cards share one counter —
 * both sandbags weigh a piece down the same way, and a crown covers every card
 * that promotes a piece — so the map is by effect, not by card.
 */
const CARD_TOKEN: Record<string, TokenName> = {
  "small-sandbag": "sandbag",
  "large-sandbag": "sandbag",
  leap: "leap",
  disarm: "disarm",
  swamp: "swamp",
  mine: "mine",
  "bond-chain": "bond-chain",
  "fate-chain": "fate-chain",
  brainwash: "crown",
  awaken: "crown",
  "double-image": "crown",
  "guard-drill": "crown",
};

export function cardToken(cardId: string): TokenName | null {
  return CARD_TOKEN[cardId] ?? null;
}

/** An inline icon that scales with the surrounding font size. */
export function icon(name: IconName, extra = ""): HTMLElement {
  const node = el("span", { class: `icon ${extra}`.trim() });
  node.style.backgroundImage = `url("${iconUrl(name)}")`;
  return node;
}

/** A standalone art image (game icons, shop items) at whatever size CSS gives it. */
export function art(url: string, cls: string): HTMLElement {
  return el("img", { class: cls, attrs: { src: url, alt: "", loading: "lazy" } });
}
