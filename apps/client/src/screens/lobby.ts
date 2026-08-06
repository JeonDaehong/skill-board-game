import type { GameMode } from "@skill/engine";
import { el, type AppContext, type Screen } from "../router.js";
import { driveMatchmaking, wireTimeControl } from "../net.js";
import { gameById } from "../games.js";
import { deckForMatch } from "../decks.js";
import { multiScreen } from "./multi.js";
import { art, objectUrl } from "../ui/art.js";
import { getLang, gameName, modeName, t } from "../i18n.js";
import { queueControl, timeControlLabel, type QueueKind } from "../clock.js";
import { loadRank } from "../rank.js";
import { rankBadge } from "../ui/rank-badge.js";

/**
 * Quickstart lobby: connect, ask the server to auto-match us for `gameId` in
 * `mode`, then hand off to the shared game view once an opponent is found.
 *
 * The queue is per mode and per ladder — a classic player and a master player
 * are not playing the same game, let alone on the same size of board, and a
 * ranked opponent is not interchangeable with a casual one. The clock is the
 * queue's, not the player's, and is printed here so nobody finds out what they
 * signed up for only once the first move is on it.
 */
export function makeQuickLobby(gameId: string, mode: GameMode = "classic", kind: QueueKind = "normal"): Screen {
  return (ctx: AppContext) => {
    const game = gameById(gameId);
    const control = queueControl(kind);
    const statusLine = el("div", { class: "lobby-status", text: t("lobby.connecting") });
    const setStatus = (text: string): string => (statusLine.textContent = text);

    ctx.root.appendChild(
      el("div", { class: "screen lobby-screen" }, [
        el("div", { class: `glass lobby-card ${kind}` }, [
          el("div", { class: "spinner" }),
          el("h1", { class: "screen-title", text: kind === "ranked" ? t("multi.quickRanked") : t("multi.quickNormal") }),
          el("div", { class: "lobby-game" }, [
            art(objectUrl(gameId), "lobby-game-icon"),
            el("span", { text: game ? gameName(game.id) : gameId }),
            gameId === "chess" ? el("span", { class: "game-mode-chip", text: modeName(mode) }) : null,
          ]),
          el("div", { class: "lobby-clock" }, [
            el("span", { class: "lobby-clock-label", text: t("lobby.timeControl") }),
            el("span", { class: "lobby-clock-value", text: timeControlLabel(control, getLang() === "ko") }),
          ]),
          // What you are queueing to defend, so a ladder match never starts as
          // a surprise.
          kind === "ranked" ? rankBadge(loadRank(), "sm") : null,
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
      {
        type: "quickstart",
        gameId,
        mode,
        deck: deckForMatch(mode),
        ranked: kind === "ranked",
        timeControl: wireTimeControl(control),
      },
      kind === "ranked",
    );

    return () => mm.cleanup();
  };
}
