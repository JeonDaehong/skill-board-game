import { el, type AppContext, type Screen } from "../router.js";
import { createRemoteSession } from "../chess/session.js";
import { mountGame } from "../chess/controller.js";
import { menuScreen } from "./menu.js";
import type { Color } from "@skill/chess-core";

const SERVER_URL = "ws://localhost:8787";

/**
 * Online lobby: connect to the server with the drafted deck, wait for a match,
 * then hand the live socket to a RemoteSession and mount the shared game view.
 */
export function makeLobby(deck: string[]): Screen {
  return (ctx: AppContext) => {
    let handedOff = false;
    let gameCleanup: (() => void) | null = null;
    let myColor: Color = "w";

    const statusLine = el("div", { class: "lobby-status", text: "서버에 연결 중…" });
    const setStatus = (t: string) => (statusLine.textContent = t);

    ctx.root.appendChild(
      el("div", { class: "screen lobby-screen" }, [
        el("h1", { class: "screen-title", text: "온라인 대전" }),
        statusLine,
        el("div", { class: "carousel-hint", text: "다른 창에서도 접속하면 매칭됩니다" }),
        el("button", { class: "back-btn", text: "← 취소", onclick: () => ctx.navigate(menuScreen) }),
      ]),
    );

    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      setStatus("서버에 연결할 수 없습니다");
      return () => {};
    }

    ws.onopen = () => {
      setStatus("매칭 대기 중…");
      ws.send(JSON.stringify({ type: "join", deck }));
    };
    ws.onerror = () => setStatus("서버에 연결할 수 없습니다 — `pnpm server` 실행이 필요합니다");
    ws.onclose = () => { if (!handedOff) setStatus("연결이 종료되었습니다"); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.type === "waiting") setStatus("상대를 기다리는 중…");
      else if (msg.type === "start") myColor = msg.color;
      else if (msg.type === "state" && !handedOff) {
        handedOff = true;
        const session = createRemoteSession(ws, myColor, msg.state);
        ctx.root.replaceChildren();
        gameCleanup = mountGame(ctx, session, () => ctx.navigate(menuScreen));
      } else if (msg.type === "error") setStatus(`오류: ${msg.error}`);
      else if (msg.type === "opponent-left") setStatus("상대가 나갔습니다");
    };

    return () => {
      if (gameCleanup) gameCleanup();
      else ws.close();
    };
  };
}
