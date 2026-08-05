import { isPieceCard, skillKind, type SkillSpeed } from "@skill/engine";
import { el } from "../router.js";
import { art, frameUrl, icon, pieceUrl, skillArtUrl } from "./art.js";
import { skillIcon } from "../skills.js";
import { cardCostOf } from "../cards.js";
import { pieceSprite } from "../economy.js";
import { cardDesc, cardName, t } from "../i18n.js";

/**
 * One collectible card, drawn the same way everywhere it appears — the deck
 * builder's pool, the tray, the shop, and the hand during a match.
 *
 * The painted frame is a PNG whose art window was keyed out, so the artwork
 * simply sits behind it and shows through the hole — no per-frame geometry to
 * chase, which matters because the five frames are hand-painted and their
 * windows are not pixel-identical.
 */
export type CardSize = "xs" | "sm" | "md" | "lg";

/**
 * Rarity tier, derived from cost. It drives the frame colour, the art tint and
 * the gem — a 5-cost card should *look* like a bomb next to a 1-cost.
 */
const TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;

export function tierOf(cardId: string): string {
  const cost = cardCostOf(cardId);
  return TIERS[Math.min(TIERS.length, Math.max(1, cost)) - 1]!;
}

/** The label under a card's name: 일반 / 속공 / 대응, or the summon rule. */
export function speedLabel(speed: SkillSpeed): string {
  if (speed === "quick") return t("play.speedQuick");
  if (speed === "counter") return t("play.speedCounter");
  return t("play.speedNormal");
}

/** The short type line a card shows: 일반 / 속공 / 부여 / 지속 / 대응. */
export function cardTypeLine(cardId: string): string {
  if (isPieceCard(cardId)) return t("deck.pieces");
  const kind = skillKind(cardId);
  return kind ? t(`kind.${kind}` as never) : "";
}

export function cardEl(cardId: string, size: CardSize): HTMLElement {
  const tier = tierOf(cardId);
  const sprite = pieceSprite(cardId);

  // A piece card shows its sculpt on the parchment; a skill card shows its
  // painted scene. Both sit behind the same frame.
  const image = art(sprite ? pieceUrl(sprite) : skillArtUrl(cardId), "tcg-art-img") as HTMLImageElement;
  const artLayer = el("div", { class: `tcg-art${sprite ? " piece" : ""}` }, [image]);
  // Cards outrun their artwork: a new card is playable long before it is
  // painted, so an unpainted one falls back to its glyph rather than to a
  // broken-image icon.
  image.onerror = () => {
    image.remove();
    artLayer.appendChild(el("span", { class: "tcg-glyph", text: skillIcon(cardId) }));
  };
  const frame = el("div", { class: "tcg-frame" });
  frame.style.backgroundImage = `url("${frameUrl(tier)}")`;

  const children: (Node | null)[] = [
    artLayer,
    frame,
    el("span", { class: "tcg-gem", text: String(cardCostOf(cardId)) }),
    el("div", { class: "tcg-name", text: cardName(cardId) }),
  ];
  if (size !== "xs") {
    const kind = isPieceCard(cardId) ? null : skillKind(cardId);
    children.push(
      el("div", { class: "tcg-text" }, [
        el("span", { class: "tcg-type" }, [
          // The badge only earns its space where the type line has room; on a
          // pool-sized card it would crowd out the word it illustrates.
          kind && size !== "sm" ? icon(`kind-${kind}`, "tcg-kind") : null,
          el("span", { text: cardTypeLine(cardId) }),
        ]),
        // Pool cards render ~136px wide, where body text is an unreadable
        // smudge; only the blown-up sizes carry the rules.
        size === "lg" || size === "md" ? el("span", { text: cardDesc(cardId) }) : null,
      ]),
    );
  }

  return el("div", { class: `tcg-card ${size} t-${tier}` }, children);
}

/**
 * Shrink a card title until it fits its banner. A few names ("King's Return")
 * overrun the painted banner at the pool size, and clipping them to an ellipsis
 * loses the card's identity — which is the one thing that has to read.
 * Runs after the node is in the document, since it measures layout.
 */
export function fitNames(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".tcg-name").forEach((node) => {
    node.style.fontSize = "";
    const avail = node.clientWidth;
    if (!avail || node.scrollWidth <= avail) return;
    const base = parseFloat(getComputedStyle(node).fontSize);
    const scaled = Math.max(base * (avail / node.scrollWidth) * 0.97, base * 0.62);
    node.style.fontSize = `${scaled}px`;
  });
}
