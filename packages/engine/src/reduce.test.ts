import { describe, expect, it } from "vitest";
import { algebraicToSquare, parseFen } from "@skill/chess-core";
import { createMatch, deriveRules } from "./match.js";
import { reduce } from "./reduce.js";
import type { MatchState } from "./types.js";

const sq = algebraicToSquare;

function expectOk(r: ReturnType<typeof reduce>): MatchState {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.state;
}

function fenMatch(fen: string, white: string[] = [], black: string[] = []): MatchState {
  const m = createMatch(white, black);
  m.chess = parseFen(fen);
  m.rules = deriveRules(m);
  return m;
}

describe("reduce: normal moves", () => {
  it("applies a legal move and passes the turn", () => {
    const m = createMatch([], []);
    const s = expectOk(reduce(m, { type: "move", from: sq("e2"), to: sq("e4") }));
    expect(s.chess.board[sq("e4")]?.type).toBe("p");
    expect(s.chess.board[sq("e2")]).toBeNull();
    expect(s.chess.turn).toBe("b");
    // The input state is never mutated.
    expect(m.chess.board[sq("e2")]?.type).toBe("p");
  });

  it("rejects an illegal move", () => {
    const m = createMatch([], []);
    const r = reduce(m, { type: "move", from: sq("e2"), to: sq("e5") });
    expect(r.ok).toBe(false);
  });
});

describe("reduce: teleport", () => {
  it("swaps two own pieces, ends the turn, and sets cooldown", () => {
    const m = createMatch(["teleport"], []);
    const s = expectOk(reduce(m, { type: "teleport", a: sq("a1"), b: sq("b1") }));
    expect(s.chess.board[sq("a1")]?.type).toBe("n"); // was the knight
    expect(s.chess.board[sq("b1")]?.type).toBe("r"); // was the rook
    expect(s.chess.turn).toBe("b");
    expect(s.players.w.deck[0]!.cooldownRemaining).toBe(5);
  });

  it("rejects teleporting the king", () => {
    const m = createMatch(["teleport"], []);
    const r = reduce(m, { type: "teleport", a: sq("e1"), b: sq("d1") });
    expect(r.ok).toBe(false);
  });
});

describe("reduce: One More (extra turn)", () => {
  it("keeps the turn after the next move", () => {
    const m = createMatch(["one-more"], []);
    const afterSkill = expectOk(reduce(m, { type: "one-more" }));
    expect(afterSkill.chess.turn).toBe("w"); // skill itself doesn't pass the turn
    expect(afterSkill.players.w.extraTurnPending).toBe(true);
    const afterMove = expectOk(reduce(afterSkill, { type: "move", from: sq("e2"), to: sq("e4") }));
    expect(afterMove.chess.turn).toBe("w"); // extra turn kept it
    expect(afterMove.players.w.extraTurnPending).toBe(false);
  });
});

describe("reduce: gambler determinism", () => {
  it("evolve gives the same result for the same RNG", () => {
    const m = createMatch(["evolve-gamble"], []);
    const rng = () => 0; // roll 0 < 0.25 → success; floor(0*3) → bishop
    const a = expectOk(reduce(m, { type: "evolve", sq: sq("e2") }, rng));
    const b = expectOk(reduce(m, { type: "evolve", sq: sq("e2") }, rng));
    expect(a.chess.board[sq("e2")]?.type).toBe("b");
    expect(b.chess.board[sq("e2")]?.type).toBe("b");
  });

  it("evolve fails and buries the piece on a bad roll", () => {
    const m = createMatch(["evolve-gamble"], []);
    const s = expectOk(reduce(m, { type: "evolve", sq: sq("e2") }, () => 0.9));
    expect(s.chess.board[sq("e2")]).toBeNull();
    expect(s.players.w.grave).toContain("p");
  });
});

describe("reduce: reposition skills", () => {
  it("Retreat moves a pawn backward and ends the turn", () => {
    const m = fenMatch("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1", ["retreat"]);
    const s = expectOk(reduce(m, { type: "retreat", from: sq("e4"), to: sq("e3") }));
    expect(s.chess.board[sq("e3")]?.type).toBe("p");
    expect(s.chess.board[sq("e4")]).toBeNull();
    expect(s.chess.turn).toBe("b");
  });

  it("Raid March keeps the turn (no consume)", () => {
    const m = fenMatch("4k3/8/8/8/8/8/8/4KN2 w - - 0 1", ["raid-march"]);
    const s = expectOk(reduce(m, { type: "raid-march", from: sq("f1"), to: sq("f2") }));
    expect(s.chess.board[sq("f2")]?.type).toBe("n");
    expect(s.chess.turn).toBe("w"); // still the player's turn
  });
});

describe("reduce: Phantom (phantom jump)", () => {
  it("rook jumps its own pawn", () => {
    const m = fenMatch("4k3/8/8/8/8/8/P7/R3K3 w - - 0 1", ["phantom"]);
    const s = expectOk(reduce(m, { type: "phantom-move", from: sq("a1"), to: sq("a3") }));
    expect(s.chess.board[sq("a3")]?.type).toBe("r");
    expect(s.chess.turn).toBe("b");
    expect(s.players.w.deck[0]!.cooldownRemaining).toBe(3);
  });
});

