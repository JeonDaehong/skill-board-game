import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl } from "../ui/art.js";
import { shopDesc, shopItem, t } from "../i18n.js";

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

/** Shop: placeholder storefront (mock currency, every item coming soon). */
export const shopScreen: Screen = (ctx: AppContext) => {
  ctx.root.appendChild(
    el("div", { class: "screen tab-screen shop-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("div", { class: "shop-head" }, [
          el("h1", { class: "screen-title", text: t("shop.title") }),
          el("div", { class: "glass wallet" }, [
            icon("coin", "coin"),
            el("span", { class: "wallet-amount", text: "0" }),
          ]),
        ]),
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
};
