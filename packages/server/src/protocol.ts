import type { Action, MatchEvent, MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";

/** Messages the client sends to the server. */
export type ClientMsg =
  | { type: "join"; deck: string[]; room?: string }
  | { type: "action"; action: Action };

/** Messages the server sends to a client. Always a per-viewer filtered view. */
export type ServerMsg =
  | { type: "waiting" }
  | { type: "start"; room: string; color: Color }
  | {
      type: "state";
      /** Filtered MatchState for this viewer (opponent deck / cloak hidden). */
      state: MatchState;
      events: MatchEvent[];
      turn: Color;
      status: MatchState["status"];
      winner: MatchState["winner"];
    }
  | { type: "error"; error: string }
  | { type: "opponent-left" };
