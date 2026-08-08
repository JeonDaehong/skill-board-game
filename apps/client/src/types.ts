import type { GameMode } from "@skill/engine";

/** A joinable room as summarized by the server's room-list message. */
/** How many people one room lets watch. Mirrors the server's own cap. */
export const MAX_SPECTATORS = 3;

/** Where one person is sitting in a room that has not started. */
export type Seat = "host" | "guest" | "watcher";

/** The seating of a room before the match begins, as the server reports it. */
export interface LobbyView {
  code: string;
  title: string;
  gameId: string;
  mode: GameMode;
  locked: boolean;
  timeControl: { mainMs: number; incrementMs: number };
  host?: string;
  guest?: string;
  guestTaken: boolean;
  watchers: (string | undefined)[];
  watcherCap: number;
  you: Seat;
  canStart: boolean;
}

export interface RoomSummary {
  code: string;
  title: string;
  gameId: string;
  /** Which chess mode the room plays — it decides which deck you bring. */
  mode: GameMode;
  locked: boolean;
  players: number;
  /** The match is under way: the only way in is to watch it. */
  live: boolean;
  /** Watchers already in, out of the three a room allows. */
  spectators: number;
}
