import type { GameMode } from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { driveMatchmaking, wireTimeControl } from "../net.js";
import { gameById } from "../games.js";
import { deckForMatch } from "../decks.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";
import { gameName, modeName, t } from "../i18n.js";

/**
 * Quickstart lobby: connect, ask the server to auto-match us for `gameId` in
 * `mode`, then hand off to the shared game view once an opponent is found.
 * The queue is per mode — a classic player and a master player are not playing
 * the same game, let alone on the same size of board.
 */
export function makeQuickLobby(gameId: string, mode: GameMode = "classic"): Screen {
  return (ctx: AppContext) => {
    const game = gameById(gameId);
    const statusLine = el("div", { class: "lobby-status", text: t("lobby.connecting") });
    const setStatus = (t: string) => (statusLine.textContent = t);

    ctx.root.appendChild(
      el("div", { class: "screen lobby-screen" }, [
        el("div", { class: "glass lobby-card" }, [
          el("div", { class: "spinner" }),
          el("h1", { class: "screen-title", text: t("multi.quick") }),
          el("div", { class: "lobby-game" }, [
            art(objectUrl(gameId), "lobby-game-icon"),
            el("span", { text: game ? gameName(game.id) : gameId }),
            gameId === "chess" ? el("span", { class: "game-mode-chip", text: modeName(mode) }) : null,
          ]),
          statusLine,
          el("div", { class: "carousel-hint", text: t("lobby.hint") }),
          el("button", { class: "btn btn-ghost", text: t("common.cancel"), onclick: () => ctx.navigate(multiScreen) }),
        ]),
      ]),
    );

    const mm = driveMatchmaking(
      ctx,
      {
        onWaiting: () => setStatus(t("lobby.waiting")),
        onError: (msg) => setStatus(msg),
        onOpponentLeft: () => setStatus(t("game.oppLeft")),
      },
      // Whoever reaches the queue first sets the clock; the server keeps theirs.
      { type: "quickstart", gameId, mode, deck: deckForMatch(mode), timeControl: wireTimeControl() },
    );

    return () => mm.cleanup();
  };
}
