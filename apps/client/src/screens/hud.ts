import { el, type AppContext } from "../router.js";
import { icon } from "../ui/art.js";

/**
 * Persistent top HUD bar (game-launcher style): brand mark on the left,
 * currency + player chip on the right. Uses lazy imports for navigation so it
 * can be dropped onto any screen without import cycles.
 */
export function topHud(ctx: AppContext): HTMLElement {
  const nick = localStorage.getItem("skill-board:nickname") || "Player";

  const brand = el("button", { class: "hud-brand" }, [
    el("span", { class: "brand-mark", text: "◆" }),
    el("span", { class: "brand-name", text: "SKILL BOARD" }),
  ]);
  brand.onclick = () => void import("./menu.js").then((m) => ctx.navigate(m.menuScreen));

  const currency = el("button", { class: "hud-chip currency" }, [
    icon("coin", "coin"),
    el("span", { class: "hud-amount", text: "0" }),
  ]);
  currency.onclick = () => void import("./shop.js").then((m) => ctx.navigate(m.shopScreen));

  const player = el("button", { class: "hud-chip player" }, [
    icon("avatar", "hud-avatar"),
    el("div", { class: "hud-player" }, [
      el("span", { class: "hud-nick", text: nick }),
      el("span", { class: "hud-lv", text: "LV.1" }),
    ]),
  ]);
  player.onclick = () => void import("./profile.js").then((m) => ctx.navigate(m.profileScreen));

  return el("header", { class: "top-hud" }, [
    brand,
    el("div", { class: "hud-right" }, [currency, player]),
  ]);
}
