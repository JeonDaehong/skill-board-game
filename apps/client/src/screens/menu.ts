import { el, type AppContext, type Screen } from "../router.js";
import { makeGamePicker } from "./select.js";
import { multiScreen } from "./multi.js";
import { optionScreen } from "./option.js";
import { makeCountdown } from "./countdown.js";
import { makeChess } from "../chess/controller.js";
import { makeLocalBoardGame } from "../board/controller.js";
import { deckScreen } from "./deck.js";
import { pillNav } from "./nav.js";
import { topHud } from "./hud.js";
import { icon, type IconName } from "../ui/art.js";
import { t } from "../i18n.js";

/** Single Play flow: pick a game → 3·2·1 → AI match.
 *
 *  Built on entry rather than at module load: `t()` resolves once where it is
 *  called, so a picker constructed at import time would keep the language that
 *  was active when the bundle first ran. */
const singlePlay: Screen = (ctx) =>
  makeGamePicker(
    (game) =>
      makeCountdown(
        game.id === "chess" ? makeChess({ humanColor: "w", depth: 20 }) : makeLocalBoardGame(game.id),
      ),
    { title: t("picker.title"), onBack: menuScreen },
  )(ctx);

/** Main menu (home tab): launcher-style hero + big play cards + bottom nav. */
export function menuScreen(ctx: AppContext): void {
  const playCard = (name: IconName, label: string, onclick: () => void, extra = "") =>
    el("button", { class: `play-card ${extra}`, onclick }, [
      icon(name, "play-icon"),
      el("span", { class: "play-label", text: label }),
      el("span", { class: "play-go", text: "▶" }),
    ]);

  const util = (name: IconName, label: string, onclick: () => void) =>
    el("button", { class: "btn btn-ghost util-btn", onclick }, [
      icon(name),
      el("span", { text: label }),
    ]);

  ctx.root.appendChild(
    el("div", { class: "screen menu-screen" }, [
      topHud(ctx),
      el("div", { class: "menu-body" }, [
        el("div", { class: "menu-hero" }, [
          el("h1", { class: "hero-title", text: "SKILL BOARD" }),
          el("div", { class: "hero-rule" }),
        ]),
        el("div", { class: "play-cards" }, [
          playCard("single-play", t("menu.single"), () => ctx.navigate(singlePlay)),
          playCard("online", t("menu.online"), () => ctx.navigate(multiScreen)),
        ]),
        playCard("deck", t("menu.deck"), () => ctx.navigate(deckScreen), "deck-cta"),
        el("div", { class: "menu-util" }, [
          util("options", t("menu.option"), () => ctx.navigate(optionScreen)),
          util("quit", t("menu.quit"), () => quit()),
        ]),
      ]),
      pillNav(ctx, "home"),
    ]),
  );
}

function quit(): void {
  // In a browser tab window.close() only works for script-opened windows.
  // In the eventual Tauri/Electron/Capacitor shell this maps to app exit.
  if (confirm(t("menu.quitConfirm"))) {
    window.close();
    document.body.innerHTML = `<div class="quit-msg">${t("menu.quitDone")}</div>`;
  }
}
