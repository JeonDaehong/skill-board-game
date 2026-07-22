import { el, type AppContext, type Screen } from "../router.js";
import { driveMatchmaking } from "../net.js";
import { gameById } from "../games.js";
import { multiScreen } from "./multi.js";

/**
 * Quickstart lobby: connect, ask the server to auto-match us for `gameId`,
 * then hand off to the shared game view once an opponent is found.
 */
export function makeQuickLobby(gameId: string): Screen {
  return (ctx: AppContext) => {
    const game = gameById(gameId);
    const statusLine = el("div", { class: "lobby-status", text: "서버에 연결 중…" });
    const setStatus = (t: string) => (statusLine.textContent = t);

    ctx.root.appendChild(
      el("div", { class: "screen lobby-screen" }, [
        el("div", { class: "glass lobby-card" }, [
          el("div", { class: "spinner" }),
          el("h1", { class: "screen-title", text: "퀵스타트" }),
          el("div", { class: "lobby-game", text: `${game?.icon ?? ""} ${game?.name ?? gameId}` }),
          statusLine,
          el("div", { class: "carousel-hint", text: "같은 게임으로 접속한 다른 플레이어와 매칭됩니다" }),
          el("button", { class: "btn btn-ghost", text: "← 취소", onclick: () => ctx.navigate(multiScreen) }),
        ]),
      ]),
    );

    const mm = driveMatchmaking(
      ctx,
      {
        onWaiting: () => setStatus("상대를 기다리는 중…"),
        onError: (msg) => setStatus(msg),
        onOpponentLeft: () => setStatus("상대가 나갔습니다"),
      },
      { type: "quickstart", gameId, deck: [] },
    );

    return () => mm.cleanup();
  };
}
