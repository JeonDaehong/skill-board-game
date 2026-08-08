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
import type { LobbyView, RoomSummary } from "./types.js";
import { getTimeControlId, timeControlById, type TimeControl } from "./clock.js";
import { t } from "./i18n.js";
import { SERVER_URL } from "./config.js";
import { authToken } from "./account.js";

export { SERVER_URL } from "./config.js";

/** The wire form the server speaks: a Fischer main + increment pair. */
export interface WireTimeControl {
  mainMs: number;
  incrementMs: number;
}

/**
 * What a room should be clocked at, in the server's shape. Defaults to the
 * player's saved choice, which is what a room they create should run on; a
 * quick match passes the queue's own fixed control instead.
 */
export function wireTimeControl(tc: TimeControl = timeControlById(getTimeControlId())): WireTimeControl {
  // Byoyomi has no wire form; online rooms are Fischer, so the period rides
  // along as an increment — the closest control the server can actually run.
  return { mainMs: tc.mainMs, incrementMs: tc.stepMs };
}

/** Turn the server's announced control back into a local one for display. */
function fromWire(w: WireTimeControl): TimeControl {
  const mins = Math.round(w.mainMs / 60_000);
  return {
    id: "room",
    name: ["Room clock", "방 시간 설정"],
    short: w.mainMs === 0 && w.incrementMs === 0 ? "∞" : `${mins}+${w.incrementMs / 1000}`,
    mainMs: w.mainMs,
    stepMs: w.incrementMs,
    mode: "increment",
  };
}

/** Callbacks for the pre-game phase. All optional — screens wire what they need. */
export interface MatchmakingHandlers {
  onWaiting?: () => void;
  onRoomCreated?: (code: string) => void;
  /** The room's seating, resent whenever anyone moves. */
  onLobby?: (lobby: LobbyView) => void;
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
  /** Ladder match: the game view reports its result to the rank when it ends. */
  ranked = false,
): Matchmaking {
  let handedOff = false;
  let gameCleanup: (() => void) | null = null;
  let myColor: Color = "w";
  let gameId = "chess";
  /** The opponent's account name, when they are playing signed in. */
  let opponentName: string | undefined;
  /** Watching rather than playing: the server said so on `start`. */
  let spectator = false;
  let seatNames: { w?: string; b?: string } | undefined;
  // The room's clock is the server's to set — the host picked it, and for a
  // quick match whoever was queued first did. Mirror whatever it announces.
  let control: TimeControl = timeControlById(getTimeControlId());

  let ws: WebSocket;
  try {
    ws = new WebSocket(SERVER_URL);
  } catch {
    handlers.onError?.(t("net.unreachable"));
    return { send: () => {}, cleanup: () => {} };
  }

  ws.onopen = () => {
    // Identify before asking for a match, so the room knows whose nickname to
    // show the opponent. Fire and forget: the server accepts an anonymous
    // socket, it just cannot name it.
    const token = authToken();
    if (token) ws.send(JSON.stringify({ type: "auth", token }));
    ws.send(JSON.stringify(initial));
  };
  ws.onerror = () => handlers.onError?.(t("net.unreachableHint"));
  ws.onclose = () => { if (!handedOff) handlers.onError?.(t("net.closed")); };

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    switch (msg.type) {
      case "waiting": handlers.onWaiting?.(); break;
      case "room-created": handlers.onRoomCreated?.(msg.code); break;
      case "lobby": handlers.onLobby?.(msg.lobby as LobbyView); break;
      case "room-list": handlers.onRoomList?.(msg.rooms as RoomSummary[]); break;
      case "join-failed": handlers.onJoinFailed?.(msg.reason); break;
      case "start":
        myColor = msg.color;
        gameId = msg.gameId ?? "chess";
        opponentName = typeof msg.opponent === "string" ? msg.opponent : undefined;
        spectator = msg.spectator === true;
        seatNames = spectator ? (msg.players as { w?: string; b?: string } | undefined) : undefined;
        if (msg.timeControl) control = fromWire(msg.timeControl);
        break;
      case "state":
        if (!handedOff) {
          handedOff = true;
          ctx.root.replaceChildren();
          if (gameId === "chess") {
            const session = createRemoteSession(ws, myColor, msg.state as MatchState);
            gameCleanup = mountGame(ctx, session, () => ctx.navigate(menuScreen), control, {
              // A watched match is never the watcher's ladder game, whatever
              // the two people playing it are doing.
              ranked: ranked && !spectator,
              opponentName,
              spectator,
              players: seatNames,
            });
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
