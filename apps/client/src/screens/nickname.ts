import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { icon } from "../ui/art.js";
import { NICK_MAX, nicknameOk, setNickname } from "../player.js";
import { t } from "../i18n.js";

/**
 * The very first screen: what should we call you?
 *
 * It runs once, before the menu, because every screen after it shows a name —
 * the HUD chip, the profile page, the plate beside the board — and "Player"
 * appearing in all three is the game admitting it never asked.
 */
export function makeNickname(next: Screen = menuScreen): Screen {
  return (ctx: AppContext) => {
    const input = el("input", { class: "field-input nick-input" }) as HTMLInputElement;
    input.maxLength = NICK_MAX;
    input.placeholder = t("nick.placeholder");
    input.autocomplete = "off";

    const error = el("div", { class: "form-error" });
    const confirm = el("button", { class: "btn btn-primary btn-block", text: t("nick.confirm") });

    const submit = (): void => {
      const value = input.value.trim();
      if (!nicknameOk(value)) {
        error.textContent = t("nick.tooShort");
        input.focus();
        return;
      }
      setNickname(value);
      ctx.navigate(next);
    };

    confirm.onclick = submit;
    input.onkeydown = (e) => {
      error.textContent = "";
      if (e.key === "Enter") submit();
    };

    ctx.root.appendChild(
      el("div", { class: "screen nick-screen" }, [
        el("div", { class: "menu-hero" }, [
          el("h1", { class: "hero-title", text: "SKILL BOARD" }),
          el("div", { class: "hero-rule" }),
        ]),
        el("div", { class: "glass form-card nick-card" }, [
          el("div", { class: "nick-avatar" }, [icon("avatar", "avatar")]),
          el("h2", { class: "nick-title", text: t("nick.title") }),
          el("p", { class: "nick-body", text: t("nick.body") }),
          input,
          error,
          confirm,
        ]),
      ]),
    );

    // Straight into the field: the screen exists to be typed in.
    requestAnimationFrame(() => input.focus());
  };
}
