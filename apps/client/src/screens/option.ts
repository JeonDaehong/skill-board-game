import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { getLang, setLang, t, type Lang } from "../i18n.js";

/** Placeholder options screen — settings get wired up as features land. */
export const optionScreen: Screen = (ctx: AppContext) => {
  const row = (label: string, control: Node) =>
    el("div", { class: "option-row" }, [el("span", { text: label }), control]);

  /** Switching language rebuilds this screen, so the labels follow immediately. */
  const langPick = el("div", { class: "lang-pick" },
    ([["en", "English"], ["ko", "한국어"]] as [Lang, string][]).map(([code, label]) =>
      el("button", {
        class: `chip lang-chip${getLang() === code ? " active" : ""}`,
        text: label,
        onclick: () => {
          if (getLang() === code) return;
          setLang(code);
          ctx.reload();
        },
      }),
    ),
  );

  const screen = el("div", { class: "screen option-screen" }, [
    el("h1", { class: "screen-title", text: t("option.title") }),
    el("div", { class: "option-list" }, [
      row(t("option.sound"), el("span", { class: "chip", text: t("option.comingSoon") })),
      row(t("option.boardTheme"), el("span", { class: "chip", text: "Classic" })),
      row(t("option.language"), langPick),
    ]),
    el("button", { class: "back-btn", text: t("common.back"), onclick: () => ctx.navigate(menuScreen) }),
  ]);
  ctx.root.appendChild(screen);
};
