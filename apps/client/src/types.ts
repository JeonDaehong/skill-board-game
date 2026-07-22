/** A joinable room as summarized by the server's room-list message. */
export interface RoomSummary {
  code: string;
  title: string;
  gameId: string;
  locked: boolean;
  players: number;
}
