import { el, type AppContext, type Screen } from "../router.js";
import { gameById } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import type { RoomSummary } from "../types.js";
import { multiScreen } from "./multi.js";

/**
 * 참여하기: browse the server's open rooms and join one (password prompt if
 * locked), or type an invite code directly. Joining hands off to the game view
 * once the host's match starts.
 */
export const joinRoomScreen: Screen = (ctx: AppContext) => {
  let mm: Matchmaking;

  const codeInput = el("input", { class: "field-input" }) as HTMLInputElement;
  codeInput.placeholder = "초대코드";
  codeInput.maxLength = 8;
  const codePw = el("input", { class: "field-input" }) as HTMLInputElement;
  codePw.placeholder = "비밀번호 (있는 경우)";
  codePw.maxLength = 16;

  const errorLine = el("div", { class: "form-error" });
  const listBox = el("div", { class: "room-list", text: "" });

  ctx.root.appendChild(
    el("div", { class: "screen join-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: "← 뒤로", onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: "참여하기" }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: "초대코드로 입장" }),
        el("div", { class: "code-join-row" }, [codeInput, codePw]),
        el("button", {
          class: "btn btn-primary btn-block",
          text: "입장",
          onclick: () => join(codeInput.value, codePw.value),
        }),
      ]),
      el("div", { class: "list-head" }, [
        el("span", { class: "field-label", text: "열린 방" }),
        el("button", { class: "btn btn-ghost btn-small", text: "새로고침", onclick: () => refresh() }),
      ]),
      errorLine,
      listBox,
    ]),
  );

  function setError(msg: string): void {
    errorLine.textContent = msg;
  }

  function refresh(): void {
    mm.send({ type: "list-rooms" });
  }

  function join(code: string, password: string): void {
    if (!code.trim()) return setError("초대코드를 입력하세요");
    setError("");
    mm.send({ type: "join-room", code: code.trim(), password: password.trim(), deck: [] });
  }

  function renderRooms(rooms: RoomSummary[]): void {
    if (rooms.length === 0) {
      listBox.replaceChildren(el("div", { class: "list-empty", text: "열린 방이 없습니다. 방을 만들어 보세요!" }));
      return;
    }
    listBox.replaceChildren(
      ...rooms.map((room) => {
        const game = gameById(room.gameId);
        const card = el("div", { class: "glass room-card" }, [
          el("div", { class: "room-icon", text: game?.icon ?? "?" }),
          el("div", { class: "room-body" }, [
            el("span", { class: "room-title", text: room.title }),
            el("span", { class: "room-meta", text: `${game?.name ?? room.gameId}${room.locked ? " · 🔒" : ""}` }),
          ]),
          el("button", { class: "btn btn-primary btn-small", text: "입장", onclick: () => onJoinRoom(room, card) }),
        ]);
        return card;
      }),
    );
  }

  function onJoinRoom(room: RoomSummary, card: HTMLElement): void {
    if (!room.locked) return join(room.code, "");
    // Locked: reveal an inline password field on this card.
    const pw = el("input", { class: "field-input" }) as HTMLInputElement;
    pw.type = "password";
    pw.placeholder = "비밀번호";
    pw.maxLength = 16;
    card.replaceChildren(
      el("div", { class: "room-icon", text: "🔒" }),
      pw,
      el("button", { class: "btn btn-primary btn-small", text: "확인", onclick: () => join(room.code, pw.value) }),
    );
    pw.focus();
    pw.onkeydown = (e) => { if (e.key === "Enter") join(room.code, pw.value); };
  }

  mm = driveMatchmaking(
    ctx,
    {
      onRoomList: (rooms) => renderRooms(rooms),
      onJoinFailed: (reason) => setError(reason),
      onError: (msg) => setError(msg),
      onOpponentLeft: () => setError("상대가 나갔습니다"),
    },
    { type: "list-rooms" },
  );

  return () => mm.cleanup();
};
