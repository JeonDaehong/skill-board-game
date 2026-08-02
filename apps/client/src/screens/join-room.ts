import { el, type AppContext, type Screen } from "../router.js";
import { gameById } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import type { RoomSummary } from "../types.js";
import { multiScreen } from "./multi.js";
import { art, icon, objectUrl } from "../ui/art.js";

/**
 * Join Room: browse the server's open rooms and join one (password prompt if
 * locked), or type an invite code directly. Joining hands off to the game view
 * once the host's match starts.
 */
export const joinRoomScreen: Screen = (ctx: AppContext) => {
  let mm: Matchmaking;

  const codeInput = el("input", { class: "field-input" }) as HTMLInputElement;
  codeInput.placeholder = "Invite code";
  codeInput.maxLength = 8;
  const codePw = el("input", { class: "field-input" }) as HTMLInputElement;
  codePw.placeholder = "Password (if any)";
  codePw.maxLength = 16;

  const errorLine = el("div", { class: "form-error" });
  const listBox = el("div", { class: "room-list", text: "" });

  ctx.root.appendChild(
    el("div", { class: "screen join-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: "← Back", onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: "Join Room" }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: "Join with an invite code" }),
        el("div", { class: "code-join-row" }, [codeInput, codePw]),
        el("button", {
          class: "btn btn-primary btn-block",
          text: "Join",
          onclick: () => join(codeInput.value, codePw.value),
        }),
      ]),
      el("div", { class: "list-head" }, [
        el("span", { class: "field-label", text: "Open rooms" }),
        el("button", { class: "btn btn-ghost btn-small", text: "Refresh", onclick: () => refresh() }),
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
    if (!code.trim()) return setError("Enter an invite code");
    setError("");
    mm.send({ type: "join-room", code: code.trim(), password: password.trim(), deck: [] });
  }

  function renderRooms(rooms: RoomSummary[]): void {
    if (rooms.length === 0) {
      listBox.replaceChildren(el("div", { class: "list-empty", text: "No open rooms. Try creating one!" }));
      return;
    }
    listBox.replaceChildren(
      ...rooms.map((room) => {
        const game = gameById(room.gameId);
        const card = el("div", { class: "glass room-card" }, [
          art(objectUrl(room.gameId), "room-icon"),
          el("div", { class: "room-body" }, [
            el("span", { class: "room-title", text: room.title }),
            el("span", { class: "room-meta", text: `${game?.name ?? room.gameId}${room.locked ? " · 🔒" : ""}` }),
          ]),
          el("button", { class: "btn btn-primary btn-small", text: "Join", onclick: () => onJoinRoom(room, card) }),
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
    pw.placeholder = "Password";
    pw.maxLength = 16;
    card.replaceChildren(
      icon("locked", "room-icon"),
      pw,
      el("button", { class: "btn btn-primary btn-small", text: "OK", onclick: () => join(room.code, pw.value) }),
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
      onOpponentLeft: () => setError("Opponent left"),
    },
    { type: "list-rooms" },
  );

  return () => mm.cleanup();
};
