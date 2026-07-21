import { WebSocketServer, WebSocket } from "ws";
import {
  createMatch,
  isLegalDeck,
  reduce,
  type Action,
  type MatchEvent,
  type MatchState,
  type Rng,
} from "@skill/engine";
import type { Color } from "@skill/chess-core";
import { viewFor } from "./view.js";
import type { ClientMsg, ServerMsg } from "./protocol.js";

interface Player {
  ws: WebSocket;
  deck: string[];
  color?: Color;
  roomId?: string;
}

interface Room {
  id: string;
  rng: Rng;
  match: MatchState;
  conns: { w: Player; b: Player };
}

const rooms = new Map<string, Room>();
const namedWaiting = new Map<string, Player>(); // room code → first player
let autoQueue: Player | null = null;

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
  if (msg.type === "join") return join(player, msg.deck, msg.room);
  if (msg.type === "action") return act(player, msg.action);
}

function join(player: Player, deck: string[], room?: string): void {
  if (!Array.isArray(deck) || !isLegalDeck(deck)) {
    return send(player.ws, { type: "error", error: "illegal deck (max 5 cost)" });
  }
  player.deck = deck;

  if (room) {
    const waiting = namedWaiting.get(room);
    if (waiting && isOpen(waiting)) {
      namedWaiting.delete(room);
      return startRoom(room, waiting, player);
    }
    namedWaiting.set(room, player);
    return send(player.ws, { type: "waiting" });
  }

  if (autoQueue && isOpen(autoQueue)) {
    const other = autoQueue;
    autoQueue = null;
    return startRoom(randomId(), other, player);
  }
  autoQueue = player;
  send(player.ws, { type: "waiting" });
}

function startRoom(id: string, white: Player, black: Player): void {
  white.color = "w";
  black.color = "b";
  white.roomId = id;
  black.roomId = id;
  const room: Room = {
    id,
    rng: mulberry32((Math.random() * 2 ** 31) | 0), // server owns the RNG
    match: createMatch(white.deck, black.deck),
    conns: { w: white, b: black },
  };
  rooms.set(id, room);
  send(white.ws, { type: "start", room: id, color: "w" });
  send(black.ws, { type: "start", room: id, color: "b" });
  broadcast(room, []);
}

function act(player: Player, action: Action): void {
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (!room || !player.color) return send(player.ws, { type: "error", error: "not in a match" });

  // The client can only act as the side the engine expects next.
  const expected: Color = room.match.pending ? room.match.pending.color : room.match.chess.turn;
  if (player.color !== expected) return send(player.ws, { type: "error", error: "not your turn" });

  const res = reduce(room.match, action, room.rng);
  if (!res.ok) return send(player.ws, { type: "error", error: res.error });
  room.match = res.state;
  broadcast(room, res.events);
}

function broadcast(room: Room, events: MatchEvent[]): void {
  for (const color of ["w", "b"] as Color[]) {
    const p = room.conns[color];
    send(p.ws, {
      type: "state",
      state: viewFor(room.match, color),
      events,
      turn: room.match.chess.turn,
      status: room.match.status,
      winner: room.match.winner,
    });
  }
}

function onClose(player: Player): void {
  if (autoQueue === player) autoQueue = null;
  for (const [code, p] of namedWaiting) if (p === player) namedWaiting.delete(code);
  const room = player.roomId ? rooms.get(player.roomId) : undefined;
  if (room) {
    const other = player.color === "w" ? room.conns.b : room.conns.w;
    send(other.ws, { type: "opponent-left" });
    rooms.delete(room.id);
  }
}

function isOpen(p: Player): boolean {
  return p.ws.readyState === WebSocket.OPEN;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Small seeded PRNG so a room's randomness is reproducible for debugging. */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
