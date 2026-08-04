import type { MatchEvent, MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";

/** Summary of a joinable room, shown in the Join Room list. */
export interface RoomInfo {
  code: string;
  title: string;
  gameId: string;
  /** True if the room requires a password to join. */
  locked: boolean;
  /** How many players are currently in the room (0–2). */
  players: number;
}

/** Main clocks, in ms remaining. The server owns these; clients only display
 *  them. Online play uses increment controls, so there is no byoyomi field. */
export interface Clocks {
  w: number;
  b: number;
}

/** Fischer control: a main budget plus a per-move bonus. Both 0 = untimed. */
export interface TimeControl {
  mainMs: number;
  incrementMs: number;
}

/** Messages the client sends to the server. `deck` is the drafted card list
 *  (empty for now — the skill/card system is being reworked). */
export type ClientMsg =
  // Matchmaking intents
  | { type: "quickstart"; gameId: string; deck: string[]; timeControl?: TimeControl }
  | { type: "create-room"; title: string; password?: string; gameId: string; deck: string[]; timeControl?: TimeControl }
  | { type: "list-rooms" }
  | { type: "join-room"; code: string; password?: string; deck: string[] }
  | { type: "cancel" }
  // In-match (action shape is game-specific; the room's engine interprets it)
  | { type: "action"; action: unknown }
  | { type: "rematch" };

/** Messages the server sends to a client. In-match states are per-viewer views. */
export type ServerMsg =
  | { type: "waiting" }
  | { type: "room-created"; code: string }
  | { type: "room-list"; rooms: RoomInfo[] }
  | { type: "join-failed"; reason: string }
  | {
      type: "start";
      room: string;
      color: Color;
      gameId: string;
      timeControl: TimeControl;
    }
  | {
      type: "state";
      /** Per-viewer game state (chess = filtered MatchState; others = board). */
      state: unknown;
      events: MatchEvent[];
      turn: Color;
      status: MatchState["status"];
      winner: MatchState["winner"];
      /** Omitted for untimed rooms. */
      clocks?: Clocks;
    }
  | { type: "error"; error: string }
  /** This viewer asked for a rematch; still waiting on the opponent to agree. */
  | { type: "rematch-waiting" }
  | { type: "opponent-left" };
