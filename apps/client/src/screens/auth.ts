import { el, type AppContext, type Screen } from "../router.js";
import { menuScreen } from "./menu.js";
import { icon } from "../ui/art.js";
import { t } from "../i18n.js";
import { signIn, signUp, type AuthError, type AuthResult } from "../account.js";

/**
 * The door. Nothing else in the game is reachable until this screen is
 * answered — an account is what a coin balance, a collection and a ladder
 * rating all hang off, so handing out any of them before knowing whose they
 * are just means moving them later.
 *
 * Two modes on one screen rather than two screens: signing in and signing up
 * differ by two fields, and a player who guessed wrong should not have to
 * navigate to fix it.
 *
 * The one way past it is offline play, offered only after a request has
 * actually failed to reach the server. A player whose connection is down still
 * owns a single-player game, and refusing to start it would be the login
 * screen holding the game hostage over something that is not the player's
 * fault. Their progress stays local until they sign in, and the menu keeps
 * saying so.
 */
export function makeAuth(next: Screen = menuScreen): Screen {
  return (ctx: AppContext) => {
    let mode: "in" | "up" = "in";
    let busy = false;
    /** Set once a call has failed with no network; unlocks the offline door. */
    let offline = false;

    const field = (labelKey: string, placeholderKey: string, type = "text"): HTMLInputElement => {
      const input = el("input", { class: "field-input" }) as HTMLInputElement;
      input.type = type;
      input.placeholder = t(placeholderKey as Parameters<typeof t>[0]);
      input.autocomplete = "off";
      input.dataset["label"] = t(labelKey as Parameters<typeof t>[0]);
      return input;
    };

    const username = field("auth.username", "auth.usernamePlaceholder");
    username.autocomplete = "username";
    username.maxLength = 16;
    const password = field("auth.password", "auth.passwordPlaceholder", "password");
    password.maxLength = 72;
    const confirm = field("auth.confirm", "auth.passwordAgain", "password");
    confirm.maxLength = 72;
    const nickname = field("auth.nickname", "auth.nicknamePlaceholder");
    nickname.maxLength = 16;

    const labelled = (input: HTMLInputElement) =>
      el("label", { class: "field-row" }, [
        el("span", { class: "field-label", text: input.dataset["label"] ?? "" }),
        input,
      ]);

    const nickRow = labelled(nickname);
    const confirmRow = labelled(confirm);
    const title = el("h2", { class: "nick-title", text: t("auth.welcome") });
    const error = el("div", { class: "form-error" });
    const submitBtn = el("button", { class: "btn btn-primary btn-block" });
    const switchBtn = el("button", { class: "btn btn-ghost btn-block auth-switch" });
    const offlineBox = el("div", { class: "auth-offline hidden" }, [
      el("div", { class: "auth-offline-note", text: t("auth.offlineNote") }),
      el("button", {
        class: "btn btn-ghost btn-block",
        text: t("auth.playOffline"),
        onclick: () => ctx.navigate(next),
      }),
    ]);

    /**
     * One switch, at the bottom, under the button it changes. An earlier
     * version also had a pair of tabs on top of the card; two controls for one
     * piece of state is one too many, and the tabs were the pair that made the
     * card look like a settings page rather than a login.
     */
    function setMode(which: "in" | "up"): void {
      mode = which;
      error.textContent = "";
      title.textContent = t(which === "in" ? "auth.welcome" : "auth.createTitle");
      nickRow.classList.toggle("hidden", which === "in");
      confirmRow.classList.toggle("hidden", which === "in");
      password.autocomplete = which === "in" ? "current-password" : "new-password";
      submitBtn.textContent = t(which === "in" ? "auth.signIn" : "auth.signUp");
      switchBtn.textContent = t(which === "in" ? "auth.noAccount" : "auth.haveAccount");
      requestAnimationFrame(() => username.focus());
    }
    switchBtn.onclick = () => setMode(mode === "in" ? "up" : "in");

    function setBusy(on: boolean): void {
      busy = on;
      submitBtn.toggleAttribute("disabled", on);
      submitBtn.textContent = on
        ? t("auth.working")
        : t(mode === "in" ? "auth.signIn" : "auth.signUp");
    }

    function show(err: AuthError): void {
      error.textContent = t(`auth.err.${err}` as Parameters<typeof t>[0]);
      // Only a failure to reach the server opens the offline door — a wrong
      // password is not a reason to offer playing without an account.
      if (err === "offline" && !offline) {
        offline = true;
        offlineBox.classList.remove("hidden");
      }
    }

    async function submit(): Promise<void> {
      if (busy) return;
      error.textContent = "";

      if (mode === "up" && password.value !== confirm.value) {
        show("password-mismatch");
        confirm.focus();
        return;
      }

      setBusy(true);
      const result: AuthResult =
        mode === "in"
          ? await signIn(username.value.trim(), password.value)
          : await signUp(username.value.trim(), password.value, nickname.value.trim());
      setBusy(false);

      if (!result.ok) return show(result.error);
      ctx.navigate(next);
    }

    submitBtn.onclick = () => void submit();
    for (const input of [username, password, confirm, nickname]) {
      input.onkeydown = (e) => {
        if (e.key === "Enter") void submit();
      };
    }

    ctx.root.appendChild(
      el("div", { class: "screen auth-screen" }, [
        el("div", { class: "menu-hero" }, [
          el("h1", { class: "hero-title", text: "SKILL BOARD" }),
          el("div", { class: "hero-rule" }),
        ]),
        el("div", { class: "glass form-card auth-card" }, [
          el("div", { class: "nick-avatar" }, [icon("avatar", "avatar")]),
          title,
          labelled(username),
          nickRow,
          labelled(password),
          confirmRow,
          error,
          submitBtn,
          switchBtn,
          offlineBox,
        ]),
      ]),
    );

    setMode("in");
  };
}
