import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";

/** Placeholder options screen — settings get wired up as features land. */
export const optionScreen: Screen = (ctx: AppContext) => {
  const row = (label: string, control: Node) =>
    el("div", { class: "option-row" }, [el("span", { text: label }), control]);

  const screen = el("div", { class: "screen option-screen" }, [
    el("h1", { class: "screen-title", text: "Option" }),
    el("div", { class: "option-list" }, [
      row("Sound", el("span", { class: "chip", text: "Coming soon" })),
      row("Board theme", el("span", { class: "chip", text: "Classic" })),
      row("Language", el("span", { class: "chip", text: "English" })),
    ]),
    el("button", { class: "back-btn", text: "← Back", onclick: () => ctx.navigate(menuScreen) }),
  ]);
  ctx.root.appendChild(screen);
};
