import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";

/** Placeholder options screen — settings get wired up as features land. */
export const optionScreen: Screen = (ctx: AppContext) => {
  const row = (label: string, control: Node) =>
    el("div", { class: "option-row" }, [el("span", { text: label }), control]);

  const screen = el("div", { class: "screen option-screen" }, [
    el("h1", { class: "screen-title", text: "Option" }),
    el("div", { class: "option-list" }, [
      row("사운드", el("span", { class: "chip", text: "준비중" })),
      row("보드 테마", el("span", { class: "chip", text: "Classic" })),
      row("언어", el("span", { class: "chip", text: "한국어" })),
    ]),
    el("button", { class: "back-btn", text: "← 뒤로", onclick: () => ctx.navigate(menuScreen) }),
  ]);
  ctx.root.appendChild(screen);
};
