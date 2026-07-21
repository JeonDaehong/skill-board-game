import { describe, expect, it } from "vitest";
import { initialState, parseFen, toFen, START_FEN, algebraicToSquare } from "./board.js";
import { perft } from "./perft.js";
import { ChessGame, getStatus } from "./game.js";
import { generateLegalMoves, isInCheck } from "./moves.js";
import type { SkillRules } from "./types.js";

describe("FEN round-trip", () => {
  it("parses and re-serializes the start position", () => {
    expect(toFen(initialState())).toBe(START_FEN);
  });
});

describe("perft: standard start position", () => {
  it("depth 1 = 20", () => expect(perft(initialState(), 1)).toBe(20));
  it("depth 2 = 400", () => expect(perft(initialState(), 2)).toBe(400));
  it("depth 3 = 8902", () => expect(perft(initialState(), 3)).toBe(8902));
  it("depth 4 = 197281", () => expect(perft(initialState(), 4)).toBe(197281));
});

describe("perft: Kiwipete (castling, en passant, promotions)", () => {
  const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  it("depth 1 = 48", () => expect(perft(parseFen(fen), 1)).toBe(48));
  it("depth 2 = 2039", () => expect(perft(parseFen(fen), 2)).toBe(2039));
  it("depth 3 = 97862", () => expect(perft(parseFen(fen), 3)).toBe(97862));
});

describe("game status", () => {
  it("detects Fool's mate (checkmate)", () => {
    const g = new ChessGame();
    g.move(algebraicToSquare("f2"), algebraicToSquare("f3"));
    g.move(algebraicToSquare("e7"), algebraicToSquare("e5"));
    g.move(algebraicToSquare("g2"), algebraicToSquare("g4"));
    g.move(algebraicToSquare("d8"), algebraicToSquare("h4"));
    expect(g.getStatus()).toBe("checkmate");
    expect(g.isGameOver()).toBe(true);
    expect(g.getWinner()).toBe("b");
  });

  it("detects a stalemate position", () => {
    const state = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(getStatus(state)).toBe("stalemate");
  });

  it("rejects illegal moves and allows legal ones", () => {
    const g = new ChessGame();
    expect(g.move(algebraicToSquare("e2"), algebraicToSquare("e5"))).toBeNull();
    expect(g.move(algebraicToSquare("e2"), algebraicToSquare("e4"))).not.toBeNull();
    expect(g.getTurn()).toBe("b");
  });
});

describe("skill: 농민 봉기 (pawn captures forward)", () => {
  const revolt: SkillRules = { peasantRevolt: { w: true } };

  it("standard pawn cannot capture straight ahead", () => {
    // White pawn e4, black pawn e5 directly in front.
    const state = parseFen("4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1");
    const e4 = algebraicToSquare("e4");
    const e5 = algebraicToSquare("e5");
    const moves = generateLegalMoves(state, e4);
    expect(moves.some((m) => m.to === e5)).toBe(false);
  });

  it("with 농민 봉기, the pawn captures the piece ahead", () => {
    const state = parseFen("4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1");
    const e4 = algebraicToSquare("e4");
    const e5 = algebraicToSquare("e5");
    const moves = generateLegalMoves(state, e4, revolt);
    expect(moves.some((m) => m.to === e5 && m.captured?.type === "p")).toBe(true);
  });

  it("a forward-capturing pawn gives check to the king in front", () => {
    // Black king e7, white pawn e6 directly in front.
    const state = parseFen("8/4k3/4P3/8/8/8/4K3/8 b - - 0 1");
    expect(isInCheck(state, "b")).toBe(false);
    expect(isInCheck(state, "b", revolt)).toBe(true);
  });
});

describe("skill: 민첩한 나이트 (elephant jump)", () => {
  const agile: SkillRules = { agileKnight: { w: true } };

  it("adds the (±2,+3) forward jump for white knights", () => {
    // White knight on d1; empty board otherwise (plus kings).
    const state = parseFen("4k3/8/8/8/8/8/8/3NK3 w - - 0 1");
    const d1 = algebraicToSquare("d1");
    const targets = generateLegalMoves(state, d1).map((m) => m.to);
    const targetsAgile = generateLegalMoves(state, d1, agile).map((m) => m.to);
    // f4 = d1 + (2,3); b4 = d1 + (-2,3). Not reachable by a normal knight.
    expect(targets).not.toContain(algebraicToSquare("f4"));
    expect(targetsAgile).toContain(algebraicToSquare("f4"));
    expect(targetsAgile).toContain(algebraicToSquare("b4"));
  });
});

describe("skill: 혼란 (rook/bishop role swap)", () => {
  const chaos: SkillRules = { chaos: true };

  it("bishop moves orthogonally, rook moves diagonally", () => {
    // White bishop d4, white rook a1.
    const state = parseFen("4k3/8/8/8/3B4/8/8/R3K3 w - - 0 1");
    const d4 = algebraicToSquare("d4");
    const a1 = algebraicToSquare("a1");
    const bishop = generateLegalMoves(state, d4, chaos).map((m) => m.to);
    const rook = generateLegalMoves(state, a1, chaos).map((m) => m.to);
    // Bishop now reaches straight squares (d5), not diagonal-only.
    expect(bishop).toContain(algebraicToSquare("d5"));
    expect(bishop).toContain(algebraicToSquare("h4"));
    // Rook now reaches a diagonal square (b2).
    expect(rook).toContain(algebraicToSquare("b2"));
    expect(rook).not.toContain(algebraicToSquare("a2"));
  });
});

describe("skill: 유령 기물 (jump over allies)", () => {
  const phantom: SkillRules = { phantom: { w: true } };

  it("rook passes over a friendly pawn to reach squares beyond", () => {
    // White rook a1, friendly pawn a2. Normally the rook is blocked on the file.
    const state = parseFen("4k3/8/8/8/8/8/P7/R3K3 w - - 0 1");
    const a1 = algebraicToSquare("a1");
    const normal = generateLegalMoves(state, a1).map((m) => m.to);
    const ghost = generateLegalMoves(state, a1, phantom).map((m) => m.to);
    expect(normal).not.toContain(algebraicToSquare("a3"));
    // Jumps over a2 to a3, a4, ... but cannot land on the friendly pawn a2.
    expect(ghost).toContain(algebraicToSquare("a3"));
    expect(ghost).toContain(algebraicToSquare("a4"));
    expect(ghost).not.toContain(algebraicToSquare("a2"));
  });
});

describe("skill: 철벽 방어 (protected piece can't be captured)", () => {
  it("excludes captures onto a protected square but still blocks sliders", () => {
    // White queen d1, black rook d5 in front; queen would capture on d5.
    const state = parseFen("4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1");
    const d1 = algebraicToSquare("d1");
    const d5 = algebraicToSquare("d5");
    const d6 = algebraicToSquare("d6");
    const normal = generateLegalMoves(state, d1).map((m) => m.to);
    const guarded = generateLegalMoves(state, d1, { protected: [d5] }).map((m) => m.to);
    expect(normal).toContain(d5); // normally capturable
    expect(guarded).not.toContain(d5); // protected: no capture
    expect(guarded).not.toContain(d6); // still blocked by the piece
  });
});
