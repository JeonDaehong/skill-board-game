import { el, type AppContext, type Screen } from "../router.js";
import { GAMES } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import { multiScreen } from "./multi.js";

/**
 * 방 만들기: fill in a title / optional password / game, create the room, and
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
    titleInput.placeholder = "방 제목";
    titleInput.maxLength = 24;
    const pwInput = el("input", { class: "field-input" }) as HTMLInputElement;
    pwInput.placeholder = "비밀번호 (선택 — 비우면 공개방)";
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
          el("span", { class: "chip-glyph", text: g.icon }),
          el("span", { text: g.name }),
          g.playable ? null : el("span", { class: "chip-lock", text: "준비중" }),
        ]);
        return chip;
      }),
    );

    const errorLine = el("div", { class: "form-error" });

    container.replaceChildren(
      el("button", { class: "btn btn-ghost corner", text: "← 뒤로", onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: "방 만들기" }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: "방 제목" }),
        titleInput,
        el("label", { class: "field-label", text: "비밀번호" }),
        pwInput,
        el("label", { class: "field-label", text: "게임" }),
        chips,
        el("div", { class: "field-note", text: "호스트가 백(선공)으로 시작합니다." }),
        errorLine,
        el("button", {
          class: "btn btn-primary btn-block",
          text: "방 만들기",
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
        onOpponentLeft: () => showWaiting("", "상대가 나갔습니다"),
      },
      { type: "create-room", title, password, gameId: selectedGame, deck: [] },
    );
  }

  function showWaiting(code: string, note = "상대의 입장을 기다리는 중…"): void {
    const codeBox = el("div", { class: "invite-code", text: code || "—" });
    const copyBtn = el("button", {
      class: "btn btn-ghost btn-small",
      text: "복사",
      onclick: () => {
        if (code) navigator.clipboard?.writeText(code).then(
          () => (copyBtn.textContent = "복사됨 ✓"),
          () => {},
        );
      },
    });

    container.replaceChildren(
      el("h1", { class: "screen-title", text: "방 대기실" }),
      el("div", { class: "glass lobby-card" }, [
        el("div", { class: "field-label center", text: "초대코드" }),
        el("div", { class: "invite-row" }, [codeBox, copyBtn]),
        el("div", { class: "spinner" }),
        el("div", { class: "lobby-status", text: note }),
        el("div", { class: "carousel-hint", text: "친구에게 초대코드를 공유하세요" }),
        el("button", { class: "btn btn-ghost", text: "← 방 나가기", onclick: () => ctx.navigate(multiScreen) }),
      ]),
    );
  }

  return () => { if (mm) mm.cleanup(); };
};
