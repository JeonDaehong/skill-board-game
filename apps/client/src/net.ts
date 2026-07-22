import type { AppContext } from "./router.js";
import type { Color } from "@skill/chess-core";
import type { MatchState } from "@skill/engine";
import type { Player } from "@skill/games";
import { createRemoteSession } from "./chess/session.js";
import { mountGame } from "./chess/controller.js";
import { createRemoteBoardSession } from "./board/session.js";
import { mountBoardGame } from "./board/controller.js";
import { getView } from "./board/views.js";
import { menuScreen } from "./screens/menu.js";
import type { RoomSummary } from "./types.js";

export const SERVER_URL = "ws://localhost:8787";

/** Callbacks for the pre-game phase. All optional — screens wire what they need. */
export interface MatchmakingHandlers {
  onWaiting?: () => void;
  onRoomCreated?: (code: string) => void;
  onRoomList?: (rooms: RoomSummary[]) => void;
  onJoinFailed?: (reason: string) => void;
  onError?: (error: string) => void;
  onOpponentLeft?: () => void;
}

export interface Matchmaking {
  /** Send a raw client message over the socket (e.g. join-room after picking). */
  send: (msg: unknown) => void;
  /** Tear down: stops the game if handed off, else closes the socket. */
  cleanup: () => void;
}

/**
 * Open a socket, send an initial intent once connected, and route server
 * messages. The pre-game messages go to `handlers`; when a match actually
 * starts (first "state"), the socket is handed to a RemoteSession and the
 * shared game view is mounted — identical for quickstart / create / join.
 */
export function driveMatchmaking(
  ctx: AppContext,
  handlers: MatchmakingHandlers,
  initial: unknown,
): Matchmaking {
  let handedOff = false;
  let gameCleanup: (() => void) | null = null;
  let myColor: Color = "w";
  let gameId = "chess";

  let ws: WebSocket;
  try {
    ws = new WebSocket(SERVER_URL);
  } catch {
    handlers.onError?.("서버에 연결할 수 없습니다");
    return { send: () => {}, cleanup: () => {} };
  }

  ws.onopen = () => ws.send(JSON.stringify(initial));
  ws.onerror = () => handlers.onError?.("서버에 연결할 수 없습니다 — `pnpm server` 실행이 필요합니다");
  ws.onclose = () => { if (!handedOff) handlers.onError?.("연결이 종료되었습니다"); };

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    switch (msg.type) {
      case "waiting": handlers.onWaiting?.(); break;
      case "room-created": handlers.onRoomCreated?.(msg.code); break;
      case "room-list": handlers.onRoomList?.(msg.rooms as RoomSummary[]); break;
      case "join-failed": handlers.onJoinFailed?.(msg.reason); break;
      case "start": myColor = msg.color; gameId = msg.gameId ?? "chess"; break;
      case "state":
        if (!handedOff) {
          handedOff = true;
          ctx.root.replaceChildren();
          if (gameId === "chess") {
            const session = createRemoteSession(ws, myColor, msg.state as MatchState);
            gameCleanup = mountGame(ctx, session, () => ctx.navigate(menuScreen));
          } else {
            const view = getView(gameId, myColor as Player);
            const session = createRemoteBoardSession(ws, myColor as Player, msg.state);
            if (view) gameCleanup = mountBoardGame(ctx, gameId, session, view, () => ctx.navigate(menuScreen));
          }
        }
        break;
      case "error": handlers.onError?.(msg.error); break;
      case "opponent-left": handlers.onOpponentLeft?.(); break;
    }
  };

  return {
    send: (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    cleanup: () => { if (gameCleanup) gameCleanup(); else ws.close(); },
  };
}
