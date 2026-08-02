import { el, type AppContext, type Screen } from "../router.js";
import { GAMES } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";
import { gameName, t } from "../i18n.js";

/**
 * Create Room: fill in a title / optional password / game, create the room, and
 * wait on a generated invite code until an opponent joins. Leaving the screen
 * closes the socket, which deletes the pending room on the server.
 */
export const createRoomScreen: Screen = (ctx: AppContext) => {
  let mm: Matchmaking | null = null;
  let selectedGame = GAMES.find((g) => g.playable)!.id;

  const container = el("div", { class: "screen create-screen" });
  ctx.root.appendChild(container);
  showForm();

  function showForm(): void {
    const titleInput = el("input", { class: "field-input" }) as HTMLInputElement;
    titleInput.placeholder = t("room.name");
    titleInput.maxLength = 24;
    const pwInput = el("input", { class: "field-input" }) as HTMLInputElement;
    pwInput.placeholder = t("room.passwordOptional");
    pwInput.maxLength = 16;

    const chips = el(
      "div",
      { class: "game-chips" },
      GAMES.map((g) => {
        const chip = el("button", {
          class: `game-chip${g.id === selectedGame ? " active" : ""}${g.playable ? "" : " disabled"}`,
          onclick: g.playable
            ? () => {
                selectedGame = g.id;
                chips.querySelectorAll(".game-chip").forEach((c) => c.classList.remove("active"));
                chip.classList.add("active");
              }
            : undefined,
        }, [
          art(objectUrl(g.id), "chip-glyph"),
          el("span", { text: gameName(g.id) }),
          g.playable ? null : el("span", { class: "chip-lock", text: t("common.soon") }),
        ]);
        return chip;
      }),
    );

    const errorLine = el("div", { class: "form-error" });

    container.replaceChildren(
      el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: t("multi.create") }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: t("room.name") }),
        titleInput,
        el("label", { class: "field-label", text: t("common.password") }),
        pwInput,
        el("label", { class: "field-label", text: t("room.game") }),
        chips,
        el("div", { class: "field-note", text: t("room.hostNote") }),
        errorLine,
        el("button", {
          class: "btn btn-primary btn-block",
          text: t("room.create"),
          onclick: () => create(titleInput.value, pwInput.value),
        }),
      ]),
    );
  }

  function create(title: string, password: string): void {
    mm = driveMatchmaking(
      ctx,
      {
        onRoomCreated: (code) => showWaiting(code),
        onError: (msg) => showForm(),
        onOpponentLeft: () => showWaiting("", t("game.oppLeft")),
      },
      { type: "create-room", title, password, gameId: selectedGame, deck: [] },
    );
  }

  function showWaiting(code: string, note = t("room.waitingJoin")): void {
    const codeBox = el("div", { class: "invite-code", text: code || "—" });
    const copyBtn = el("button", {
      class: "btn btn-ghost btn-small",
      text: t("room.copy"),
      onclick: () => {
        if (code) navigator.clipboard?.writeText(code).then(
          () => (copyBtn.textContent = t("room.copied")),
          () => {},
        );
      },
    });

    container.replaceChildren(
      el("h1", { class: "screen-title", text: t("room.waitingTitle") }),
      el("div", { class: "glass lobby-card" }, [
        el("div", { class: "field-label center", text: t("room.inviteCode") }),
        el("div", { class: "invite-row" }, [codeBox, copyBtn]),
        el("div", { class: "spinner" }),
        el("div", { class: "lobby-status", text: note }),
        el("div", { class: "carousel-hint", text: t("room.shareHint") }),
        el("button", { class: "btn btn-ghost", text: t("room.leave"), onclick: () => ctx.navigate(multiScreen) }),
      ]),
    );
  }

  return () => { if (mm) mm.cleanup(); };
};
