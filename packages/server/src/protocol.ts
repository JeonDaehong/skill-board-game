import type { GameMode, MatchEvent, MatchState } from "@skill/engine";
import type { Color } from "@skill/chess-core";

/** Summary of a joinable room, shown in the Join Room list. */
export interface RoomInfo {
  code: string;
  title: string;
  gameId: string;
  /** Which chess mode the room plays: classic, skill, or master. */
  mode: GameMode;
  /** True if the room requires a password to join. */
  locked: boolean;
  /** How many players are currently in the room (0–2). */
  players: number;
  /**
   * The match has already begun, so the only way in is to watch. Rooms in this
   * state are still listed — a room you cannot sit down at is exactly the room
   * you might want to watch.
   */
  live: boolean;
  /** Watchers already in, out of `MAX_SPECTATORS`. */
  spectators: number;
}

/** Where one person is sitting in a room that has not started yet. */
export type Seat = "host" | "guest" | "watcher";

/**
 * A room before the match begins: two player seats and three seats in the
 * stands, with everyone visible to everyone.
 *
 * The room used to start the instant a second person arrived, which meant
 * nobody agreed to begin and a third arrival found the room already gone from
 * the waiting list — they were bounced with "Room not found". Seats fix both:
 * people gather, and the host says when.
 */
export interface LobbyView {
  code: string;
  title: string;
  gameId: string;
  mode: GameMode;
  locked: boolean;
  timeControl: TimeControl;
  /** Display names, or absent for an empty seat / a player signed out. */
  host?: string;
  guest?: string;
  guestTaken: boolean;
  watchers: (string | undefined)[];
  /** How many the stands hold, so the client need not hardcode it. */
  watcherCap: number;
  /** Which seat this client is in. */
  you: Seat;
  /** True when the host may start: someone is in the other player seat. */
  canStart: boolean;
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

/**
 * Messages the client sends to the server. `deck` is that player's saved deck
 * for `mode` — empty in classic mode, 30 cards in skill, 50 in master. Both
 * players in a room must be playing the same mode, so it is part of the
 * matchmaking intent rather than something negotiated afterwards.
 */
export type ClientMsg =
  /**
   * Who is holding this socket. Sent once, right after connecting, and only by
   * a client that is logged in. The server checks the token against the session
   * table — the name a player sits down under is the one on their account, not
   * a string they typed into this message.
   */
  | { type: "auth"; token: string }
  // Matchmaking intents
  /**
   * `ranked` picks the queue, not just a label: a ladder match and a casual one
   * are not interchangeable opponents, so the two never match against each
   * other. Both queues run a fixed clock, which is why the client sends one.
   */
  | { type: "quickstart"; gameId: string; mode: GameMode; deck: string[]; ranked?: boolean; timeControl?: TimeControl }
  | { type: "create-room"; title: string; password?: string; gameId: string; mode: GameMode; deck: string[]; timeControl?: TimeControl }
  | { type: "list-rooms" }
  /**
   * Joining is the one intent that cannot name its own mode: the room already
   * decided that, and a code-based join has not seen the room list. So the
   * joiner offers a deck for each mode and the server takes the one that fits,
   * rather than spending a round trip asking what the room is playing.
   */
  | { type: "join-room"; code: string; password?: string; decks: Partial<Record<GameMode, string[]>> }
  /**
   * Watch a match instead of playing in it. No deck rides along: a watcher
   * never acts, so there is nothing to check. Only rooms someone created by
   * hand can be watched — a quick match pairs strangers who did not agree to
   * an audience, and there is no lobby for them to have agreed in.
   */
  | { type: "spectate"; code: string; password?: string }
  /** Move between the free player seat and the stands, before the match starts. */
  | { type: "take-seat"; seat: Seat }
  /** Host only: begin, with whoever is seated. */
  | { type: "start-match" }
  | { type: "cancel" }
  // In-match (action shape is game-specific; the room's engine interprets it)
  | { type: "action"; action: unknown }
  | { type: "rematch" };

/** Messages the server sends to a client. In-match states are per-viewer views. */
export type ServerMsg =
  | { type: "waiting" }
  | { type: "room-created"; code: string }
  /** The room's seats, resent to everyone in it whenever they change. */
  | { type: "lobby"; lobby: LobbyView }
  | { type: "room-list"; rooms: RoomInfo[] }
  | { type: "join-failed"; reason: string }
  | {
      type: "start";
      room: string;
      color: Color;
      gameId: string;
      mode: GameMode;
      timeControl: TimeControl;
      /** The opponent's account nickname; absent if they are playing signed out. */
      opponent?: string;
      /**
       * This socket is watching, not playing. `color` still says which way up
       * the board arrives, but nothing this client sends will be accepted.
       */
      spectator?: boolean;
      /** Both seats by name, for a watcher who is neither of them. */
      players?: { w?: string; b?: string };
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
      /** How many people are watching, so the players can see they have one. */
      spectators?: number;
    }
  | { type: "error"; error: string }
  /** This viewer asked for a rematch; still waiting on the opponent to agree. */
  | { type: "rematch-waiting" }
  | { type: "opponent-left" };
