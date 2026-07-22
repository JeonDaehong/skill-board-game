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

/** Single Play flow: pick a game → 3·2·1 → AI match. */
const singlePlay: Screen = makeGamePicker(
  (game) =>
    makeCountdown(
      game.id === "chess" ? makeChess({ humanColor: "w", depth: 20 }) : makeLocalBoardGame(game.id),
    ),
  { title: "게임 선택", onBack: menuScreen },
);

/** Main menu (home tab): launcher-style hero + big play cards + bottom nav. */
export function menuScreen(ctx: AppContext): void {
  const playCard = (icon: string, kicker: string, label: string, sub: string, onclick: () => void, extra = "") =>
    el("button", { class: `play-card ${extra}`, onclick }, [
      el("span", { class: "play-icon", text: icon }),
      el("span", { class: "play-body" }, [
        el("span", { class: "play-kicker", text: kicker }),
        el("span", { class: "play-label", text: label }),
        el("span", { class: "play-sub", text: sub }),
      ]),
      el("span", { class: "play-go", text: "▶" }),
    ]);

  const util = (icon: string, label: string, onclick: () => void) =>
    el("button", { class: "btn btn-ghost util-btn", onclick }, [
      el("span", { text: icon }),
      el("span", { text: label }),
    ]);

  ctx.root.appendChild(
    el("div", { class: "screen menu-screen" }, [
      topHud(ctx),
      el("div", { class: "menu-body" }, [
        el("div", { class: "menu-hero" }, [
          el("div", { class: "hero-kicker", text: "◆  SEASON 1  ◆" }),
          el("h1", { class: "hero-title", text: "SKILL BOARD" }),
          el("div", { class: "hero-rule" }),
          el("div", { class: "hero-sub", text: "카드로 판을 뒤집는 전략 보드게임" }),
        ]),
        el("div", { class: "play-cards" }, [
          playCard("🎮", "SOLO", "Single Play", "AI와 1:1 대전", () => ctx.navigate(singlePlay)),
          playCard("🌐", "ONLINE", "Multi Play", "퀵스타트 · 방 만들기 · 참여하기", () => ctx.navigate(multiScreen)),
        ]),
        playCard("🃏", "DECK", "덱 만들기", "게임별 카드 덱 구성", () => ctx.navigate(deckScreen), "deck-cta"),
        el("div", { class: "menu-util" }, [
          util("⚙️", "OPTION", () => ctx.navigate(optionScreen)),
          util("⏻", "QUIT", () => quit()),
        ]),
      ]),
      pillNav(ctx, "home"),
    ]),
  );
}

function quit(): void {
  // In a browser tab window.close() only works for script-opened windows.
  // In the eventual Tauri/Electron/Capacitor shell this maps to app exit.
  if (confirm("게임을 종료할까요?")) {
    window.close();
    document.body.innerHTML = '<div class="quit-msg">게임을 종료했습니다. 창을 닫아주세요.</div>';
  }
}
