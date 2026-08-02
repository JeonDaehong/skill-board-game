import { el, type AppContext, type Screen } from "../router.js";
import { driveMatchmaking } from "../net.js";
import { gameById } from "../games.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";

/**
 * Quickstart lobby: connect, ask the server to auto-match us for `gameId`,
 * then hand off to the shared game view once an opponent is found.
 */
export function makeQuickLobby(gameId: string): Screen {
  return (ctx: AppContext) => {
    const game = gameById(gameId);
    const statusLine = el("div", { class: "lobby-status", text: "Connecting…" });
    const setStatus = (t: string) => (statusLine.textContent = t);

    ctx.root.appendChild(
      el("div", { class: "screen lobby-screen" }, [
        el("div", { class: "glass lobby-card" }, [
          el("div", { class: "spinner" }),
          el("h1", { class: "screen-title", text: "Quick Match" }),
          el("div", { class: "lobby-game" }, [
            art(objectUrl(gameId), "lobby-game-icon"),
            el("span", { text: game?.name ?? gameId }),
          ]),
          statusLine,
          el("div", { class: "carousel-hint", text: "Matching you with another player in the same game" }),
          el("button", { class: "btn btn-ghost", text: "← Cancel", onclick: () => ctx.navigate(multiScreen) }),
        ]),
      ]),
    );

    const mm = driveMatchmaking(
      ctx,
      {
        onWaiting: () => setStatus("Waiting for an opponent…"),
        onError: (msg) => setStatus(msg),
        onOpponentLeft: () => setStatus("Opponent left"),
      },
      { type: "quickstart", gameId, deck: [] },
    );

    return () => mm.cleanup();
  };
}
