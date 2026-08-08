import { el } from "../router.js";
import type { LobbyView } from "../types.js";
import { gameById } from "../games.js";
import { art, objectUrl } from "../ui/art.js";
import { gameName, modeName, t } from "../i18n.js";

/**
 * The room before it starts: two player seats, three seats in the stands, and
 * everyone in the room able to see who is where.
 *
 * Both ways into a room end up here — the host arrives by creating it and
 * everyone else by joining — so the view lives in one place rather than once
 * per screen. The room used to start the instant a second person arrived, which
 * meant a third arrival found it already gone and got "Room not found"; seats
 * mean people gather first and the host says when.
 */
export interface LobbyActions {
  takeSeat: (seat: "guest" | "watcher") => void;
  start: () => void;
  leave: () => void;
}

function seatCard(opts: {
  label: string;
  name?: string;
  kind: "player" | "watch";
  you: boolean;
  onclick?: () => void;
}): HTMLElement {
  const filled = !!opts.name;
  const card = el("div", {
    class: [
      "seat-slot",
      opts.kind === "watch" ? "watch" : "player",
      filled ? "filled" : "open",
      opts.you ? "you" : "",
      opts.onclick ? "takeable" : "",
    ].filter(Boolean).join(" "),
  }, [
    el("span", { class: "seat-role", text: opts.label }),
    el("span", { class: "seat-name", text: opts.name ?? t("lobby.seatEmpty") }),
    opts.you ? el("span", { class: "seat-you", text: t("lobby.you") }) : null,
  ]);
  if (opts.onclick) card.onclick = opts.onclick;
  return card;
}

/** Paint the room into `container`. Called again on every seating change. */
export function renderRoomLobby(
  container: HTMLElement,
  lobby: LobbyView,
  actions: LobbyActions,
  note = "",
): void {
  const game = gameById(lobby.gameId);
  const isHost = lobby.you === "host";

  const codeBox = el("div", { class: "invite-code", text: lobby.code || "—" });
  const copyBtn = el("button", {
    class: "btn btn-ghost btn-small",
    text: t("room.copy"),
    onclick: () => {
      if (!lobby.code) return;
      navigator.clipboard?.writeText(lobby.code).then(() => (copyBtn.textContent = t("room.copied")), () => {});
    },
  });

  // An empty seat you could move into is clickable; your own is not, and
  // neither is one somebody else is in.
  const canSit = !isHost && lobby.you !== "guest" && !lobby.guestTaken;
  const seats = el("div", { class: "seat-grid" }, [
    seatCard({ label: t("lobby.seatHost"), name: lobby.host ?? t("lobby.anon"), kind: "player", you: isHost }),
    seatCard({
      label: t("lobby.seatGuest"),
      name: lobby.guestTaken ? lobby.guest ?? t("lobby.anon") : undefined,
      kind: "player",
      you: lobby.you === "guest",
      onclick: canSit ? () => actions.takeSeat("guest") : undefined,
    }),
  ]);

  const watchRow = el("div", { class: "seat-grid watch-grid" },
    Array.from({ length: lobby.watcherCap }, (_, i) => {
      const taken = i < lobby.watchers.length;
      // Which of the watchers is us is not on the wire, so the seat we mark as
      // ours is the first free one only when we are in fact in the stands.
      const mine = lobby.you === "watcher" && i === lobby.watchers.length - 1;
      return seatCard({
        label: t("lobby.seatWatch"),
        name: taken ? lobby.watchers[i] ?? t("lobby.anon") : undefined,
        kind: "watch",
        you: mine,
        onclick:
          !taken && !isHost && lobby.you !== "watcher" ? () => actions.takeSeat("watcher") : undefined,
      });
    }),
  );

  const controls: (Node | null)[] = [];
  if (isHost) {
    const startBtn = el("button", {
      class: "btn btn-primary",
      text: t("lobby.start"),
      onclick: () => { if (lobby.canStart) actions.start(); },
    }) as HTMLButtonElement;
    startBtn.disabled = !lobby.canStart;
    controls.push(startBtn);
  } else if (lobby.you === "guest") {
    controls.push(el("button", { class: "btn btn-ghost", text: t("lobby.toStands"), onclick: () => actions.takeSeat("watcher") }));
  } else if (!lobby.guestTaken) {
    controls.push(el("button", { class: "btn btn-primary", text: t("lobby.toSeat"), onclick: () => actions.takeSeat("guest") }));
  }
  controls.push(el("button", { class: "btn btn-ghost", text: t("room.leave"), onclick: () => actions.leave() }));

  container.replaceChildren(
    el("h1", { class: "screen-title", text: lobby.title || t("room.waitingTitle") }),
    el("div", { class: "glass lobby-card room-lobby" }, [
      el("div", { class: "lobby-game" }, [
        art(objectUrl(lobby.gameId), "lobby-game-icon"),
        el("span", { text: game ? gameName(game.id) : lobby.gameId }),
        lobby.gameId === "chess" ? el("span", { class: "game-mode-chip", text: modeName(lobby.mode) }) : null,
        lobby.locked ? el("span", { text: "🔒" }) : null,
      ]),
      el("div", { class: "field-label center", text: t("room.inviteCode") }),
      el("div", { class: "invite-row" }, [codeBox, copyBtn]),
      el("div", { class: "field-label center", text: t("lobby.players") }),
      seats,
      el("div", { class: "field-label center", text: t("lobby.stands") }),
      watchRow,
      el("div", { class: "lobby-status", text: note || (isHost
        ? lobby.canStart ? t("lobby.readyHost") : t("lobby.needGuest")
        : t("lobby.waitHost")) }),
      el("div", { class: "lobby-controls" }, controls),
    ]),
  );
}
