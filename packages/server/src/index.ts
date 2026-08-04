import { WebSocketServer, WebSocket } from "ws";
import { isLegalDeck, type MatchEvent } from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { makeEngine, type RoomEngine } from "./engine-adapter.js";
import type { ClientMsg, Clocks, RoomInfo, ServerMsg, TimeControl } from "./protocol.js";

interface Player {
  ws: WebSocket;
  deck: string[];
  gameId?: string;
  color?: Color;
  /** Time control this player asked for; the host's / first-queued wins. */
  timeControl?: TimeControl;
  /** Code of the active match this player is in, if any. */
  roomId?: string;
  /** Code of the not-yet-started room this player is hosting, if any. */
  hosting?: string;
}

/** A created room waiting for a second player. */
interface WaitingRoom {
  code: string;
  gameId: string;
  title: string;
  password?: string;
  timeControl: TimeControl;
  host: Player;
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
  title: string;
  engine: RoomEngine;
  conns: { w: Player; b: Player };
  /** Per-side rematch requests; both true → a fresh match starts. */
  rematch: { w: boolean; b: boolean };
  /** null for an untimed room. */
  clock: RoomClock | null;
}

/**
 * Games that are actually released. Janggi and gomoku are shown as coming-soon
 * in the client (`playable: false` in apps/client/src/games.ts) so it will not
 * ask for them — but the socket is public, so the gate lives here as well. Add
 * the ids here when those games launch; their engines are already wired up in
 * engine-adapter.ts, so that is the only change this file needs.
 */
const RELEASED_GAMES = new Set(["chess"]);

/** Used when a client asks for no particular clock: FIDE rapid, 15+10. */
const DEFAULT_TIME_CONTROL: TimeControl = { mainMs: 15 * 60_000, incrementMs: 10_000 };
/** Guard rails on a client-supplied control — 12h main, 5min increment. */
const MAX_MAIN_MS = 12 * 60 * 60_000;
const MAX_INCREMENT_MS = 5 * 60_000;

const rooms = new Map<string, Room>();
const waitingRooms = new Map<string, WaitingRoom>();
const quickQueues = new Map<string, Player>(); // gameId → first player waiting

const PORT = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port: PORT });
console.log(`[skill-server] listening on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  const player: Player = { ws, deck: [] };
  ws.on("message", (data) => {
    try {
      handle(player, JSON.parse(data.toString()) as ClientMsg);
    } catch {
      send(ws, { type: "error", error: "malformed message" });
    }
  });
  ws.on("close", () => onClose(player));
});

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(player: Player, msg: ClientMsg): void {
  switch (msg.type) {
    case "quickstart": return quickstart(player, msg.gameId, msg.deck, msg.timeControl);
    case "create-room": return createRoom(player, msg);
    case "list-rooms": return listRooms(player);
    case "join-room": return joinRoom(player, msg);
    case "cancel": return cancel(player);
    case "action": return act(player, msg.action);
    case "rematch": return rematch(player);
  }
}

// ── matchmaking ──────────────────────────────────────────────

function checkDeck(player: Player, deck: string[]): boolean {
  if (!Array.isArray(deck) || !isLegalDeck(deck)) {
    send(player.ws, { type: "error", error: "illegal deck (max 5 cost)" });
    return false;
  }
  return true;
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

function quickstart(player: Player, gameId: string, deck: string[], tc?: TimeControl): void {
  if (!checkGame(player, gameId)) return;
  if (!checkDeck(player, deck)) return;
  player.deck = deck;
  player.gameId = gameId;
  player.timeControl = sanitizeControl(tc);

  const waiting = quickQueues.get(gameId);
  if (waiting && isOpen(waiting) && waiting !== player) {
    quickQueues.delete(gameId);
    // The player who has been sitting in the queue set the terms; whoever
    // walks in second takes the room as it is.
    const control = waiting.timeControl ?? DEFAULT_TIME_CONTROL;
    return startRoom(uniqueCode(), waiting, player, gameId, "Quick Match", control);
  }
  quickQueues.set(gameId, player);
  send(player.ws, { type: "waiting" });
}

function createRoom(
  player: Player,
  msg: { title: string; password?: string; gameId: string; deck: string[]; timeControl?: TimeControl },
): void {
  if (!checkGame(player, msg.gameId)) return;
  if (!checkDeck(player, msg.deck)) return;
  player.deck = msg.deck;
  player.gameId = msg.gameId;

  const code = uniqueCode();
  player.hosting = code;
  waitingRooms.set(code, {
    code,
    gameId: msg.gameId,
    title: msg.title?.trim() || "Untitled room",
    password: msg.password?.trim() || undefined,
    timeControl: sanitizeControl(msg.timeControl),
    host: player,
  });
  send(player.ws, { type: "room-created", code });
}

function listRooms(player: Player): void {
  const list: RoomInfo[] = [];
  for (const wr of waitingRooms.values()) {
    if (!isOpen(wr.host)) continue;
    list.push({ code: wr.code, title: wr.title, gameId: wr.gameId, locked: !!wr.password, players: 1 });
  }
  send(player.ws, { type: "room-list", rooms: list });
}

function joinRoom(
  player: Player,
  msg: { code: string; password?: string; deck: string[] },
): void {
  const wr = waitingRooms.get(msg.code?.trim().toLowerCase());
  if (!wr || !isOpen(wr.host)) {
    if (wr) waitingRooms.delete(wr.code);
    return send(player.ws, { type: "join-failed", reason: "Room not found" });
  }
  if (wr.password && wr.password !== (msg.password ?? "").trim()) {
    return send(player.ws, { type: "join-failed", reason: "Wrong password" });
  }
  if (!checkDeck(player, msg.deck)) return;

  waitingRooms.delete(wr.code);
  wr.host.hosting = undefined;
  player.deck = msg.deck;
  player.gameId = wr.gameId;
  startRoom(wr.code, wr.host, player, wr.gameId, wr.title, wr.timeControl);
}

function cancel(player: Player): void {
  for (const [gameId, p] of quickQueues) if (p === player) quickQueues.delete(gameId);
  if (player.hosting) {
    waitingRooms.delete(player.hosting);
    player.hosting = undefined;
  }
}

function startRoom(
  code: string,
  white: Player,
  black: Player,
  gameId: string,
  title: string,
  control: TimeControl,
): void {
  white.color = "w";
  black.color = "b";
  white.roomId = code;
  black.roomId = code;
  white.hosting = undefined;
  const room: Room = {
    code,
    gameId,
    title,
    engine: makeEngine(gameId, white.deck, black.deck),
    conns: { w: white, b: black },
    rematch: { w: false, b: false },
    clock: null,
  };
  rooms.set(code, room);
  send(white.ws, { type: "start", room: code, color: "w", gameId, timeControl: control });
  send(black.ws, { type: "start", room: code, color: "b", gameId, timeControl: control });
  armClock(room, control);
  broadcast(room, []);
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
  for (const color of ["w", "b"] as Color[]) {
    send(room.conns[color].ws, {
      type: "state",
      state: room.engine.view(color),
      events,
      turn,
      status,
      winner,
      clocks,
    });
  }
}

function onClose(player: Player): void {
  cancel(player); // drop from queues / delete hosted room
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (room) {
    const other = player.color === "w" ? room.conns.b : room.conns.w;
    send(other.ws, { type: "opponent-left" });
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
