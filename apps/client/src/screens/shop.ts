import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl, pieceUrl } from "../ui/art.js";
import {
  MAX_PER_PIECE, PIECE_CARDS, buyPieceCard, formatCoins, getCoins, getInventory,
  type PieceCard,
} from "../economy.js";
import { getLang, shopDesc, shopItem, t } from "../i18n.js";

interface ShopItem {
  art: string;
  name: string;
  desc: string;
  price: string;
  tag?: string;
}

const ITEMS: ShopItem[] = [
  { art: "pack-starter", name: "Starter Pack", desc: "5 random skill cards", price: "1,000", tag: "Soon" },
  { art: "queen-gold", name: "Gold Piece Skin", desc: "Premium chess piece set", price: "2,500", tag: "Soon" },
  { art: "pack-premium", name: "Premium Pack", desc: "Higher rare card odds", price: "3,000", tag: "Soon" },
  { art: "theme-board", name: "Neon Board Theme", desc: "Board background theme", price: "1,800", tag: "Soon" },
  { art: "boost", name: "Boost Pass", desc: "Double XP for 7 days", price: "1,200", tag: "Soon" },
  { art: "trophy", name: "Season Pass", desc: "Unlocks the season reward track", price: "4,900", tag: "Soon" },
];

/**
 * Shop. Piece cards are the one section that actually transacts: coins come
 * out of the wallet and copies go into the collection, capped per piece. The
 * rest of the storefront is still a mock (skins, packs, passes).
 */
export const shopScreen: Screen = (ctx: AppContext) => {
  const walletAmount = el("span", { class: "wallet-amount" });
  const pieceGrid = el("div", { class: "shop-grid piece-grid" });
  const notice = el("div", { class: "shop-notice hidden" });

  ctx.root.appendChild(
    el("div", { class: "screen tab-screen shop-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("div", { class: "shop-head" }, [
          el("h1", { class: "screen-title", text: t("shop.title") }),
          el("div", { class: "glass wallet" }, [icon("coin", "coin"), walletAmount]),
        ]),

        el("h2", { class: "shop-section", text: t("shop.pieces") }),
        el("div", { class: "shop-section-note", text: t("shop.piecesNote").replace("{max}", String(MAX_PER_PIECE)) }),
        notice,
        pieceGrid,

        el("h2", { class: "shop-section", text: t("shop.other") }),
        el("div", { class: "shop-grid" },
          ITEMS.map((it) =>
            el("div", { class: "glass shop-item" }, [
              it.tag ? el("span", { class: "item-tag", text: t("common.soon") }) : null,
              art(objectUrl(it.art), "item-icon"),
              el("div", { class: "item-name", text: shopItem(it.art) }),
              el("div", { class: "item-desc", text: shopDesc(it.art) }),
              el("button", { class: "btn btn-primary btn-small btn-block price-btn" }, [
                icon("coin", "coin"),
                el("span", { text: it.price }),
              ]),
            ]),
          ),
        ),
        el("div", { class: "coming-note", text: t("shop.soon") }),
      ]),
      pillNav(ctx, "shop"),
    ]),
  );

  renderAll();

  let noticeTimer: number | undefined;
  function flash(text: string, kind: "ok" | "bad"): void {
    notice.textContent = text;
    notice.className = `shop-notice ${kind}`;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => notice.classList.add("hidden"), 2000);
  }

  function buy(card: PieceCard, node: HTMLElement): void {
    const res = buyPieceCard(card.id);
    if (!res.ok) {
      node.classList.remove("shake");
      void node.offsetWidth; // reflow to restart the animation
      node.classList.add("shake");
      flash(res.reason === "full" ? t("shop.atCap").replace("{max}", String(MAX_PER_PIECE)) : t("shop.tooPoor"), "bad");
      return;
    }
    flash(t("shop.bought").replace("{name}", pieceLabel(card)).replace("{n}", String(res.owned)), "ok");
    renderAll();
  }

  function renderAll(): void {
    walletAmount.textContent = formatCoins(getCoins());
    // The HUD carries its own copy of the balance; keep it honest after a buy.
    ctx.root.querySelectorAll<HTMLElement>(".hud-amount").forEach((n) => {
      n.textContent = formatCoins(getCoins());
    });
    renderPieces();
  }

  function renderPieces(): void {
    const inv = getInventory();
    const coins = getCoins();
    pieceGrid.replaceChildren(
      ...PIECE_CARDS.map((card) => {
        const owned = inv[card.id] ?? 0;
        const full = owned >= MAX_PER_PIECE;
        const affordable = coins >= card.price;

        const item = el("div", { class: `glass shop-item piece-item${full ? " maxed" : ""}` }, [
          el("span", { class: "owned-tag", text: `${owned}/${MAX_PER_PIECE}` }),
          art(pieceUrl(card.sprite), "item-icon piece-icon"),
          el("div", { class: "item-name", text: pieceLabel(card) }),
          el("div", { class: "item-desc", text: full ? t("shop.full") : t("shop.pieceCard") }),
        ]);

        const buyBtn = el("button", {
          class: `btn btn-small btn-block price-btn${full || !affordable ? " btn-locked" : " btn-primary"}`,
          onclick: () => buy(card, item),
        }, [
          icon("coin", "coin"),
          el("span", { text: formatCoins(card.price) }),
        ]);
        item.appendChild(buyBtn);
        return item;
      }),
    );
  }
};

const pieceLabel = (card: PieceCard): string => (getLang() === "ko" ? card.label[1] : card.label[0]);
