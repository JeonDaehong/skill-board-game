import { el, type AppContext, type Screen } from "../router.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { art, icon, objectUrl, pieceUrl } from "../ui/art.js";
import { cardEl, fitNames } from "../ui/card.js";
import {
  MAX_PER_PIECE, PACKS, PIECE_CARDS, buyPack, buyPieceCard, formatCoins, getCoins,
  getPacks, openPack, ownedCount, setCoins, type CardPack, type PieceCard,
} from "../economy.js";
import { BOARD_THEMES, PIECE_SKINS, grantSkin, ownsSkin, skinPrice } from "../skins.js";
import { profileScreen } from "./profile.js";
import { cardName, shopDesc, shopItem, t } from "../i18n.js";
import { playSfx } from "../audio.js";

/**
 * Shop. Piece cards and skill-card packs both transact for real: coins come out
 * of the wallet and cards go into the collection. Opening a pack is its own
 * moment — five cards dealt onto an overlay — because that is the part of a
 * collection game people actually come back for.
 */
export const shopScreen: Screen = (ctx: AppContext) => {
  const walletAmount = el("span", { class: "wallet-amount" });
  const pieceGrid = el("div", { class: "shop-grid piece-grid" });
  const packGrid = el("div", { class: "shop-grid pack-grid" });
  const skinGrid = el("div", { class: "shop-grid skin-grid" });
  const themeGrid = el("div", { class: "shop-grid skin-grid" });
  const notice = el("div", { class: "shop-notice hidden" });
  const overlay = el("div", { class: "pack-overlay hidden" });

  ctx.root.appendChild(
    el("div", { class: "screen tab-screen shop-screen" }, [
      topHud(ctx),
      el("div", { class: "tab-scroll" }, [
        el("div", { class: "shop-head" }, [
          el("h1", { class: "screen-title", text: t("shop.title") }),
          el("div", { class: "glass wallet" }, [icon("coin", "coin"), walletAmount]),
        ]),
        notice,

        el("h2", { class: "shop-section", text: t("shop.packs") }),
        el("div", { class: "shop-section-note", text: t("shop.packsNote").replace("{n}", String(PACKS[0]?.size ?? 5)) }),
        packGrid,

        el("h2", { class: "shop-section", text: t("shop.pieces") }),
        el("div", { class: "shop-section-note", text: t("shop.piecesNote").replace("{max}", String(MAX_PER_PIECE)) }),
        pieceGrid,

        el("h2", { class: "shop-section", text: t("shop.pieceSkins") }),
        el("div", { class: "shop-section-note", text: t("shop.skinsNote") }),
        skinGrid,

        el("h2", { class: "shop-section", text: t("shop.boardThemes") }),
        el("div", { class: "shop-section-note", text: t("shop.themesNote") }),
        themeGrid,
      ]),
      overlay,
      pillNav(ctx, "shop"),
    ]),
  );

  renderAll();

  let noticeTimer: number | undefined;
  function flash(text: string, kind: "ok" | "bad"): void {
    // Every purchase and every refusal in this screen already funnels through
    // here, so it is the one place the sound has to be wired.
    playSfx(kind === "ok" ? "buy" : "denied");
    notice.textContent = text;
    notice.className = `shop-notice ${kind}`;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => notice.classList.add("hidden"), 2200);
  }

  function shake(node: HTMLElement): void {
    node.classList.remove("shake");
    void node.offsetWidth; // reflow to restart the animation
    node.classList.add("shake");
  }

  function renderAll(): void {
    walletAmount.textContent = formatCoins(getCoins());
    // The HUD carries its own copy of the balance; keep it honest after a buy.
    ctx.root.querySelectorAll<HTMLElement>(".hud-amount").forEach((n) => {
      n.textContent = formatCoins(getCoins());
    });
    renderPacks();
    renderPieces();
    renderSkins();
  }

  // ── skins and themes ───────────────────────────────────────
  /**
   * Cosmetics sell here and are worn on the profile screen. Buying something and
   * putting it on are separate decisions, so the shop tile stops at "owned" and
   * points at where the change is made rather than dressing you on the spot.
   */
  function renderSkins(): void {
    const coins = getCoins();
    const tile = (id: string, artName: string, price: number): HTMLElement => {
      const owned = ownsSkin(id);
      const affordable = coins >= price;
      const item = el("div", { class: `glass shop-item skin-item${owned ? " owned" : ""}` }, [
        owned ? el("span", { class: "owned-tag", text: t("shop.owned") }) : null,
        art(objectUrl(artName), "item-icon"),
        el("div", { class: "item-name", text: shopItem(id) }),
        el("div", { class: "item-desc", text: shopDesc(id) }),
      ]);
      item.appendChild(
        owned
          ? el("button", {
              class: "btn btn-small btn-block btn-open",
              text: t("shop.equipAt"),
              onclick: () => ctx.navigate(profileScreen),
            })
          : el("button", {
              class: `btn btn-small btn-block price-btn${affordable ? " btn-primary" : " btn-locked"}`,
              onclick: () => onBuySkin(id, item),
            }, [icon("coin", "coin"), el("span", { text: formatCoins(price) })]),
      );
      return item;
    };

    // The default set is not merchandise; it is what you already have on.
    skinGrid.replaceChildren(
      ...PIECE_SKINS.filter((s) => s.price > 0).map((s) => tile(s.id, s.art, s.price)),
    );
    themeGrid.replaceChildren(
      ...BOARD_THEMES.filter((s) => s.price > 0).map((s) => tile(s.id, s.art, s.price)),
    );
  }

  function onBuySkin(id: string, node: HTMLElement): void {
    const price = skinPrice(id);
    if (price === null || ownsSkin(id)) return;
    if (getCoins() < price) {
      shake(node);
      return flash(t("shop.tooPoor"), "bad");
    }
    setCoins(getCoins() - price);
    grantSkin(id);
    flash(t("shop.skinBought").replace("{name}", shopItem(id)), "ok");
    renderAll();
  }

  // ── packs ──────────────────────────────────────────────────
  function renderPacks(): void {
    const shelf = getPacks();
    const coins = getCoins();
    packGrid.replaceChildren(
      ...PACKS.map((pack) => {
        const held = shelf[pack.id] ?? 0;
        const affordable = coins >= pack.price;

        const item = el("div", { class: `glass shop-item pack-item${held > 0 ? " has-packs" : ""}` }, [
          held > 0 ? el("span", { class: "owned-tag", text: t("shop.unopened").replace("{n}", String(held)) }) : null,
          art(objectUrl(pack.art), "item-icon"),
          el("div", { class: "item-name", text: shopItem(pack.id) }),
          el("div", { class: "item-desc", text: shopDesc(pack.id) }),
        ]);

        item.appendChild(
          el("button", {
            class: `btn btn-small btn-block price-btn${affordable ? " btn-primary" : " btn-locked"}`,
            onclick: () => onBuyPack(pack, item),
          }, [icon("coin", "coin"), el("span", { text: formatCoins(pack.price) })]),
        );

        if (held > 0) {
          item.appendChild(
            el("button", {
              class: "btn btn-small btn-block btn-open",
              text: t("shop.open"),
              onclick: () => onOpenPack(pack),
            }),
          );
        }
        return item;
      }),
    );
  }

  function onBuyPack(pack: CardPack, node: HTMLElement): void {
    const res = buyPack(pack.id);
    if (!res.ok) {
      shake(node);
      return flash(t("shop.tooPoor"), "bad");
    }
    flash(t("shop.packBought"), "ok");
    renderAll();
  }

  function onOpenPack(pack: CardPack): void {
    const drawn = openPack(pack.id);
    if (!drawn) return;
    renderAll();
    showPackResult(drawn);
  }

  /**
   * The reveal. Cards are dealt one at a time rather than all at once — the
   * whole appeal of a pack is the order they come out in.
   */
  function showPackResult(drawn: string[]): void {
    const row = el("div", { class: "pack-cards" });
    overlay.replaceChildren(
      el("div", { class: "pack-card-wrap" }, [
        el("div", { class: "pack-title", text: t("shop.packResult").replace("{n}", String(drawn.length)) }),
        row,
        el("button", {
          class: "btn btn-primary",
          text: t("shop.packDone"),
          onclick: () => { overlay.classList.add("hidden"); overlay.replaceChildren(); },
        }),
      ]),
    );
    overlay.classList.remove("hidden");
    playSfx("pack");

    drawn.forEach((id, i) => {
      window.setTimeout(() => {
        if (overlay.classList.contains("hidden")) return;
        const card = cardEl(id, "md");
        card.classList.add("dealt");
        card.title = cardName(id);
        row.appendChild(card);
        fitNames(row);
        // One per card, in step with the reveal — the whole appeal of a pack is
        // the order they come out in, and that is as much heard as seen.
        playSfx("draw");
      }, i * 180);
    });
  }

  // ── piece cards ────────────────────────────────────────────
  function renderPieces(): void {
    const coins = getCoins();
    pieceGrid.replaceChildren(
      ...PIECE_CARDS.map((card) => {
        const owned = ownedCount(card.id);
        const full = owned >= MAX_PER_PIECE;
        const affordable = coins >= card.price;

        const item = el("div", { class: `glass shop-item piece-item${full ? " maxed" : ""}` }, [
          el("span", { class: "owned-tag", text: `${owned}/${MAX_PER_PIECE}` }),
          art(pieceUrl(card.sprite), "item-icon piece-icon"),
          el("div", { class: "item-name", text: cardName(card.id) }),
          el("div", { class: "item-desc", text: full ? t("shop.full") : t("shop.pieceCard") }),
        ]);

        item.appendChild(
          el("button", {
            class: `btn btn-small btn-block price-btn${full || !affordable ? " btn-locked" : " btn-primary"}`,
            onclick: () => buy(card, item),
          }, [icon("coin", "coin"), el("span", { text: formatCoins(card.price) })]),
        );
        return item;
      }),
    );
  }

  function buy(card: PieceCard, node: HTMLElement): void {
    const res = buyPieceCard(card.id);
    if (!res.ok) {
      shake(node);
      flash(
        res.reason === "full" ? t("shop.atCap").replace("{max}", String(MAX_PER_PIECE)) : t("shop.tooPoor"),
        "bad",
      );
      return;
    }
    flash(t("shop.bought").replace("{name}", cardName(card.id)).replace("{n}", String(res.owned)), "ok");
    renderAll();
  }
};
