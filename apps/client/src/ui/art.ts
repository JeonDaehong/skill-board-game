import { el } from "../router.js";

/**
 * Paths into the generated art set (`public/assets`, cut by tools/slice-assets.py)
 * plus the helpers that put those images on screen. Everything the UI used to
 * draw with emoji now comes from here.
 */
export type IconName =
  | "home" | "profile" | "shop" | "single-play" | "online" | "deck" | "options"
  | "quit" | "quick-match" | "create-room" | "join-room" | "locked" | "coin"
  | "avatar" | "unknown-card" | "dice";

export type ObjectName =
  | "chess" | "janggi" | "gomoku" | "dice-generic" | "pack-starter"
  | "queen-gold" | "pack-premium" | "theme-board" | "boost" | "trophy";

export const iconUrl = (name: IconName) => `/assets/icons/${name}.png`;
export const objectUrl = (name: string) => `/assets/objects/${name}.png`;
export const skillArtUrl = (id: string) => `/assets/skills/${id}.png`;
export const frameUrl = (tier: string) => `/assets/frames/${tier}.png`;
export const pieceUrl = (code: string) => `/assets/pieces/${code}.png`;
export const textureUrl = (name: string) => `/assets/textures/${name}.png`;

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