describe("reduce: Sacrifice Pact (multi-step)", () => {
  it("sacrifices a piece, moves one, then ends", () => {
    const m = createMatch(["sacrifice-pact"], []);
    let s = expectOk(reduce(m, { type: "sacrifice-start", sq: sq("b2") }));
    expect(s.pending?.kind).toBe("sacrifice");
    expect(s.players.w.grave).toContain("p");
    s = expectOk(reduce(s, { type: "sacrifice-move", from: sq("e2"), to: sq("e4") }));
    expect(s.chess.turn).toBe("w"); // still the caster's turn mid-skill
    s = expectOk(reduce(s, { type: "sacrifice-end" }));
    expect(s.chess.turn).toBe("b");
    expect(s.chess.board[sq("e4")]?.type).toBe("p");
    expect(s.pending).toBeNull();
  });

  it("rejects a normal move while a skill is pending", () => {
    const m = createMatch(["sacrifice-pact"], []);
    const s = expectOk(reduce(m, { type: "sacrifice-start", sq: sq("b2") }));
    expect(reduce(s, { type: "move", from: sq("a2"), to: sq("a3") }).ok).toBe(false);
  });
});

describe("reduce: Revive (gamble + placement)", () => {
  it("revives a dead piece on success, then places it (turn kept)", () => {
    const m = createMatch(["revive-gamble"], []);
    m.players.w.grave = ["r"];
    let s = expectOk(reduce(m, { type: "revive", fuel: sq("e2") }, () => 0.1));
    expect(s.pending?.kind).toBe("revive-place");
    s = expectOk(reduce(s, { type: "revive-place", sq: sq("e4") }));
    expect(s.chess.board[sq("e4")]).toEqual({ color: "w", type: "r" });
    expect(s.players.w.grave).not.toContain("r");
    expect(s.players.w.lockedFrom).toBe(sq("e4"));
    expect(s.chess.turn).toBe("w"); // Revive does not consume the turn
  });
});

describe("reduce: Undo (undo)", () => {
  it("reverts the opponent's last move and locks that piece", () => {
    let s = createMatch(["undo"], []);
    s = expectOk(reduce(s, { type: "move", from: sq("e2"), to: sq("e4") }));
    s = expectOk(reduce(s, { type: "move", from: sq("e7"), to: sq("e5") }));
    s = expectOk(reduce(s, { type: "undo" }));
    expect(s.chess.board[sq("e5")]).toBeNull(); // black's move undone
    expect(s.chess.board[sq("e7")]?.type).toBe("p");
    expect(s.chess.board[sq("e4")]?.type).toBe("p"); // white's earlier move stands
    expect(s.chess.turn).toBe("b");
    expect(s.players.b.lockedFrom).toBe(sq("e7"));
  });
});

describe("reduce: Liberation (liberation)", () => {
  it("turns rooks/bishops/knights into queens with a 5-turn timer", () => {
    const m = createMatch(["liberation"], []);
    const s = expectOk(reduce(m, { type: "liberation" }));
    expect(s.chess.board[sq("a1")]?.type).toBe("q");
    expect(s.chess.board[sq("b1")]?.type).toBe("q");
    expect(s.players.w.tempQueens).toHaveLength(6);
    expect(s.players.w.tempQueensTurnsLeft).toBe(5);
  });
});

describe("reduce: Titan (titan)", () => {
  it("fuses king + front queen + side rooks", () => {
    const m = fenMatch("4k3/8/8/8/8/8/4Q3/3RKR2 w - - 0 1", ["titan-fusion"]);
    const s = expectOk(reduce(m, { type: "titan-fuse" }));
    expect(s.titan?.hp).toBe(3);
    expect([...(s.titan?.cells ?? [])].sort((a, b) => a - b)).toEqual(
      [sq("d1"), sq("e1"), sq("f1"), sq("e2")].sort((a, b) => a - b),
    );
    expect(s.chess.board[sq("e1")]).toBeNull();
    expect(s.chess.turn).toBe("b");
  });

  it("crushes the enemy king to win", () => {
    const m = createMatch([], []);
    m.chess = parseFen("8/8/8/4k3/8/8/8/8 w - - 0 1"); // lone black king on e5
    m.titan = { owner: "w", cells: [sq("e1"), sq("e2"), sq("d1"), sq("f1")], hp: 3 };
    const dest = [sq("e4"), sq("e5"), sq("d4"), sq("f4")];
    const s = expectOk(reduce(m, { type: "titan-move", cells: dest }));
    expect(s.status).toBe("ended");
    expect(s.winner).toBe("w");
  });
});

describe("reduce: death intercept", () => {
  const foolsMate = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";

  it("Loyal Vassal saves the king from checkmate", () => {
    const m = fenMatch(foolsMate, ["loyal-vassal"], []); // white holds the skill
    const s = expectOk(reduce(m, { type: "move", from: sq("d8"), to: sq("h4") }));
    expect(s.status).toBe("playing"); // survived the mate
    expect(s.players.w.deck[0]!.usesLeft).toBe(0);
  });

  it("King's Return removes the king and awaits a revival placement", () => {
    const m = fenMatch(foolsMate, ["kings-return"], []);
    const s = expectOk(reduce(m, { type: "move", from: sq("d8"), to: sq("h4") }));
    expect(s.status).toBe("playing");
    expect(s.pending?.kind).toBe("kings-return");
    const placed = expectOk(reduce(s, { type: "kings-return-place", sq: sq("a3") }));
    expect(placed.chess.board[sq("a3")]?.type).toBe("k");
    expect(placed.pending).toBeNull();
    expect(placed.chess.turn).toBe("b");
  });
});
