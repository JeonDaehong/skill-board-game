import type { GameMode } from "@skill/engine";

/** A joinable room as summarized by the server's room-list message. */
export interface RoomSummary {
  code: string;
  title: string;
  gameId: string;
  /** Which chess mode the room plays — it decides which deck you bring. */
  mode: GameMode;
  locked: boolean;
  players: number;
}
