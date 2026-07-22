import { WebSocketServer, WebSocket } from "ws";
import { isLegalDeck, type MatchEvent } from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { makeEngine, type RoomEngine } from "./engine-adapter.js";
import type { ClientMsg, RoomInfo, ServerMsg } from "./protocol.js";

interface Player {
  ws: WebSocket;
  deck: string[];
  gameId?: string;
  color?: Color;
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
  host: Player;
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
}

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
    case "quickstart": return quickstart(player, msg.gameId, msg.deck);
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

function quickstart(player: Player, gameId: string, deck: string[]): void {
  if (!checkDeck(player, deck)) return;
  player.deck = deck;
  player.gameId = gameId;

  const waiting = quickQueues.get(gameId);
  if (waiting && isOpen(waiting) && waiting !== player) {
    quickQueues.delete(gameId);
    return startRoom(uniqueCode(), waiting, player, gameId, "빠른 대전");
  }
  quickQueues.set(gameId, player);
  send(player.ws, { type: "waiting" });
}

function createRoom(
  player: Player,
  msg: { title: string; password?: string; gameId: string; deck: string[] },
): void {
  if (!checkDeck(player, msg.deck)) return;
  player.deck = msg.deck;
  player.gameId = msg.gameId;

  const code = uniqueCode();
  player.hosting = code;
  waitingRooms.set(code, {
    code,
    gameId: msg.gameId,
    title: msg.title?.trim() || "이름 없는 방",
    password: msg.password?.trim() || undefined,
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
    return send(player.ws, { type: "join-failed", reason: "방을 찾을 수 없습니다" });
  }
  if (wr.password && wr.password !== (msg.password ?? "").trim()) {
    return send(player.ws, { type: "join-failed", reason: "비밀번호가 틀렸습니다" });
  }
  if (!checkDeck(player, msg.deck)) return;

  waitingRooms.delete(wr.code);
  wr.host.hosting = undefined;
  player.deck = msg.deck;
  player.gameId = wr.gameId;
  startRoom(wr.code, wr.host, player, wr.gameId, wr.title);
}

function cancel(player: Player): void {
  for (const [gameId, p] of quickQueues) if (p === player) quickQueues.delete(gameId);
  if (player.hosting) {
    waitingRooms.delete(player.hosting);
    player.hosting = undefined;
  }
}

function startRoom(code: string, white: Player, black: Player, gameId: string, title: string): void {
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
  };
  rooms.set(code, room);
  send(white.ws, { type: "start", room: code, color: "w", gameId });
  send(black.ws, { type: "start", room: code, color: "b", gameId });
  broadcast(room, []);
}

// ── in-match ─────────────────────────────────────────────────

function act(player: Player, action: unknown): void {
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (!room || !player.color) return send(player.ws, { type: "error", error: "not in a match" });
  if (player.color !== room.engine.turn()) return send(player.ws, { type: "error", error: "not your turn" });

  const res = room.engine.apply(action, player.color);
  if (!res.ok) return send(player.ws, { type: "error", error: res.error });
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
  broadcast(room, []);
}

function broadcast(room: Room, events: MatchEvent[]): void {
  const turn = room.engine.turn();
  const status = room.engine.isEnded() ? "ended" : "playing";
  const winner = room.engine.winner();
  for (const color of ["w", "b"] as Color[]) {
    send(room.conns[color].ws, {
      type: "state",
      state: room.engine.view(color),
      events,
      turn,
      status,
      winner,
    });
  }
}

function onClose(player: Player): void {
  cancel(player); // drop from queues / delete hosted room
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (room) {
    const other = player.color === "w" ? room.conns.b : room.conns.w;
    send(other.ws, { type: "opponent-left" });
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
