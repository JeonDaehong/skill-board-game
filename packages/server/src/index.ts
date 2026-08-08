import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { handleApi, isApiRequest } from "./api.js";
import { accountForToken, sweepSessions } from "./db.js";
import { hasClient, serveClient } from "./static.js";
import {
  GAME_MODES,
  checkDeck as checkDeckRules,
  describeDeckError,
  type GameMode,
  type MatchEvent,
} from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { makeEngine, type RoomEngine } from "./engine-adapter.js";
import type { ClientMsg, Clocks, RoomInfo, Seat, ServerMsg, TimeControl } from "./protocol.js";

interface Player {
  ws: WebSocket;
  deck: string[];
  /**
   * Answered the most recent heartbeat ping. Cleared just before each ping goes
   * out, so a socket still false on the following round has missed a full cycle
   * and is treated as gone.
   */
  alive: boolean;
  /** Account id, once the socket has presented a valid token. */
  accountId?: number;
  /** The account's nickname, shown to the opponent when a match starts. */
  nickname?: string;
  gameId?: string;
  mode?: GameMode;
  color?: Color;
  /** Time control this player asked for; the host's / first-queued wins. */
  timeControl?: TimeControl;
  /** Code of the active match this player is in, if any. */
  roomId?: string;
  /** Code of the not-yet-started room this player is hosting, if any. */
  hosting?: string;
  /** Code of the not-yet-started room this player is sitting in, if any. */
  inLobby?: string;
  /**
   * A deck per mode, offered on the way in. Kept because a watcher may later
   * move into the player seat, and the room's mode decides which one counts —
   * asking again at that point would be a round trip for something already sent.
   */
  decks?: Partial<Record<GameMode, string[]>>;
  /**
   * Code of the room this socket is *watching*. Deliberately not `roomId`:
   * that field means "is one of the two people playing", and the close path
   * tears the whole room down when it is set. A watcher leaving must not end
   * anyone's game.
   */
  watching?: string;
}

/**
 * A created room, before anyone has started. Two player seats and three in the
 * stands, and it stays here until the host says go — a room that began the
 * moment a second person arrived started matches nobody agreed to, and left a
 * third arrival clicking Join on a room that had already left this map.
 */
interface WaitingRoom {
  code: string;
  gameId: string;
  mode: GameMode;
  title: string;
  password?: string;
  timeControl: TimeControl;
  host: Player;
  /** The other player seat, empty until somebody takes it. */
  guest?: Player;
  watchers: Player[];
}

/**
 * A room's clock. Server-owned: a client that flagged its own opponent would
 * be trusting its own lag, and a client that flagged itself would simply not.
 * Time is charged from wall-clock deltas, and a timer is armed for exactly the
 * running side's remaining time so a flag lands even if nobody sends anything.
 */
