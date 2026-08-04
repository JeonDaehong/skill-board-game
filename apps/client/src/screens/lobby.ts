import { el, type AppContext, type Screen } from "../router.js";
import { driveMatchmaking, wireTimeControl } from "../net.js";
import { gameById } from "../games.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";
import { gameName, t } from "../i18n.js";

/**
 * Quickstart lobby: connect, ask the server to auto-match us for `gameId`,
 * then hand off to the shared game view once an opponent is found.
 */
export function makeQuickLobby(gameId: string): Screen {
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
      { type: "quickstart", gameId, deck: [], timeControl: wireTimeControl() },
    );

    return () => mm.cleanup();
  };
}
