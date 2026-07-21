import { el, type AppContext, type Screen } from "../router.js";
import { selectScreen } from "./select.js";
import { optionScreen } from "./option.js";
import { makeSkillSelect } from "./skill-select.js";
import { makeLobby } from "./lobby.js";

/** Main menu: Single Play / Multi Play / Option / Quit. */
export const menuScreen: Screen = (ctx: AppContext) => {
  const btn = (label: string, sub: string, onclick: () => void, disabled = false) =>
    el(
      "button",
      { class: `menu-btn${disabled ? " disabled" : ""}`, onclick: disabled ? undefined : onclick },
      [
        el("span", { class: "menu-btn-label", text: label }),
        el("span", { class: "menu-btn-sub", text: sub }),
      ],
    );

  const screen = el("div", { class: "screen menu-screen" }, [
    el("div", { class: "menu-title" }, [
      el("h1", { text: "SKILL" }),
      el("h2", { text: "BOARD GAME" }),
    ]),
    el("nav", { class: "menu-nav" }, [
      btn("Single Play", "혼자서 AI와 대전", () => ctx.navigate(selectScreen)),
      btn("Multi Play", "온라인 대전 (스킬 선택 후 매칭)", () =>
        ctx.navigate(makeSkillSelect((skills) => makeLobby(skills))),
      ),
      btn("Option", "설정", () => ctx.navigate(optionScreen)),
      btn("Quit", "게임 종료", () => quit()),
    ]),
    el("div", { class: "menu-footer", text: "v0.1.0" }),
  ]);

  ctx.root.appendChild(screen);
};

function quit(): void {
  // In a browser tab window.close() only works for script-opened windows.
  // In the eventual Tauri/Electron/Capacitor shell this maps to app exit.
  if (confirm("게임을 종료할까요?")) {
    window.close();
    // Fallback for normal tabs where close() is blocked.
    document.body.innerHTML =
      '<div class="quit-msg">게임을 종료했습니다. 창을 닫아주세요.</div>';
  }
}
