import { el, type AppContext, type Screen } from "../router.js";
import { gameById } from "../games.js";
import { driveMatchmaking, type Matchmaking } from "../net.js";
import type { RoomSummary } from "../types.js";
import { allDecksForMatch } from "../decks.js";
import { multiScreen } from "./multi.js";
import { art, icon, objectUrl } from "../ui/art.js";
import { gameName, modeName, t, tPassthrough } from "../i18n.js";

/**
 * Join Room: browse the server's open rooms and join one (password prompt if
 * locked), or type an invite code directly. Joining hands off to the game view
 * once the host's match starts.
 */
export const joinRoomScreen: Screen = (ctx: AppContext) => {
  let mm: Matchmaking;

  const codeInput = el("input", { class: "field-input" }) as HTMLInputElement;
  codeInput.placeholder = t("room.inviteCodePlaceholder");
  codeInput.maxLength = 8;
  const codePw = el("input", { class: "field-input" }) as HTMLInputElement;
  codePw.placeholder = t("room.passwordIfAny");
  codePw.maxLength = 16;

  const errorLine = el("div", { class: "form-error" });
  const listBox = el("div", { class: "room-list", text: "" });

  ctx.root.appendChild(
    el("div", { class: "screen join-screen" }, [
      el("button", { class: "btn btn-ghost corner", text: t("common.back"), onclick: () => ctx.navigate(multiScreen) }),
      el("h1", { class: "screen-title", text: t("multi.join") }),
      el("div", { class: "glass form-card" }, [
        el("label", { class: "field-label", text: t("room.joinByCode") }),
        el("div", { class: "code-join-row" }, [codeInput, codePw]),
        el("button", {
          class: "btn btn-primary btn-block",
          text: t("common.join"),
          onclick: () => join(codeInput.value, codePw.value),
        }),
      ]),
      el("div", { class: "list-head" }, [
        el("span", { class: "field-label", text: t("room.openRooms") }),
        el("button", { class: "btn btn-ghost btn-small", text: t("room.refresh"), onclick: () => refresh() }),
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
    if (!code.trim()) return setError(t("room.needCode"));
    setError("");
    // We do not know the room's mode yet, so offer every deck and let the
    // server pick the one that matches.
    mm.send({ type: "join-room", code: code.trim(), password: password.trim(), decks: allDecksForMatch() });
  }

  function renderRooms(rooms: RoomSummary[]): void {
    if (rooms.length === 0) {
      listBox.replaceChildren(el("div", { class: "list-empty", text: t("room.none") }));
      return;
    }
    listBox.replaceChildren(
      ...rooms.map((room) => {
        const game = gameById(room.gameId);
        const card = el("div", { class: "glass room-card" }, [
          art(objectUrl(room.gameId), "room-icon"),
          el("div", { class: "room-body" }, [
            el("span", { class: "room-title", text: room.title }),
            el("span", { class: "room-meta" }, [
              el("span", { text: game ? gameName(game.id) : room.gameId }),
              room.gameId === "chess" ? el("span", { class: "game-mode-chip", text: modeName(room.mode) }) : null,
              room.locked ? el("span", { text: "🔒" }) : null,
            ]),
          ]),
          el("button", { class: "btn btn-primary btn-small", text: t("common.join"), onclick: () => onJoinRoom(room, card) }),
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
    pw.placeholder = t("common.password");
    pw.maxLength = 16;
    card.replaceChildren(
      icon("locked", "room-icon"),
      pw,
      el("button", { class: "btn btn-primary btn-small", text: t("common.ok"), onclick: () => join(room.code, pw.value) }),
    );
    pw.focus();
    pw.onkeydown = (e) => { if (e.key === "Enter") join(room.code, pw.value); };
  }

  mm = driveMatchmaking(
    ctx,
    {
      onRoomList: (rooms) => renderRooms(rooms),
      onJoinFailed: (reason) => setError(tPassthrough(reason)),
      onError: (msg) => setError(msg),
      onOpponentLeft: () => setError(t("game.oppLeft")),
    },
    { type: "list-rooms" },
  );

  return () => mm.cleanup();
};
