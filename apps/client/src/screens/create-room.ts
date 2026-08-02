import { el, type AppContext, type Screen } from "../router.js";
import { GAMES } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";

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
    titleInput.placeholder = "Room name";
    titleInput.maxLength = 24;
    const pwInput = el("input", { class: "field-input" }) as HTMLInputElement;
    pwInput.placeholder = "Password (optional — empty = public)";
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
          el("span", { text: g.name }),
          g.playable ? null : el("span", { class: "chip-lock", text: "Soon" }),
        ]);
        return chip;
      }),
    );

    const errorLine = el("div", { class: "form-error" });

    container.replaceChildren(
      el("button", { class: "btn btn-ghost corner", text: "← Back", onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: "Create Room" }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: "Room name" }),
        titleInput,
        el("label", { class: "field-label", text: "Password" }),
        pwInput,
        el("label", { class: "field-label", text: "Game" }),
        chips,
        el("div", { class: "field-note", text: "The host plays white and moves first." }),
        errorLine,
        el("button", {
          class: "btn btn-primary btn-block",
          text: "Create room",
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
        onOpponentLeft: () => showWaiting("", "Opponent left"),
      },
      { type: "create-room", title, password, gameId: selectedGame, deck: [] },
    );
  }

  function showWaiting(code: string, note = "Waiting for an opponent to join…"): void {
    const codeBox = el("div", { class: "invite-code", text: code || "—" });
    const copyBtn = el("button", {
      class: "btn btn-ghost btn-small",
      text: "Copy",
      onclick: () => {
        if (code) navigator.clipboard?.writeText(code).then(
          () => (copyBtn.textContent = "Copied ✓"),
          () => {},
        );
      },
    });

    container.replaceChildren(
      el("h1", { class: "screen-title", text: "Waiting Room" }),
      el("div", { class: "glass lobby-card" }, [
        el("div", { class: "field-label center", text: "Invite code" }),
        el("div", { class: "invite-row" }, [codeBox, copyBtn]),
        el("div", { class: "spinner" }),
        el("div", { class: "lobby-status", text: note }),
        el("div", { class: "carousel-hint", text: "Share the invite code with a friend" }),
        el("button", { class: "btn btn-ghost", text: "← Leave room", onclick: () => ctx.navigate(multiScreen) }),
      ]),
    );
  }

  return () => { if (mm) mm.cleanup(); };
};