interface RoomClock {
  control: TimeControl;
  left: Clocks;
  running: Color;
  /** `Date.now()` when the running side's current charge window opened. */
  since: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** An active match between two connected players. */
interface Room {
  code: string;
  gameId: string;
  mode: GameMode;
  title: string;
  engine: RoomEngine;
  conns: { w: Player; b: Player };
  /** Per-side rematch requests; both true → a fresh match starts. */
  rematch: { w: boolean; b: boolean };
  /** null for an untimed room. */
  clock: RoomClock | null;
  /** Watchers, oldest first. Never more than `MAX_SPECTATORS`. */
  spectators: Player[];
  /**
   * Whether anyone may watch this at all. Only rooms someone created by hand
   * are open to it: a quick match puts two strangers together who never agreed
   * to an audience, and neither of them can see who walked in.
   */
  spectatable: boolean;
  /** The host's password, still enforced for watchers on a locked room. */
  password?: string;
}

/**
 * Games that are actually released. Janggi and gomoku are shown as coming-soon
 * in the client (`playable: false` in apps/client/src/games.ts) so it will not
 * ask for them — but the socket is public, so the gate lives here as well. Add
 * the ids here when those games launch; their engines are already wired up in
 * engine-adapter.ts, so that is the only change this file needs.
 */
const RELEASED_GAMES = new Set(["chess"]);

/**
 * How many people may watch one room.
 *
 * The cap is not about server load — three more sockets is nothing. It is that
 * every watcher is another copy of the position going out on every action, and
 * a room with an audience of strangers is a different thing from a room two
 * friends opened.
 */
const MAX_SPECTATORS = 3;

/** Used when a client asks for no particular clock: FIDE rapid, 15+10. */
const DEFAULT_TIME_CONTROL: TimeControl = { mainMs: 15 * 60_000, incrementMs: 10_000 };
/** Guard rails on a client-supplied control — 12h main, 5min increment. */
const MAX_MAIN_MS = 12 * 60 * 60_000;
const MAX_INCREMENT_MS = 5 * 60_000;

/**
 * How often every open socket is pinged, and — because a socket gets exactly
 * one interval to answer — how long a dead one takes to notice.
 *
 * A match sends nothing between moves: the clock is server-side and only rides
 * along with `state`, so a player thinking for two minutes leaves the socket
 * completely idle. Anything in the path is free to reclaim an idle connection
 * (Cloudflare, a home router's NAT table, a mobile carrier), and with no
 * traffic in either direction neither end would find out until someone finally
 * moved into a socket that had been dead for minutes. The ping keeps the
 * connection warm and doubles as the dead-peer check.
 *
 * Browsers answer a ping frame with a pong on their own, so nothing on the
 * client has to take part in this.
 */
const HEARTBEAT_MS = 30_000;

const rooms = new Map<string, Room>();
const waitingRooms = new Map<string, WaitingRoom>();
/**
 * `gameId:mode` → the first player waiting. Mode is part of the key because a
 * classic player and a master player cannot be paired: they would not even be
 * playing on the same size of board.
 */
const quickQueues = new Map<string, Player>();

/** Ranked and casual are separate queues, so they can never match each other. */
const queueKey = (gameId: string, mode: GameMode, ranked: boolean): string =>
  `${gameId}:${mode}:${ranked ? "ranked" : "normal"}`;

const PORT = Number(process.env.PORT ?? 8787);

/**
 * One port serves both halves of the server: the account API over HTTP and the
 * match socket over the upgrade on the same listener. Two ports would be two
 * firewall rules, two certificates and two URLs for the client to get wrong.
 */
const http = createServer((req, res) => {
  if (isApiRequest(req)) return void handleApi(req, res);
  if (hasClient) return serveClient(req, res);
  res.writeHead(404, { "Content-Type": "text/plain" }).end("skill-server");
});
const wss = new WebSocketServer({ server: http });

sweepSessions();
http.listen(PORT, () => {
  console.log(`[skill-server] socket ws://localhost:${PORT}  ·  api http://localhost:${PORT}/api`);
  if (hasClient) console.log("[skill-server] serving the built client from this port too");
});

/** Every live socket, so the heartbeat has something to walk. */
const connections = new Set<Player>();

wss.on("connection", (ws) => {
  const player: Player = { ws, deck: [], alive: true };
  connections.add(player);
  ws.on("pong", () => {
    player.alive = true;
  });
  ws.on("message", (data) => {
    try {
      handle(player, JSON.parse(data.toString()) as ClientMsg);
    } catch {
      send(ws, { type: "error", error: "malformed message" });
    }
  });
  ws.on("close", () => {
    connections.delete(player);
    onClose(player);
  });
});

const heartbeat = setInterval(() => {
  for (const player of connections) {
    // Missed a full cycle. `terminate` fires "close", which is what actually
    // clears the queues and tells the opponent — so this needs no cleanup of
    // its own, and a socket dying quietly ends up on the same path as one the
    // player closed themselves.
    if (!player.alive) {
      player.ws.terminate();
      continue;
    }
    if (!isOpen(player)) continue; // mid-close; "close" is already coming
    player.alive = false;
    player.ws.ping();
  }
}, HEARTBEAT_MS);
/** The listener is what should hold the process open, not this timer. */
heartbeat.unref();
wss.on("close", () => clearInterval(heartbeat));

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(player: Player, msg: ClientMsg): void {
  switch (msg.type) {
    case "auth": return authenticate(player, msg.token);
    case "quickstart": return quickstart(player, msg.gameId, msg.mode, msg.deck, !!msg.ranked, msg.timeControl);
    case "create-room": return createRoom(player, msg);
    case "list-rooms": return listRooms(player);
    case "join-room": return joinRoom(player, msg);
    case "spectate": return spectate(player, msg);
    case "take-seat": return takeSeat(player, msg.seat);
    case "start-match": return startFromLobby(player);
    case "cancel": return cancel(player);
    case "action": return act(player, msg.action);
    case "rematch": return rematch(player);
  }
}

/**
 * Attach an account to this socket. A bad or expired token is not an error the
 * player has to act on — it just means the socket stays anonymous, and the
 * account API will tell the client to log in again on its next call.
 */
function authenticate(player: Player, token: unknown): void {
  if (typeof token !== "string") return;
  const account = accountForToken(token);
  if (!account) return;
  player.accountId = account.id;
  player.nickname = account.nickname;
}

// ── matchmaking ──────────────────────────────────────────────

/**
 * A deck is checked against the mode it will be played in — size, copy limits
 * and whether piece cards are allowed all differ between the three. The client
 * enforces the same rules in its builder, but the socket is public.
 */
function checkDeck(player: Player, mode: GameMode, deck: string[]): boolean {
  if (!Array.isArray(deck)) {
    send(player.ws, { type: "error", error: "deck must be a list of card ids" });
    return false;
  }
  const res = checkDeckRules(mode, deck);
  if (!res.ok) {
    send(player.ws, { type: "error", error: `illegal deck: ${describeDeckError(res.errors[0]!)}` });
    return false;
  }
  return true;
}

/** Reject a mode the build does not know about, rather than defaulting silently. */
function checkMode(player: Player, mode: unknown): mode is GameMode {
  if (typeof mode === "string" && (GAME_MODES as string[]).includes(mode)) return true;
  send(player.ws, { type: "error", error: `unknown mode: ${String(mode)}` });
  return false;
}

/** Reject a game that has not shipped yet, so no room or queue is ever created for it. */
function checkGame(player: Player, gameId: string): boolean {
  if (RELEASED_GAMES.has(gameId)) return true;
  send(player.ws, { type: "error", error: `game not available yet: ${gameId}` });
  return false;
}

/** Clamp a client-supplied control into something sane, or fall back. */
function sanitizeControl(tc: TimeControl | undefined): TimeControl {
  if (!tc || typeof tc.mainMs !== "number" || typeof tc.incrementMs !== "number") {
    return DEFAULT_TIME_CONTROL;
  }
  if (!Number.isFinite(tc.mainMs) || !Number.isFinite(tc.incrementMs)) return DEFAULT_TIME_CONTROL;
  return {
    mainMs: Math.min(Math.max(0, Math.floor(tc.mainMs)), MAX_MAIN_MS),
    incrementMs: Math.min(Math.max(0, Math.floor(tc.incrementMs)), MAX_INCREMENT_MS),
  };
}

function quickstart(
  player: Player,
  gameId: string,
  mode: GameMode,
  deck: string[],
  ranked: boolean,
  tc?: TimeControl,
): void {
  if (!checkGame(player, gameId)) return;
  if (!checkMode(player, mode)) return;
  if (!checkDeck(player, mode, deck)) return;
  player.deck = deck;
  player.gameId = gameId;
  player.mode = mode;
  player.timeControl = sanitizeControl(tc);

  const key = queueKey(gameId, mode, ranked);
  const waiting = quickQueues.get(key);
  if (waiting && isOpen(waiting) && waiting !== player) {
    quickQueues.delete(key);
    // The player who has been sitting in the queue set the terms; whoever
    // walks in second takes the room as it is. Both sides of a quick match
    // send the queue's own fixed clock, so in practice these agree.
    const control = waiting.timeControl ?? DEFAULT_TIME_CONTROL;
    const title = ranked ? "Ranked Match" : "Quick Match";
    startRoom(uniqueCode(), waiting, player, gameId, mode, title, control);
    return;
  }
  quickQueues.set(key, player);
  send(player.ws, { type: "waiting" });
}

function createRoom(
  player: Player,
  msg: { title: string; password?: string; gameId: string; mode: GameMode; deck: string[]; timeControl?: TimeControl },
): void {
  if (!checkGame(player, msg.gameId)) return;
  if (!checkMode(player, msg.mode)) return;
  if (!checkDeck(player, msg.mode, msg.deck)) return;
  player.deck = msg.deck;
  player.gameId = msg.gameId;
  player.mode = msg.mode;

  const code = uniqueCode();
  player.hosting = code;
  player.inLobby = code;
  const wr: WaitingRoom = {
    code,
    gameId: msg.gameId,
    mode: msg.mode,
    title: msg.title?.trim() || "Untitled room",
    password: msg.password?.trim() || undefined,
    timeControl: sanitizeControl(msg.timeControl),
    host: player,
    watchers: [],
  };
  waitingRooms.set(code, wr);
  send(player.ws, { type: "room-created", code });
  sendLobby(wr);
}

// ── the room lobby ───────────────────────────────────────────

function seatOf(wr: WaitingRoom, player: Player): Seat {
  if (wr.host === player) return "host";
  if (wr.guest === player) return "guest";
  return "watcher";
}

/** Push the seating to everyone in the room. Called on every change. */
function sendLobby(wr: WaitingRoom): void {
  wr.watchers = wr.watchers.filter(isOpen);
  const view = {
    code: wr.code,
    title: wr.title,
    gameId: wr.gameId,
    mode: wr.mode,
    locked: !!wr.password,
    timeControl: wr.timeControl,
    host: wr.host.nickname,
    guest: wr.guest?.nickname,
    guestTaken: !!wr.guest,
    watchers: wr.watchers.map((w) => w.nickname),
    watcherCap: MAX_SPECTATORS,
    canStart: !!wr.guest,
  };
  for (const person of everyoneIn(wr)) {
    send(person.ws, { type: "lobby", lobby: { ...view, you: seatOf(wr, person) } });
  }
}

function everyoneIn(wr: WaitingRoom): Player[] {
  return [wr.host, ...(wr.guest ? [wr.guest] : []), ...wr.watchers];
}

/**
 * Move between the free player seat and the stands.
 *
 * The host's seat is not up for grabs — they made the room, and handing it over
 * would need a whole negotiation for something nobody asked for.
 */
function takeSeat(player: Player, seat: Seat): void {
  const wr = player.inLobby ? waitingRooms.get(player.inLobby) : undefined;
  if (!wr) return send(player.ws, { type: "error", error: "not in a room" });
  if (wr.host === player) return send(player.ws, { type: "error", error: "the host keeps their seat" });

  if (seat === "guest") {
    if (wr.guest && wr.guest !== player) {
      return send(player.ws, { type: "error", error: "that seat is taken" });
    }
    // Sitting down means playing, and playing means a legal deck for this
    // room's mode — which a watcher was never asked for on the way in.
    const deck = player.decks?.[wr.mode] ?? [];
    if (!checkDeck(player, wr.mode, deck)) return;
    player.deck = deck;
    wr.watchers = wr.watchers.filter((w) => w !== player);
    wr.guest = player;
  } else if (!wr.watchers.includes(player)) {
    // Check before vacating. Clearing the seat first and *then* discovering the
    // stands were full left the player in neither — seated nowhere, still in
    // the room, and the seat they gave up already gone.
    if (wr.watchers.filter(isOpen).length >= MAX_SPECTATORS) {
      return send(player.ws, { type: "error", error: "the stands are full" });
    }
    if (wr.guest === player) wr.guest = undefined;
    wr.watchers.push(player);
  }
  sendLobby(wr);
}

/** Host only: begin, with whoever is seated. Watchers come along. */
function startFromLobby(player: Player): void {
  const wr = player.inLobby ? waitingRooms.get(player.inLobby) : undefined;
  if (!wr) return send(player.ws, { type: "error", error: "not in a room" });
  if (wr.host !== player) return send(player.ws, { type: "error", error: "only the host can start" });
  if (!wr.guest || !isOpen(wr.guest)) {
    return send(player.ws, { type: "error", error: "nobody is in the other seat" });
  }

  const watchers = wr.watchers.filter(isOpen);
  waitingRooms.delete(wr.code);
  for (const person of everyoneIn(wr)) person.inLobby = undefined;
  wr.host.hosting = undefined;

  const room = startRoom(wr.code, wr.host, wr.guest, wr.gameId, wr.mode, wr.title, wr.timeControl, {
    spectatable: true,
    password: wr.password,
  });
  // Everyone who was in the stands stays in them, without having to find the
  // room again in a list that no longer shows it as joinable.
  for (const watcher of watchers.slice(0, MAX_SPECTATORS)) {
    room.spectators.push(watcher);
    watcher.watching = room.code;
    send(watcher.ws, {
      type: "start",
      room: room.code,
      color: "w",
      gameId: room.gameId,
      mode: room.mode,
      timeControl: room.clock?.control ?? wr.timeControl,
      spectator: true,
      players: { w: room.conns.w.nickname, b: room.conns.b.nickname },
    });
  }
  broadcast(room, []);
}

function listRooms(player: Player): void {
  const list: RoomInfo[] = [];
  for (const wr of waitingRooms.values()) {
    if (!isOpen(wr.host)) continue;
    wr.watchers = wr.watchers.filter(isOpen);
    list.push({
      code: wr.code,
      title: wr.title,
      gameId: wr.gameId,
      mode: wr.mode,
      locked: !!wr.password,
      players: wr.guest ? 2 : 1,
      live: false,
      spectators: wr.watchers.length,
    });
  }
  // Matches already under way, so there is something to watch. Quick matches
  // are not watchable and so are not listed — they would only ever be a row
  // with a disabled button on it.
  for (const room of rooms.values()) {
    if (!room.spectatable || room.engine.isEnded()) continue;
    room.spectators = room.spectators.filter(isOpen);
    list.push({
      code: room.code,
      title: room.title,
      gameId: room.gameId,
      mode: room.mode,
      locked: !!room.password,
      players: 2,
      live: true,
      spectators: room.spectators.length,
    });
  }
  send(player.ws, { type: "room-list", rooms: list });
}

function joinRoom(
  player: Player,
  msg: { code: string; password?: string; decks: Partial<Record<GameMode, string[]>> },
): void {
  const code = msg.code?.trim().toLowerCase() ?? "";
  const wr = waitingRooms.get(code);
  if (!wr || !isOpen(wr.host)) {
    if (wr) waitingRooms.delete(wr.code);
    // The room list they clicked may be a few seconds stale. If the match has
    // since begun, put them in the stands rather than telling them a room they
    // can see does not exist.
    if (rooms.has(code)) return spectate(player, msg);
    return send(player.ws, { type: "join-failed", reason: "Room not found" });
  }
  if (wr.password && wr.password !== (msg.password ?? "").trim()) {
    return send(player.ws, { type: "join-failed", reason: "Wrong password" });
  }

  // Kept for later: a watcher who moves into the player seat needs a deck for
  // this room's mode, and this is the only time the client offers one.
  player.decks = msg.decks;
  player.gameId = wr.gameId;
  player.mode = wr.mode;
  player.inLobby = wr.code;

  // The free player seat if there is one, the stands otherwise. Taking the
  // seat means bringing a legal deck for the mode; watching does not.
  const deck = msg.decks?.[wr.mode] ?? [];
  if (!wr.guest && checkDeckRules(wr.mode, deck).ok) {
    player.deck = deck;
    wr.guest = player;
  } else if (wr.watchers.length < MAX_SPECTATORS) {
    wr.watchers.push(player);
  } else {
    player.inLobby = undefined;
    return send(player.ws, { type: "join-failed", reason: "That room is full" });
  }
  sendLobby(wr);
}

/**
 * Take a seat in the stands.
 *
 * Everything a joiner is refused for, a watcher is refused for too — wrong
 * code, wrong password — plus two of its own: the room has to be one somebody
 * created by hand, and the stands have to have room.
 */
function spectate(player: Player, msg: { code: string; password?: string }): void {
  const code = msg.code?.trim().toLowerCase() ?? "";
  const room = rooms.get(code);
  // A room that exists but has not started yet is a room to *join*, and saying
  // so is more use than "not found" when the code is right.
  if (!room) {
    const reason = waitingRooms.has(code) ? "That match has not started yet" : "Room not found";
    return send(player.ws, { type: "join-failed", reason });
  }
  if (!room.spectatable) {
    return send(player.ws, { type: "join-failed", reason: "This match cannot be watched" });
  }
  if (room.password && room.password !== (msg.password ?? "").trim()) {
    return send(player.ws, { type: "join-failed", reason: "Wrong password" });
  }
  // Drop any watcher whose socket died without a close, so a room does not
  // stay full of ghosts.
  room.spectators = room.spectators.filter(isOpen);
  if (room.spectators.length >= MAX_SPECTATORS) {
    return send(player.ws, { type: "join-failed", reason: "That match already has three watchers" });
  }

  room.spectators.push(player);
  player.watching = room.code;
  send(player.ws, {
    type: "start",
    room: room.code,
    // Watchers see the board from white's side; there is no seat of their own.
    color: "w",
    gameId: room.gameId,
    mode: room.mode,
    timeControl: room.clock?.control ?? DEFAULT_TIME_CONTROL,
    spectator: true,
    players: { w: room.conns.w.nickname, b: room.conns.b.nickname },
  });
  // Send the position straight away rather than making them wait for whatever
  // the players do next — a watcher who joins mid-think would otherwise sit in
  // front of an empty screen.
  sendSpectatorState(room, player, []);
  // The players get a fresh count so they can see someone walked in.
  broadcast(room, []);
}

function cancel(player: Player): void {
  for (const [key, p] of quickQueues) if (p === player) quickQueues.delete(key);
  leaveLobby(player);
}

/**
 * Take someone out of a room that has not started.
 *
 * The host leaving dissolves it — the room is theirs, and there is no rule for
 * who would inherit it. Anyone else just frees their seat, and the people still
 * in the room are told so the empty chair shows up straight away.
 */
function leaveLobby(player: Player): void {
  const code = player.inLobby ?? player.hosting;
  player.inLobby = undefined;
  if (!code) return;
  const wr = waitingRooms.get(code);
  if (!wr) {
    player.hosting = undefined;
    return;
  }

  if (wr.host === player) {
    waitingRooms.delete(code);
    player.hosting = undefined;
    for (const person of everyoneIn(wr)) {
      if (person === player) continue;
      person.inLobby = undefined;
      send(person.ws, { type: "join-failed", reason: "The host closed the room" });
    }
    return;
  }

  if (wr.guest === player) wr.guest = undefined;
  wr.watchers = wr.watchers.filter((w) => w !== player);
  sendLobby(wr);
}

function startRoom(
  code: string,
  white: Player,
  black: Player,
  gameId: string,
  mode: GameMode,
  title: string,
  control: TimeControl,
  /** Watchability travels with the room, and only a hand-made room has it. */
  open: { spectatable: boolean; password?: string } = { spectatable: false },
): Room {
  white.color = "w";
  black.color = "b";
  white.roomId = code;
  black.roomId = code;
  white.hosting = undefined;
  const room: Room = {
    code,
    gameId,
    mode,
    title,
    engine: makeEngine(gameId, mode, white.deck, black.deck),
    conns: { w: white, b: black },
    rematch: { w: false, b: false },
    clock: null,
    spectators: [],
    spectatable: open.spectatable,
    password: open.password,
  };
  rooms.set(code, room);
  send(white.ws, { type: "start", room: code, color: "w", gameId, mode, timeControl: control, opponent: black.nickname });
  send(black.ws, { type: "start", room: code, color: "b", gameId, mode, timeControl: control, opponent: white.nickname });
  armClock(room, control);
  broadcast(room, []);
  return room;
}

// ── clocks ───────────────────────────────────────────────────

/** Put a fresh clock on the room and start it on whoever moves first. */
function armClock(room: Room, control: TimeControl): void {
  if (control.mainMs === 0 && control.incrementMs === 0) {
    room.clock = null;
    return;
  }
  room.clock = {
    control,
    left: { w: control.mainMs, b: control.mainMs },
    running: room.engine.turn(),
    since: Date.now(),
    timer: undefined,
  };
  armFlagTimer(room);
}

/** Charge the running side for the time since its window opened. */
function settleClock(clock: RoomClock): void {
  const now = Date.now();
  clock.left[clock.running] = Math.max(0, clock.left[clock.running] - (now - clock.since));
  clock.since = now;
}

/**
 * Wake up exactly when the running side would hit zero. Without this a player
 * who simply stops sending anything would never flag — nothing else on the
 * server is scheduled to look at the clock.
 */
function armFlagTimer(room: Room): void {
  const clock = room.clock;
  if (!clock) return;
  if (clock.timer) clearTimeout(clock.timer);
  clock.timer = setTimeout(() => {
    clock.timer = undefined;
    settleClock(clock);
    if (clock.left[clock.running] > 0) return armFlagTimer(room); // woke early
    const events = room.engine.flagOut(clock.running);
    stopClock(room);
    broadcast(room, events);
  }, Math.max(0, clock.left[clock.running]));
}

function stopClock(room: Room): void {
  if (!room.clock?.timer) return;
  clearTimeout(room.clock.timer);
  room.clock.timer = undefined;
}

/** After an accepted action: bank the mover's increment, hand over the clock. */
function turnClockOver(room: Room): void {
  const clock = room.clock;
  if (!clock) return;
  settleClock(clock);
  if (room.engine.isEnded()) return stopClock(room);
  const next = room.engine.turn();
  // The same side still being on the hook means the action didn't finish a
  // turn (a multi-step skill, or an extra turn). Increment is a reward for
  // handing the clock over, so nothing is banked and the clock keeps burning.
  if (next !== clock.running) {
    clock.left[clock.running] += clock.control.incrementMs;
    clock.running = next;
  }
  armFlagTimer(room);
}

// ── in-match ─────────────────────────────────────────────────

function act(player: Player, action: unknown): void {
  // A watcher has no seat and no colour, so this would fall out of the check
  // below anyway — but "not in a match" is a confusing thing to tell someone
  // who is very much looking at one.
  if (player.watching) return send(player.ws, { type: "error", error: "watching, not playing" });
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (!room || !player.color) return send(player.ws, { type: "error", error: "not in a match" });
  if (player.color !== room.engine.turn()) return send(player.ws, { type: "error", error: "not your turn" });

  const res = room.engine.apply(action, player.color);
  if (!res.ok) return send(player.ws, { type: "error", error: res.error });
  turnClockOver(room);
  broadcast(room, res.events);
}

function rematch(player: Player): void {
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (!room || !player.color) return send(player.ws, { type: "error", error: "not in a match" });
  if (!room.engine.isEnded()) return; // only offer after a game finishes

  room.rematch[player.color] = true;
  if (!room.rematch.w || !room.rematch.b) {
    return send(player.ws, { type: "rematch-waiting" });
  }
  room.rematch = { w: false, b: false };
  room.engine.reset();
  // A rematch is a new game: both clocks go back to the opening budget.
  stopClock(room);
  if (room.clock) armClock(room, room.clock.control);
  broadcast(room, []);
}

function broadcast(room: Room, events: MatchEvent[]): void {
  const turn = room.engine.turn();
  const status = room.engine.isEnded() ? "ended" : "playing";
  const winner = room.engine.winner();
  // Settle first so the numbers on the wire are current as of this message.
  if (room.clock && !room.engine.isEnded()) settleClock(room.clock);
  const clocks = room.clock ? { ...room.clock.left } : undefined;
  room.spectators = room.spectators.filter(isOpen);
  const watching = room.spectators.length;
  for (const color of ["w", "b"] as Color[]) {
    send(room.conns[color].ws, {
      type: "state",
      state: room.engine.view(color),
      events,
      turn,
      status,
      winner,
      clocks,
      spectators: watching,
    });
  }
  // One filtered state serves every watcher: they are all entitled to exactly
  // the same thing, which is neither player's hidden half.
  if (watching === 0) return;
  const view = room.engine.spectatorView();
  for (const watcher of room.spectators) {
    send(watcher.ws, {
      type: "state",
      state: view,
      events,
      turn,
      status,
      winner,
      clocks,
      spectators: watching,
    });
  }
}

/** The opening position for one watcher who has just walked in. */
function sendSpectatorState(room: Room, watcher: Player, events: MatchEvent[]): void {
  if (room.clock && !room.engine.isEnded()) settleClock(room.clock);
  send(watcher.ws, {
    type: "state",
    state: room.engine.spectatorView(),
    events,
    turn: room.engine.turn(),
    status: room.engine.isEnded() ? "ended" : "playing",
    winner: room.engine.winner(),
    clocks: room.clock ? { ...room.clock.left } : undefined,
    spectators: room.spectators.length,
  });
}

function onClose(player: Player): void {
  cancel(player); // drop from queues / delete hosted room

  // A watcher leaving is not an event in the match. Take them out of the stands
  // and tell the players the count moved; do not go near the teardown below.
  if (player.watching) {
    const watched = rooms.get(player.watching);
    player.watching = undefined;
    if (watched) {
      watched.spectators = watched.spectators.filter((p) => p !== player && isOpen(p));
      broadcast(watched, []);
    }
    return;
  }

  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (room) {
    const other = player.color === "w" ? room.conns.b : room.conns.w;
    send(other.ws, { type: "opponent-left" });
    // The room is going away under the watchers too, so they hear the same
    // thing rather than staring at a board that has stopped updating.
    for (const watcher of room.spectators) {
      watcher.watching = undefined;
      send(watcher.ws, { type: "opponent-left" });
    }
    stopClock(room); // the room is going away; don't leave a timer holding it
    rooms.delete(room.code);
  }
}

// ── helpers ──────────────────────────────────────────────────

function isOpen(p: Player): boolean {
  return p.ws.readyState === WebSocket.OPEN;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** A short code guaranteed not to collide with any live room. */
function uniqueCode(): string {
  let code = randomId();
  while (rooms.has(code) || waitingRooms.has(code)) code = randomId();
  return code;
}
